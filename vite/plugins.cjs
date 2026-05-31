const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { parse: acornParse } = require("acorn");
const ts = require("./projectRequire")("typescript");
const createControllerProxyTransformer = require("./controllerProxyTransformer");
const createGameObjectNameTransformer = require("./gameObjectNameTransformer");
const { stripTexturePackImages } = require("../scripts/stripTexturePackImages.cjs");

function bareShaderRawPlugin() {
    return {
        name: "bare:shader-raw",
        enforce: "pre",
        load(id) {
            const filePath = cleanId(id);
            if (!/\.(frag|vert)$/.test(filePath)) {
                return null;
            }

            const source = fs.readFileSync(filePath, "utf8");
            return `export default ${JSON.stringify(source)};`;
        }
    };
}

function bareTypeScriptTransformPlugin(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const tsconfigPath = options.tsconfigPath || findTsconfig(projectRoot);
    const useTypeChecker = options.useTypeChecker !== false;
    const hotRestart = options.hotRestart !== false;
    const include = options.include || ((filePath) => {
        const normalized = normalize(filePath);
        return normalized.startsWith(normalize(path.join(projectRoot, "src")))
            || normalized.includes("/node_modules/bare-engine/src/")
            || normalized.startsWith(normalize(path.resolve(__dirname, "../src")));
    });

    const parsed = readTsconfig(tsconfigPath);
    const compilerOptions = {
        ...parsed.options,
        noEmit: false,
        sourceMap: true,
        inlineSources: true,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020
    };

    return {
        name: "bare:typescript-transformers",
        enforce: "pre",
        transform(code, id) {
            const filePath = cleanId(id);
            if (!/\.[cm]?tsx?$/.test(filePath) || /\.d\.ts$/.test(filePath)) {
                return null;
            }
            if (filePath.includes("/node_modules/") && !filePath.includes("/node_modules/bare-engine/")) {
                return null;
            }
            if (!include(filePath)) {
                return null;
            }

            const result = useTypeChecker
                ? emitTransformedTs(filePath, code, compilerOptions)
                : transpileTransformedTs(filePath, code, compilerOptions);
            const shouldAppendHotRestart = hotRestart && hasStartBareCall(code, filePath);
            return result ? {
                code: shouldAppendHotRestart ? appendHotRestart(result.code) : result.code,
                map: result.map
            } : null;
        }
    };
}

const ENGINE_GAMEOBJECT_BASES = new Set([
    "GameObject",
    "ArcadeObject",
    "Button",
    "TextObject"
]);

const ENGINE_COMPONENT_BASES = new Set([
    "Component",
    "AnimationComponent",
    "CollisionEventComponent",
    "ParticleComponent",
    "PivotComponent",
    "PivotRemoveComponent",
    "PositionPivotComponent",
    "ResizableComponent",
    "ResizableRemoveComponent"
]);

function bareAutoRegisterClassesPlugin(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const srcDir = normalize(path.resolve(options.srcDir || path.join(projectRoot, "src")));
    const settingsDataPath = normalize(path.resolve(path.join(projectRoot, "public/data/settingsData.json")));

    const gameObjectBases = new Set([
        ...ENGINE_GAMEOBJECT_BASES,
        ...(options.extraGameObjectBases || [])
    ]);
    const componentBases = new Set([
        ...ENGINE_COMPONENT_BASES,
        ...(options.extraComponentBases || [])
    ]);

    // className -> { filePath, base, exported }
    const classMap = new Map();
    // normalized filePath -> Set<className>
    const fileClasses = new Map();
    let serverRef = null;
    let startBareFile = null;
    // Signature of the component class names referenced by settingsData.json, so a
    // save that doesn't change which components are referenced skips the reload.
    let settingsComponentSignature = null;

    function parseClasses(source) {
        // Optionally capture a leading decorator block (any number of decorators,
        // each possibly with arguments) so we can tell whether @InspectorBaseClass
        // is applied to the class.
        const classRegex = /((?:@[A-Za-z_$][\w$]*(?:\s*\([^)]*\))?\s+)*)(export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s*<[^>]*>)?(?:\s+extends\s+([A-Za-z_$][\w$]*))?/g;
        const out = [];
        let m;
        while ((m = classRegex.exec(source)) !== null) {
            const decorators = m[1] || "";
            out.push({
                name: m[3],
                base: m[4] || "",
                exported: !!m[2],
                inspectorBase: /@InspectorBaseClass\b/.test(decorators)
            });
        }
        return out;
    }

    function scanFile(filePath) {
        filePath = normalize(filePath);
        let source;
        try {
            source = fs.readFileSync(filePath, "utf8");
        } catch {
            unscanFile(filePath);
            return false;
        }

        const found = parseClasses(source);
        const prevNames = fileClasses.get(filePath) || new Set();
        const nextNames = new Set();

        let changed = false;
        for (const cls of found) {
            nextNames.add(cls.name);
            const prev = classMap.get(cls.name);
            if (!prev || prev.filePath !== filePath || prev.base !== cls.base || prev.exported !== cls.exported || prev.inspectorBase !== cls.inspectorBase) {
                changed = true;
            }
            classMap.set(cls.name, { filePath, base: cls.base, exported: cls.exported, inspectorBase: cls.inspectorBase });
        }
        for (const oldName of prevNames) {
            if (!nextNames.has(oldName)) {
                const existing = classMap.get(oldName);
                if (existing && existing.filePath === filePath) {
                    classMap.delete(oldName);
                }
                changed = true;
            }
        }

        if (nextNames.size === 0) {
            fileClasses.delete(filePath);
        } else {
            fileClasses.set(filePath, nextNames);
        }

        return changed;
    }

    function unscanFile(filePath) {
        filePath = normalize(filePath);
        const names = fileClasses.get(filePath);
        if (!names) return false;
        for (const name of names) {
            const existing = classMap.get(name);
            if (existing && existing.filePath === filePath) {
                classMap.delete(name);
            }
        }
        fileClasses.delete(filePath);
        return true;
    }

    function scanAll() {
        if (!fs.existsSync(srcDir)) return;
        for (const filePath of getFilesRecursive(srcDir)) {
            const norm = normalize(filePath);
            if (!/\.[cm]?[jt]sx?$/.test(norm) || /\.d\.ts$/.test(norm)) continue;
            scanFile(norm);
        }
    }

    function resolveKind(name) {
        const visited = new Set();
        let current = name;
        while (current && !visited.has(current)) {
            visited.add(current);
            const info = classMap.get(current);
            const base = info ? info.base : null;
            if (!base) return null;
            if (componentBases.has(base)) return "component";
            if (gameObjectBases.has(base)) return "gameobject";
            current = base;
        }
        return null;
    }

    // Collect component class names referenced by the project's settingsData.json.
    // Each entity may declare a `components` map whose keys are component names
    // (e.g. "shoot"), which the engine resolves to `<Capitalized>Component`
    // (e.g. "ShootComponent") at runtime.
    function getSettingsComponentClassNames() {
        const names = new Set();
        let raw;
        try {
            raw = fs.readFileSync(settingsDataPath, "utf8");
        } catch {
            return names;
        }
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            return names;
        }
        for (const group of [data.entities, data.baseEntities]) {
            if (!group || typeof group !== "object") continue;
            for (const entityName in group) {
                const components = group[entityName] && group[entityName].components;
                if (!components || typeof components !== "object") continue;
                for (const componentKey in components) {
                    names.add(componentKey.charAt(0).toUpperCase() + componentKey.slice(1) + "Component");
                }
            }
        }
        return names;
    }

    function computeSettingsComponentSignature() {
        return [...getSettingsComponentClassNames()].sort().join(",");
    }

    function getRegisteredClasses() {
        const out = [];
        const seen = new Set();
        for (const [name, info] of classMap) {
            if (!info.exported) continue;
            const kind = resolveKind(name);
            if (!kind) continue;
            // GameObjects must opt in via @InspectorBaseClass; components register regardless.
            if (kind === "gameobject" && !info.inspectorBase) continue;
            out.push({ name, filePath: info.filePath, kind });
            seen.add(name);
        }
        // Register components referenced by settingsData.json that the code scan
        // didn't already pick up. A project component must exist and be exported so
        // we can import it by path; an engine component (e.g. ParticleComponent) is
        // imported from the "bare-engine" package instead.
        for (const className of getSettingsComponentClassNames()) {
            if (seen.has(className)) continue;
            const info = classMap.get(className);
            if (info && info.exported) {
                out.push({ name: className, filePath: info.filePath, kind: "component" });
                seen.add(className);
            } else if (ENGINE_COMPONENT_BASES.has(className)) {
                out.push({ name: className, pkg: "bare-engine", kind: "component" });
                seen.add(className);
            }
        }
        out.sort((a, b) => a.name.localeCompare(b.name));
        return out;
    }

    function invalidateStartBareModule() {
        if (!serverRef || !startBareFile) return;
        const mods = serverRef.moduleGraph.getModulesByFile(startBareFile);
        if (!mods || mods.size === 0) return;
        for (const mod of mods) {
            serverRef.moduleGraph.invalidateModule(mod);
        }
        serverRef.ws.send({ type: "full-reload", path: "*" });
    }

    function onWatcherEvent(filePath, kind) {
        filePath = normalize(path.resolve(filePath));
        if (filePath === settingsDataPath) {
            // Only adding/removing a referenced component changes which classes get
            // registered. Editing anything else in settingsData (positions, values,
            // layers, ...) leaves registration identical, so skip the reload to avoid
            // disrupting every save made from the editor.
            const signature = computeSettingsComponentSignature();
            if (signature === settingsComponentSignature) {
                return;
            }
            settingsComponentSignature = signature;
            invalidateStartBareModule();
            return;
        }
        if (!filePath.startsWith(`${srcDir}/`)) return;
        if (!/\.[cm]?[jt]sx?$/.test(filePath) || /\.d\.ts$/.test(filePath)) return;

        const changed = kind === "unlink" ? unscanFile(filePath) : scanFile(filePath);
        if (changed) {
            invalidateStartBareModule();
        }
    }

    return {
        name: "bare:auto-register-classes",
        enforce: "pre",
        buildStart() {
            scanAll();
        },
        configureServer(server) {
            serverRef = server;
            settingsComponentSignature = computeSettingsComponentSignature();
            if (fs.existsSync(srcDir)) {
                server.watcher.add(srcDir);
            }
            server.watcher.add(settingsDataPath);
            server.watcher.on("add", (p) => onWatcherEvent(p, "add"));
            server.watcher.on("change", (p) => onWatcherEvent(p, "change"));
            server.watcher.on("unlink", (p) => onWatcherEvent(p, "unlink"));
        },
        transform(code, id) {
            const filePath = cleanId(id);
            if (!/\.[cm]?[jt]sx?$/.test(filePath) || /\.d\.ts$/.test(filePath)) {
                return null;
            }
            if (!normalize(path.resolve(filePath)).startsWith(`${srcDir}/`)) {
                return null;
            }

            const target = code.match(/\b(?:[A-Za-z_$][\w$]*\.)?StartBare\s*\(\s*([A-Za-z_$][\w$]*)/);
            if (!target) {
                return null;
            }

            startBareFile = normalize(path.resolve(filePath));

            // Make sure this file's class info is fresh (catches edits to the StartBare file itself)
            scanFile(startBareFile);

            const registrations = getRegisteredClasses().filter(c =>
                (!c.filePath || normalize(c.filePath) !== normalize(filePath))
                && !new RegExp(`\\bbare\\.AddClass\\s*\\(\\s*${c.name}\\s*\\)`).test(code)
            );
            if (registrations.length === 0) {
                return null;
            }

            const statements = registrations.map(c => `bare.AddClass(${c.name});`);
            const result = addStatementsToOnAwake(code, target[1], statements, filePath);
            if (result === code) {
                return null;
            }

            const imports = registrations
                .filter(c => !hasImportBinding(code, c.name))
                .map(c => `import { ${c.name} } from "${c.pkg || toImportPath(filePath, c.filePath)}";`);

            return {
                code: `${imports.join("\n")}${imports.length ? "\n" : ""}${result}`,
                map: null
            };
        }
    };
}

function addStatementsToOnAwake(code, className, statements, filePath) {
    const classIndex = code.search(new RegExp(`\\bclass\\s+${className}\\b`));
    if (classIndex < 0) {
        return code;
    }

    const classOpen = code.indexOf("{", classIndex);
    const classClose = findMatchingBrace(code, classOpen);
    if (classOpen < 0 || classClose < 0) {
        return code;
    }

    const classBody = code.slice(classOpen + 1, classClose);
    const awakeMatch = /\bOnAwake\s*\([^)]*\)\s*(?::[^{]+)?\{/.exec(classBody);
    const indent = detectIndent(code, classOpen);

    if (!awakeMatch) {
        const returnType = /\.[cm]?tsx?$/.test(filePath) ? ": void" : "";
        const method = `\n${indent}    OnAwake()${returnType}\n${indent}    {\n${indent}        ${statements.join(`\n${indent}        `)}\n${indent}    }\n`;
        return `${code.slice(0, classClose)}${method}${code.slice(classClose)}`;
    }

    const awakeOpen = classOpen + 1 + awakeMatch.index + awakeMatch[0].length - 1;
    return `${code.slice(0, awakeOpen + 1)}\n${indent}        ${statements.join(`\n${indent}        `)}${code.slice(awakeOpen + 1)}`;
}

function findMatchingBrace(code, openIndex) {
    if (openIndex < 0) {
        return -1;
    }

    let depth = 0;
    for (let i = openIndex; i < code.length; i++) {
        if (code[i] === "{") {
            depth++;
        } else if (code[i] === "}") {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}

function detectIndent(code, index) {
    const lineStart = code.lastIndexOf("\n", index) + 1;
    const match = /^[ \t]*/.exec(code.slice(lineStart, index));
    return match ? match[0] : "";
}

function hasImportBinding(code, name) {
    const importRegex = /import\s+[^;]+?from\s+["'][^"']+["']/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
        if (new RegExp(`\\b${name}\\b`).test(match[0])) {
            return true;
        }
    }
    return false;
}

function toImportPath(fromFile, toFile) {
    let importPath = normalize(path.relative(path.dirname(fromFile), toFile))
        .replace(/\.[cm]?[jt]sx?$/, "");
    if (!importPath.startsWith(".")) {
        importPath = `./${importPath}`;
    }
    return importPath;
}

function bareFullReloadPlugin(options = {}) {
    const roots = (options.roots || [
        path.resolve(__dirname, "../src")
    ]).map(root => normalize(path.resolve(root)));

    return {
        name: "bare:full-reload",
        handleHotUpdate(ctx) {
            const filePath = normalize(path.resolve(ctx.file));
            if (!roots.some(root => filePath.startsWith(root))) {
                return;
            }

            ctx.server.ws.send({ type: "full-reload", path: "*" });
            return [];
        }
    };
}

function bareIgnoreLevelJsonHotUpdatesPlugin(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const publicDir = normalize(path.resolve(options.publicDir || path.join(projectRoot, "public")));
    const levelDirs = (options.levelDirs || [
        path.join(projectRoot, "public/data/levels")
    ]).map(dir => normalize(path.resolve(dir)));

    return {
        name: "bare:ignore-level-json-hot-updates",
        handleHotUpdate(ctx) {
            const filePath = normalize(path.resolve(ctx.file));
            const isConfiguredLevelFile = levelDirs.some(dir => filePath.startsWith(`${dir}/`));
            const isPublicLevelFile = filePath.startsWith(`${publicDir}/`) && filePath.includes("/levels/");
            if (filePath.endsWith(".json") && (isConfiguredLevelFile || isPublicLevelFile)) {
                return [];
            }
        }
    };
}

function appendHotRestart(code) {
    const hmrCode = `
if (import.meta.hot) {
    import.meta.hot.accept();
}
`;

    const sourceMapMatch = code.match(/\n?\/\/# sourceMappingURL=.*\s*$/);
    if (!sourceMapMatch) {
        return `${code}${hmrCode}`;
    }

    return `${code.slice(0, sourceMapMatch.index)}${hmrCode}${sourceMapMatch[0]}`;
}

function hasStartBareCall(code, filePath) {
    const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);
    let found = false;

    function visit(node) {
        if (found) {
            return;
        }

        if (ts.isCallExpression(node)) {
            const expression = node.expression;
            if (ts.isIdentifier(expression) && expression.text === "StartBare") {
                found = true;
                return;
            }

            if (ts.isPropertyAccessExpression(expression) && expression.name.text === "StartBare") {
                found = true;
                return;
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return found;
}

function bareHtmlPlugin(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const indexHtmlPath = options.indexHtmlPath || path.resolve(__dirname, "../config/index.html");
    const projectPackage = readProjectPackage(projectRoot);
    const htmlOptions = projectPackage.bareEngine?.index || {};
    const title = htmlOptions.title || "Bare Game";
    const backgroundColor = htmlOptions.backgroundColor || "rgb(255, 255, 255)";
    const textColor = htmlOptions.textColor || "rgb(0, 0, 0)";
    const loadingTextStyle = htmlOptions.showLoading === false ? "display: none;" : "";
    const firstLevelLoad = resolveFirstLevelLoad(projectPackage.bareEngine?.firstLevelLoad);

    return {
        name: "bare:html",
        enforce: "pre",
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
                if (req.method !== "GET" || (requestUrl.pathname !== "/" && requestUrl.pathname !== "/index.html")) {
                    next();
                    return;
                }

                fs.readFile(indexHtmlPath, "utf8", async (error, html) => {
                    if (error) {
                        next();
                        return;
                    }

                    const transformed = await server.transformIndexHtml(requestUrl.pathname, html);
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "text/html; charset=utf-8");
                    res.end(transformed);
                });
            });
        },
        transformIndexHtml: {
            order: "pre",
            handler(html) {
                return html
                    .replace(/%BARE_TITLE%/g, escapeHtml(title))
                    .replace(/%BARE_BACKGROUND_COLOR%/g, backgroundColor)
                    .replace(/%BARE_TEXT_COLOR%/g, textColor)
                    .replace(/%BARE_LOADING_TEXT_STYLE%/g, loadingTextStyle)
                    .replace(/%BARE_FIRST_LEVEL_LOAD%/g, JSON.stringify(firstLevelLoad))
                    .replace("<!-- js:bootstrap -->", '<script type="module" src="/src/game.ts"></script>');
            }
        }
    };
}

function resolveFirstLevelLoad(value) {
    if (typeof value !== "string") {
        return "";
    }

    const levelName = value.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.json$/i, "");
    if (!levelName || levelName.split("/").some(part => !part || part === "." || part === "..")) {
        console.warn(`[bare:html] Ignoring invalid bareEngine.firstLevelLoad: ${JSON.stringify(value)}`);
        return "";
    }

    return levelName;
}

function bareInitialAssetsPlugin(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const folder = path.join(projectRoot, "public/initial");

    return {
        name: "bare:initial-assets",
        transformIndexHtml: {
            order: "post",
            handler(html) {
                return injectInitialAssets(html, folder);
            }
        },
        configureServer(server) {
            if (fs.existsSync(folder)) {
                server.watcher.add(folder);
            }
        }
    };
}

function bareGeneratedLayersPlugin(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const jsonPath = options.jsonPath || path.join(projectRoot, "public/data/settingsData.json");
    const outputPath = options.outputPath || path.join(projectRoot, "src/generated/layers.ts");

    return {
        name: "bare:generated-layers",
        buildStart() {
            generateLayers(jsonPath, outputPath);
            if (fs.existsSync(jsonPath)) {
                this.addWatchFile(jsonPath);
            }
        },
        configureServer(server) {
            generateLayers(jsonPath, outputPath);
            if (fs.existsSync(jsonPath)) {
                server.watcher.add(jsonPath);
            }
            server.watcher.on("change", (filePath) => {
                if (normalize(filePath) === normalize(jsonPath)) {
                    generateLayers(jsonPath, outputPath);
                }
            });
        }
    };
}

function bareEditorAndApiPlugin(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const editorHtmlPath = options.editorHtmlPath || path.resolve(__dirname, "../config/editor.html");
    const publicDir = path.join(projectRoot, "public");
    let skipReloadUntil = 0;
    let lastSettingsDataPath = "";
    let shouldEmitEditorHtml = false;

    return {
        name: "bare:editor-api",
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const requestUrl = new URL(req.url || "/", "http://127.0.0.1");

                if (req.method === "GET" && (requestUrl.pathname === "/editor" || requestUrl.pathname === "/editor.html")) {
                    sendFile(res, editorHtmlPath, "text/html; charset=utf-8");
                    return;
                }

                if (req.method === "GET" && requestUrl.pathname === "/api/list-files") {
                    const files = listFiles(
                        publicDir,
                        requestUrl.searchParams.get("path"),
                        requestUrl.searchParams.get("recursive") === "true"
                    );
                    sendJson(res, files === null ? 403 : 200, files === null ? { error: "Forbidden" } : { files });
                    return;
                }

                if (req.method === "POST" && requestUrl.pathname === "/api/save-level") {
                    readJson(req, res, ({ levelData, levelPath }) => {
                        const fullPath = path.join(publicDir, String(levelPath || ""));
                        writeJsonFile(fullPath, levelData);
                        return { success: true, message: `Level saved to ${fullPath}` };
                    });
                    return;
                }

                if (req.method === "POST" && requestUrl.pathname === "/api/create-level") {
                    readJson(req, res, ({ levelData, path: levelPath }) => {
                        if (!levelData || !levelData.name) {
                            throw new Error("levelData.name is required");
                        }
                        const safePath = assertSafePath(levelPath);
                        const fullPath = path.join(publicDir, safePath);
                        if (fs.existsSync(fullPath)) {
                            const error = new Error(`Level already exists: ${safePath}`);
                            error.statusCode = 409;
                            throw error;
                        }
                        writeJsonFile(fullPath, levelData);
                        return { success: true, message: `Level created at ${fullPath}`, path: safePath };
                    });
                    return;
                }

                if (req.method === "POST" && requestUrl.pathname === "/api/remove-level") {
                    readJson(req, res, ({ path: levelPath }) => {
                        const safePath = assertSafePath(levelPath);
                        const fullPath = path.join(publicDir, safePath);
                        if (!fs.existsSync(fullPath)) {
                            const error = new Error(`Level not found: ${safePath}`);
                            error.statusCode = 404;
                            throw error;
                        }
                        fs.unlinkSync(fullPath);
                        return { success: true, message: `Level removed at ${fullPath}`, path: safePath };
                    });
                    return;
                }

                if (req.method === "POST" && requestUrl.pathname === "/api/save-entity-data") {
                    readJson(req, res, ({ settingsData, path: customPath, skipReload }) => {
                        if (!settingsData) {
                            throw new Error("No settingsData provided");
                        }

                        const fileName = settingsData && typeof settingsData === "object" && settingsData.name
                            ? `${settingsData.name}.json`
                            : "settingsData.json";
                        const relativePath = customPath
                            ? path.join(String(customPath), fileName)
                            : path.join("data", fileName);
                        const fullPath = path.join(publicDir, relativePath);

                        if (skipReload) {
                            skipReloadUntil = Date.now() + 500;
                            lastSettingsDataPath = relativePath.replace(/\\/g, "/");
                        }

                        writeFormattedJsonFile(fullPath, settingsData);
                        return { success: true, message: `Entity data saved to ${fullPath}` };
                    });
                    return;
                }

                next();
            });
        },
        handleHotUpdate(ctx) {
            if (Date.now() > skipReloadUntil) {
                return;
            }

            const filePath = normalize(ctx.file);
            if (filePath.includes("/data/settingsData.json") || (lastSettingsDataPath && filePath.includes(lastSettingsDataPath))) {
                return [];
            }
        },
        generateBundle(_options, bundle) {
            shouldEmitEditorHtml = bundleIncludesEditorScene(bundle);
        },
        closeBundle() {
            const outDir = path.join(projectRoot, "dist");
            const editorOutputPath = path.join(outDir, "editor.html");

            if (fs.existsSync(outDir)) {
                if (shouldEmitEditorHtml && fs.existsSync(editorHtmlPath)) {
                    fs.copyFileSync(editorHtmlPath, editorOutputPath);
                } else {
                    fs.rmSync(editorOutputPath, { force: true });
                }
            }

            fs.rmSync(path.join(outDir, "data/emojiData.json"), { force: true });
        }
    };
}

function bundleIncludesEditorScene(bundle) {
    return Object.values(bundle).some(item =>
        item.type === "chunk"
        && Object.keys(item.modules || {}).some(moduleId =>
            normalize(moduleId).endsWith("/src/scenes/editorScene.ts")
        )
    );
}

function bareTexturePackImagesPlugin(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const watchDir = options.watchDir || path.join(projectRoot, "texturePackImages");
    const buildCommand = options.buildCommand || [process.execPath, path.resolve(__dirname, "../scripts/buildAssets.cjs")];
    const debounceMs = options.debounceMs ?? 200;
    const runOnStart = options.runOnStart ?? false;
    let timer = null;
    let child = null;
    let queued = false;
    let serverRef = null;

    function schedule(reason) {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            timer = null;
            run(reason);
        }, debounceMs);
    }

    function run(reason) {
        if (child) {
            queued = true;
            console.log(`[assets] Build already running; queued (${reason})`);
            return;
        }

        const [command, ...args] = buildCommand;
        const resolvedCommand = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
        console.log(`[assets] Running ${buildCommand.join(" ")} (${reason})`);
        const useShell = process.platform === "win32" && /\.cmd$/i.test(resolvedCommand);

        child = spawn(resolvedCommand, args, {
            cwd: projectRoot,
            stdio: "inherit",
            shell: useShell
        });
        child.on("close", (code) => {
            if (code !== 0) {
                console.error(`[assets] build:assets failed with code ${code}`);
            }
            child = null;
            if (serverRef) {
                serverRef.ws.send({ type: "full-reload", path: "/initial" });
            }
            if (queued) {
                queued = false;
                run("queued changes");
            }
        });
    }

    return {
        name: "bare:texture-pack-images",
        configureServer(server) {
            serverRef = server;
            if (!fs.existsSync(watchDir)) {
                console.warn(`[assets] texturePackImages folder not found: ${watchDir}`);
                return;
            }
            server.watcher.add(watchDir);
            server.watcher.on("all", (eventName, filePath) => {
                if (normalize(filePath).startsWith(normalize(watchDir))) {
                    schedule(`${eventName}:${path.relative(watchDir, filePath)}`);
                }
            });
            console.log(`[assets] Watching texturePackImages for changes: ${watchDir}`);
            if (runOnStart) {
                schedule("dev server start");
            }
        }
    };
}

function bareStripTexturePackImagesPlugin(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const tempRoot = options.tempRoot || path.join(projectRoot, "node_modules/.bare-engine/stripTexturePackImages");
    const tempDir = path.join(tempRoot, "input");
    const tempOutputDir = path.join(tempRoot, "output");
    let outDir = "";
    let result = null;

    return {
        name: "bare:strip-texture-pack-images",
        apply: "build",
        configResolved(config) {
            outDir = config.build.outDir;
        },
        async buildStart() {
            fs.rmSync(tempRoot, { recursive: true, force: true });
            result = await stripTexturePackImages({
                ...options,
                projectRoot,
                tempDir,
                outputDir: tempOutputDir
            });
        },
        closeBundle() {
            if (result?.skipped) {
                fs.rmSync(tempRoot, { recursive: true, force: true });
                return;
            }

            const outputDir = path.join(outDir, "initial/generated");
            removeTexturePackOutput(outputDir);

            if (result?.kept > 0 && fs.existsSync(tempOutputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
                for (const entry of fs.readdirSync(tempOutputDir)) {
                    if (entry.startsWith("texturePackImages.")) {
                        fs.copyFileSync(path.join(tempOutputDir, entry), path.join(outputDir, entry));
                    }
                }
            }

            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    };
}

function removeTexturePackOutput(outputDir) {
    fs.rmSync(path.join(outputDir, "texturePackImages.json"), { force: true });
    fs.rmSync(path.join(outputDir, "texturePackImages.webp"), { force: true });
    fs.rmSync(path.join(outputDir, "texturePackImages.png"), { force: true });
}

function emitTransformedTs(filePath, code, compilerOptions) {
    const normalizedTarget = normalize(filePath);
    const host = ts.createCompilerHost(compilerOptions);
    const originalReadFile = host.readFile.bind(host);
    const originalFileExists = host.fileExists.bind(host);
    const outputs = new Map();

    host.readFile = (candidate) => normalize(candidate) === normalizedTarget ? code : originalReadFile(candidate);
    host.fileExists = (candidate) => normalize(candidate) === normalizedTarget || originalFileExists(candidate);
    host.writeFile = (name, text) => outputs.set(name, text);

    const program = ts.createProgram([filePath], compilerOptions, host);
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
        return null;
    }

    program.emit(
        sourceFile,
        host.writeFile,
        undefined,
        false,
        {
            before: [
                createControllerProxyTransformer(program),
                createGameObjectNameTransformer(program)
            ]
        }
    );

    const jsName = Array.from(outputs.keys()).find(name => name.endsWith(".js"));
    if (!jsName) {
        return null;
    }

    const mapName = `${jsName}.map`;
    return {
        code: outputs.get(jsName),
        map: outputs.has(mapName) ? JSON.parse(outputs.get(mapName)) : null
    };
}

function transpileTransformedTs(filePath, code, compilerOptions) {
    const result = ts.transpileModule(code, {
        fileName: filePath,
        compilerOptions,
        transformers: {
            before: [
                createControllerProxyTransformer(),
                createGameObjectNameTransformer()
            ]
        }
    });

    return {
        code: result.outputText,
        map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null
    };
}

function injectInitialAssets(html, folder) {
    if (html.includes('data-initial-asset="true"')) {
        return html;
    }

    let tags = "";
    if (fs.existsSync(folder)) {
        for (const filePath of getFilesRecursive(folder)) {
            const relativePath = path.relative(folder, filePath).replace(/\\/g, "/");
            const url = `./initial/${relativePath}`;
            if (filePath.endsWith(".js")) {
                tags += `<script data-initial-asset="true" src="${url}" async onload="this.dataset.loaded='true'" onerror="this.dataset.loaded='true'"></script>\n`;
            } else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(filePath)) {
                tags += `<link data-initial-asset="true" rel="preload" href="${url}" as="image" onload="this.dataset.loaded='true'" onerror="this.dataset.loaded='true'">\n`;
            } else if (filePath.endsWith(".json")) {
                tags += `<link data-initial-asset="true" rel="preload" href="${url}" as="fetch" crossorigin onload="this.dataset.loaded='true'" onerror="this.dataset.loaded='true'">\n`;
            } else {
                tags += `<link data-initial-asset="true" rel="preload" href="${url}" as="object" onload="this.dataset.loaded='true'" onerror="this.dataset.loaded='true'">\n`;
            }
        }
    }

    return html.replace(/<\/head>/, `${tags}</head>`);
}

function generateLayers(jsonPath, outputPath) {
    if (!fs.existsSync(jsonPath)) {
        return;
    }

    try {
        const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
        const layers = data.layers || [];
        // Mirror SettingsHandler.Process(): the engine prepends the default
        // "objects" layer at runtime, so the generated indices must account for
        // it or AddGameObject(name, Layer.X) lands one layer off.
        if (!layers.includes("objects")) {
            layers.unshift("objects");
        }
        const layerEntries = layers
            .map((name, index) => `  ${toConstantCase(name)}: ${index},`)
            .join("\n");
        const output = `// Auto-generated from settingsData.json - DO NOT EDIT
export const Layer = {
${layerEntries}
} as const;

export type Layer = typeof Layer[keyof typeof Layer];
`;

        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
        if (existing !== output) {
            fs.writeFileSync(outputPath, output);
            console.log(`Generated layers.ts with ${layers.length} layers`);
        }
    } catch (error) {
        console.error("Error generating layers:", error);
    }
}

function readJson(req, res, onBody) {
    let body = "";
    req.on("data", chunk => {
        body += chunk.toString();
    });
    req.on("end", () => {
        try {
            sendJson(res, 200, onBody(JSON.parse(body || "{}")));
        } catch (error) {
            sendJson(res, error.statusCode || 500, { error: error.message });
        }
    });
}

function writeJsonFile(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function writeFormattedJsonFile(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const json = JSON.stringify(data, null, 2).replace(
        /\[\n(\s*"[^"]*",?\n)+\s*\]/g,
        match => match.replace(/\n\s*/g, " ").replace("[ ", "[").replace(" ]", "]")
    );
    fs.writeFileSync(filePath, json);
}

function assertSafePath(value) {
    if (!value) {
        throw new Error("path is required");
    }
    const safePath = String(value);
    if (safePath.includes("..") || safePath.startsWith("..")) {
        throw new Error("Invalid path");
    }
    return safePath;
}

function listFiles(publicDir, folderPath, recursive) {
    const publicPath = toPublicRelativePath(folderPath);
    const rootPath = path.resolve(publicDir);
    const fullPath = path.resolve(publicDir, publicPath);
    if (!fullPath.startsWith(rootPath)) {
        return null;
    }
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
        return [];
    }
    if (!recursive) {
        return fs.readdirSync(fullPath);
    }
    return getFilesRecursive(fullPath).map(filePath => path.relative(fullPath, filePath));
}

function toPublicRelativePath(value) {
    return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function getFilesRecursive(dir) {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(getFilesRecursive(fullPath));
        } else {
            results.push(fullPath);
        }
    }
    return results;
}

function sendFile(res, filePath, contentType) {
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    fs.createReadStream(filePath)
        .on("error", () => {
            res.statusCode = 404;
            res.end("Not found");
        })
        .pipe(res);
}

function sendJson(res, statusCode, data) {
    res.statusCode = statusCode;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
}

function readProjectPackage(projectRoot) {
    const packagePath = path.join(projectRoot, "package.json");
    return fs.existsSync(packagePath) ? JSON.parse(fs.readFileSync(packagePath, "utf8")) : {};
}

function readTsconfig(tsconfigPath) {
    if (!tsconfigPath || !fs.existsSync(tsconfigPath)) {
        return { options: {} };
    }
    const config = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    return ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(tsconfigPath));
}

function findTsconfig(projectRoot) {
    const tsconfigPath = path.join(projectRoot, "tsconfig.json");
    return fs.existsSync(tsconfigPath) ? tsconfigPath : path.resolve(__dirname, "../config/tsconfig.base.json");
}

function toConstantCase(str) {
    return str.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function cleanId(id) {
    return normalize(id.split("?")[0]);
}

function normalize(value) {
    return value.replace(/\\/g, "/");
}

const STRIP_ALWAYS_KEEP = new Set(["constructor"]);

function walkAst(node, visitors) {
    if (!node || typeof node !== "object") return;
    visitors.enter && visitors.enter(node);
    for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) {
            for (const item of child) {
                if (item && typeof item.type === "string") walkAst(item, visitors);
            }
        } else if (child && typeof child.type === "string") {
            walkAst(child, visitors);
        }
    }
    visitors.leave && visitors.leave(node);
}

function stripUnusedMethodsPlugin(options = {}) {
    const alwaysKeep = new Set([...STRIP_ALWAYS_KEEP, ...(options.keep || [])]);

    return {
        name: "bare:strip-unused-methods",
        apply: "build",
        renderChunk(code) {
            let ast;
            try {
                ast = acornParse(code, { ecmaVersion: "latest", sourceType: "module" });
            } catch {
                return null;
            }

            const methodNodes = new Map();
            const methodBodyRefs = new Map();
            const externalRefs = new Set(alwaysKeep);
            const methodStack = [];

            function addRef(name) {
                if (methodStack.length > 0)
                    methodBodyRefs.get(methodStack[methodStack.length - 1]).add(name);
                else
                    externalRefs.add(name);
            }

            walkAst(ast, {
                enter(node) {
                    if (node.type === "MethodDefinition" && node.key.type === "Identifier") {
                        const name = node.key.name;
                        if (!methodNodes.has(name)) methodNodes.set(name, []);
                        methodNodes.get(name).push(node);
                        if (!methodBodyRefs.has(name)) methodBodyRefs.set(name, new Set());
                        methodStack.push(name);
                    }
                    if (node.type === "Literal" && typeof node.value === "string") {
                        externalRefs.add(node.value);
                    }
                    if (node.type === "MemberExpression") {
                        if (node.property.type === "Identifier")
                            addRef(node.property.name);
                        if (node.property.type === "Literal" && typeof node.property.value === "string")
                            addRef(node.property.value);
                    }
                },
                leave(node) {
                    if (node.type === "MethodDefinition" && node.key.type === "Identifier")
                        methodStack.pop();
                }
            });

            // BFS reachability from external refs through the call graph
            const alive = new Set();
            const queue = [...externalRefs].filter(n => methodNodes.has(n));
            while (queue.length > 0) {
                const name = queue.shift();
                if (alive.has(name)) continue;
                alive.add(name);
                for (const callee of methodBodyRefs.get(name) ?? []) {
                    if (methodNodes.has(callee) && !alive.has(callee))
                        queue.push(callee);
                }
            }

            // Collect removal ranges for dead methods, then apply back-to-front
            const removals = [];
            for (const [name, nodes] of methodNodes) {
                if (!alive.has(name))
                    for (const node of nodes)
                        removals.push({ start: node.start, end: node.end });
            }

            if (removals.length === 0) return null;

            removals.sort((a, b) => b.start - a.start);
            let result = code;
            for (const { start, end } of removals)
                result = result.slice(0, start) + result.slice(end);

            return { code: result };
        }
    };
}

module.exports = {
    bareAutoRegisterClassesPlugin,
    bareEditorAndApiPlugin,
    bareGeneratedLayersPlugin,
    bareFullReloadPlugin,
    bareHtmlPlugin,
    bareIgnoreLevelJsonHotUpdatesPlugin,
    bareInitialAssetsPlugin,
    bareShaderRawPlugin,
    bareStripTexturePackImagesPlugin,
    bareTexturePackImagesPlugin,
    bareTypeScriptTransformPlugin,
    stripUnusedMethodsPlugin,
    readProjectPackage
};

