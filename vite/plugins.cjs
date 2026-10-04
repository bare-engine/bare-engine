const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { parse: acornParse } = require("acorn");
const MagicString = require("magic-string");
const ts = require("./projectRequire")("typescript");
const createControllerProxyTransformer = require("./controllerProxyTransformer");
const createGameObjectNameTransformer = require("./gameObjectNameTransformer");
const createDecoratorStripTransformer = require("./decoratorStripTransformer");
const { stripTexturePackImages } = require("../scripts/stripTexturePackImages.cjs");
const emojiMappingEmojiToName = require("./emojiMappingEmojiToName.json");

const EMOJI_KEYS_BY_LENGTH = Object.keys(emojiMappingEmojiToName)
    .sort((a, b) => b.length - a.length);

// Minify GLSL while preserving:
//  - preprocessor directives (#version, #define, ...) which must stay on their own line
//  - the `// CUSTOM_CODE` / `// CUSTOM_CODE_CALL` injection markers that generateShader
//    replaces literally (with a single space after `//`)
//  - the `%TEXTURE_NUM%` / `%GET_COLOR%` placeholders (plain tokens, untouched)
function minifyGLSL(src) {
    return src
        .replace(/\r\n?/g, "\n")                   // normalize CRLF -> LF
        .replace(/\/\*[\s\S]*?\*\//g, "")          // block comments
        .replace(/\/\/(?! ?CUSTOM_CODE)[^\n]*/g, "") // line comments, except CUSTOM_CODE markers
        .replace(/[ \t]+/g, " ")                   // collapse runs of spaces/tabs
        .replace(/ *\n */g, "\n")                  // trim whitespace at line edges
        .replace(/\n{2,}/g, "\n")                  // drop blank lines
        .trim();
}

function bareShaderRawPlugin() {
    let shouldMinify = false;
    return {
        name: "bare:shader-raw",
        enforce: "pre",
        configResolved(config) {
            // Keep shaders readable while developing; only minify production builds.
            shouldMinify = config.command === "build";
        },
        load(id) {
            const filePath = cleanId(id);
            if (!/\.(frag|vert)$/.test(filePath)) {
                return null;
            }

            let source = fs.readFileSync(filePath, "utf8");
            if (shouldMinify) {
                source = minifyGLSL(source);
            }
            return `export default ${JSON.stringify(source)};`;
        }
    };
}

function bareTypeScriptTransformPlugin(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const tsconfigPath = options.tsconfigPath || findTsconfig(projectRoot);
    const useTypeChecker = options.useTypeChecker !== false;
    const hotRestart = options.hotRestart !== false;
    // Strips the editor-only inspector decorators (and replaces the decorators.ts reader calls)
    // so decorators.ts tree-shakes out of the prod bundle. Opt-in: the consumer prod config sets
    // it, while dev and the e2e fixture leave it off so the inspector/@Save behaviour stays intact.
    const stripDecorators = options.stripDecorators === true;
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
                ? emitTransformedTs(filePath, code, compilerOptions, stripDecorators)
                : transpileTransformedTs(filePath, code, compilerOptions, stripDecorators);
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
        // each possibly with arguments) so we can tell whether @InspectorBaseClass /
        // @Inspector.BaseClass
        // is applied to the class.
        const classRegex = /((?:@[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\s*\([^)]*\))?\s+)*)?(export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s*<[^>]*>)?(?:\s+extends\s+([A-Za-z_$][\w$]*))?/g;
        const out = [];
        let m;
        while ((m = classRegex.exec(source)) !== null) {
            const decorators = m[1] || "";
            out.push({
                name: m[3],
                base: m[4] || "",
                exported: !!m[2],
                inspectorBase: /@(?:InspectorBaseClass|Inspector\.BaseClass)\b/.test(decorators)
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
        for (const group of [data.prefabs, data.basePrefabs]) {
            if (!group || typeof group !== "object") continue;
            const entities = Array.isArray(group) ? group : Object.values(group);
            for (const entity of entities) {
                const components = entity && entity.components;
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
            // GameObjects must opt in via @InspectorBaseClass / @Inspector.BaseClass; components register regardless.
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

        // Clear the StartBare file's cached transform so the next time it's loaded the
        // auto-register transform re-runs and injects bare.AddClass for the new component.
        // We deliberately do NOT trigger a reload/restart here - the registration is
        // picked up on the next natural reload/restart of the game.
        const mods = serverRef.moduleGraph.getModulesByFile(startBareFile);
        if (mods) {
            for (const mod of mods) {
                serverRef.moduleGraph.invalidateModule(mod);
            }
        }
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

        const registeredBefore = new Set(getRegisteredClasses().map(c => c.name));
        const changed = kind === "unlink" ? unscanFile(filePath) : scanFile(filePath);
        if (!changed) return;

        invalidateStartBareModule();

        // A component/gameobject class just appeared or disappeared (eg a freshly
        // created or deleted component file). Nothing else naturally reloads the page
        // for that - the invalidate above is inert until *something* re-requests the
        // StartBare module - so without this, the panel's "Add Component" list would
        // only pick up the change after some unrelated later reload. Editing an
        // existing class's body doesn't change this set, so ordinary saves still skip
        // the reload.
        const registeredAfter = new Set(getRegisteredClasses().map(c => c.name));
        const registrationSetChanged = registeredAfter.size !== registeredBefore.size
            || [...registeredAfter].some(name => !registeredBefore.has(name));
        if (registrationSetChanged && serverRef) {
            scheduleStartBareHotUpdate();
        }
    }

    // re-run the StartBare module in place (it hot-accepts itself, see appendHotRestart) rather
    // than full-reloading the page, so the game's persistent listeners survive - that's how the
    // plugin re-opens the entity being edited after a component is created from it.
    // Skipped when Vite's own HMR just re-ran StartBare (handleHotUpdate below): creating a
    // component from an entity also writes settingsData.json, which the StartBare file may import,
    // and that restart already re-transforms (and so re-scans) StartBare.
    let startBareHotUpdateTimer = null;
    let lastViteStartBareUpdate = 0;
    function scheduleStartBareHotUpdate() {
        clearTimeout(startBareHotUpdateTimer);
        startBareHotUpdateTimer = setTimeout(() => {
            if (Date.now() - lastViteStartBareUpdate < 1000) return;
            const mod = [...(serverRef.moduleGraph.getModulesByFile(startBareFile ?? "") ?? [])].find(m => m.url);
            if (!mod) return; // StartBare not loaded yet - nothing to restart
            serverRef.ws.send({ type: "update", updates: [{ type: "js-update", timestamp: Date.now(), path: mod.url, acceptedPath: mod.url }] });
        }, 300);
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
        handleHotUpdate(ctx) {
            const isStartBare = (mod) => normalize(mod.file ?? "") === startBareFile;
            if (ctx.modules.some(mod => isStartBare(mod) || [...mod.importers].some(isStartBare)))
                lastViteStartBareUpdate = Date.now();
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

            // Rescan the src tree so the class map matches what's on disk right now -
            // makes registration independent of watcher event ordering. Also catches
            // edits to the StartBare file itself.
            scanAll();
            scanFile(startBareFile);

            const registrations = getRegisteredClasses().filter(c =>
                (!c.filePath || normalize(c.filePath) !== normalize(filePath))
                && !new RegExp(`\\bbare\\.(?:AddClass|RegisterComponent)\\s*\\(\\s*${c.name}\\s*\\)`).test(code)
            );
            if (registrations.length === 0) {
                return null;
            }

            // Components register via RegisterComponent; everything else via the AddClass catch-all.
            const statements = registrations.map(c =>
                c.kind === "component"
                    ? `bare.RegisterComponent(${c.name}, ${JSON.stringify(c.name)});`
                    : `bare.AddClass(${c.name}, ${JSON.stringify(c.name)});`
            );
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
    const gameId = options.gameId || projectPackage.bareEngine?.gameId || "";
    const isDev = options.isDev === true;
    const htmlOptions = projectPackage.bareEngine?.index || {};
    const title = htmlOptions.title || projectPackage.bareEngine?.name || projectPackage.name || "Bare Game";
    const backgroundColor = htmlOptions.backgroundColor || "rgb(255, 255, 255)";
    const textColor = htmlOptions.textColor || "rgb(0, 0, 0)";
    const loadingTextStyle = htmlOptions.showLoading === false ? "display: none;" : "";
    const firstLevelLoad = resolveFirstLevelLoad(projectPackage.bareEngine?.firstLevelLoad);
    const preloadCurrentLevel = projectPackage.bareEngine?.preloadCurrentLevel !== false;
    const bootstrap = options.bootstrap || '<script type="module" src="/src/game.ts"></script>';

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
                    .replace(/%BARE_PRELOAD_CURRENT_LEVEL%/g, JSON.stringify(preloadCurrentLevel))
                    .replace(/%BARE_GAME_ID%/g, JSON.stringify(gameId))
                    .replace(/%BARE_DEV%/g, JSON.stringify(isDev))
                    .replace("<!-- js:bootstrap -->", bootstrap);
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
    // One stamp per build (or per dev server start) so the whole initial-asset set
    // busts cache together on every deploy, instead of each file caching independently
    const version = Date.now().toString(36);

    return {
        name: "bare:initial-assets",
        transformIndexHtml: {
            order: "post",
            handler(html) {
                return injectInitialAssets(html, folder, version);
            }
        },
        configureServer(server) {
            if (fs.existsSync(folder)) {
                server.watcher.add(folder);
            }
        }
    };
}

// Shared "suppress the next dev full-reload" window. The save-settings-data endpoint
// (bareEditorAndApiPlugin) opens it when a save passes skipReload, and BOTH the
// settingsData HMR handler AND the generated-assets watcher honor it - otherwise
// regenerating assets.ts on an entity add/remove would full-reload the page even
// though the running game already applied the change in-memory.
let skipReloadUntil = 0;

// Set while a texturePackImages (AssetPack) build is clearing + rewriting
// public/initial/generated. The generated-assets watcher honors it so it doesn't
// fire a racy full-reload while the atlas is momentarily missing from disk - which
// would reload the page with no initial-asset tags and leave window.initialAssets
// empty. The texturePackImages plugin does the single authoritative reload once the
// build finishes and the atlas is back on disk.
let texturePackBuilding = false;

// Set by bare:generated-assets in dev. The texturePackImages plugin calls it once a
// build finishes, since on Windows the watcher can miss the atlas json being replaced
// (renamed over), which left assets.ts stale until the next unrelated change.
let regenerateGeneratedAssets = null;

function bareEditorAndApiPlugin(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const editorHtmlPath = options.editorHtmlPath || path.resolve(__dirname, "../config/editor.html");
    const publicDir = path.join(projectRoot, "public");
    let lastSettingsDataPath = "";
    // Paths (relative to public, forward-slashed) of level files written/removed under
    // a skipReload request, so handleHotUpdate can swallow Vite's own public-dir reload
    // for them (separate from the generated-assets watcher's reload). A list because a
    // rename touches two files (save new + remove old) within one window.
    let skipReloadPaths = [];
    let shouldEmitEditorHtml = false;

    function markSkipReload(relPath) {
        if (Date.now() > skipReloadUntil) {
            skipReloadPaths = []; // previous window expired - start fresh
        }
        skipReloadUntil = Date.now() + 500;
        skipReloadPaths.push(String(relPath || "").replace(/\\/g, "/"));
    }

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
                    readJson(req, res, ({ levelData, levelPath, skipReload }) => {
                        const fullPath = path.join(publicDir, String(levelPath || ""));
                        if (skipReload) {
                            markSkipReload(levelPath);
                        }
                        writeJsonFile(fullPath, levelData);
                        return { success: true, message: `Level saved to ${fullPath}` };
                    });
                    return;
                }

                if (req.method === "POST" && requestUrl.pathname === "/api/create-level") {
                    readJson(req, res, ({ levelData, path: levelPath, skipReload }) => {
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
                        // The new level file makes the generated-assets watcher regenerate
                        // assets.ts and full-reload. The running game already navigates to the
                        // new level in-memory (gotoLevelEdit), so suppress that reload.
                        if (skipReload) {
                            markSkipReload(safePath);
                        }
                        writeJsonFile(fullPath, levelData);
                        return { success: true, message: `Level created at ${fullPath}`, path: safePath };
                    });
                    return;
                }

                if (req.method === "POST" && requestUrl.pathname === "/api/remove-level") {
                    readJson(req, res, ({ path: levelPath, skipReload }) => {
                        const safePath = assertSafePath(levelPath);
                        const fullPath = path.join(publicDir, safePath);
                        if (!fs.existsSync(fullPath)) {
                            const error = new Error(`Level not found: ${safePath}`);
                            error.statusCode = 404;
                            throw error;
                        }
                        // Deleting the level file makes the generated-assets watcher regenerate
                        // assets.ts and full-reload. The running game handles its own in-memory
                        // restart/scene removal, so suppress that reload.
                        if (skipReload) {
                            markSkipReload(safePath);
                        }
                        fs.unlinkSync(fullPath);
                        return { success: true, message: `Level removed at ${fullPath}`, path: safePath };
                    });
                    return;
                }

                if (req.method === "POST" && requestUrl.pathname === "/api/create-component") {
                    readJson(req, res, ({ name, attach }) => {
                        const className = toComponentClassName(name);
                        const fileBase = className.charAt(0).toLowerCase() + className.slice(1);
                        const componentName = className.replace(/Component$/, "").replace(/^./, c => c.toLowerCase());
                        const componentsDir = path.join(projectRoot, "src", "components");
                        const fullPath = path.join(componentsDir, `${fileBase}.ts`);
                        if (fs.existsSync(fullPath)) {
                            const error = new Error(`Component already exists: ${fileBase}.ts`);
                            error.statusCode = 409;
                            throw error;
                        }
                        fs.mkdirSync(componentsDir, { recursive: true });
                        fs.writeFileSync(fullPath, componentTemplate(className));
                        // No need to write bare.AddClass anywhere: the bare:auto-register-classes
                        // plugin scans the new file and injects it in-memory on the next compile.
                        // Attach the component to the prefab in settingsData.json here (server-side)
                        // so the write can't be interrupted by the hot-restart the file write triggers.
                        let attached = false;
                        if (attach && attach.prefab) {
                            attached = attachComponentToPrefab(projectRoot, {
                                prefab: String(attach.prefab),
                                childPath: Array.isArray(attach.childPath) ? attach.childPath : [],
                                componentName
                            });
                        }
                        return {
                            success: true,
                            message: `Component created at ${fullPath}`,
                            className,
                            attached,
                            name: componentName
                        };
                    });
                    return;
                }

                if (req.method === "POST" && requestUrl.pathname === "/api/save-settings-data") {
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
            if (filePath.includes("/data/settingsData.json")
                || (lastSettingsDataPath && filePath.includes(lastSettingsDataPath))
                || skipReloadPaths.some(p => p && filePath.includes(p))) {
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
    const outputDir = options.outputDir || path.join(projectRoot, "public/initial/generated");
    let timer = null;
    let child = null;
    let queued = false;
    let serverRef = null;
    let scheduleId = 0;

    function schedule(reason) {
        if (timer) {
            clearTimeout(timer);
        }
        const id = ++scheduleId;
        timer = setTimeout(async () => {
            timer = null;
            await waitForStableFiles(watchDir);
            // a newer event arrived while waiting; its own schedule will run the build
            if (id === scheduleId) {
                run(reason);
            }
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

        // Suppress the generated-assets watcher's reload until the atlas is rewritten.
        texturePackBuilding = true;
        // AssetPack output is deterministic, so a rebuild of unchanged images (eg the
        // runOnStart build) leaves the atlas byte-identical - don't reload the page for that.
        const before = snapshotDir(outputDir);
        const finish = (sendReload) => {
            child = null;
            const assetsChanged = regenerateGeneratedAssets?.();
            const atlasChanged = !sameSnapshot(before, snapshotDir(outputDir));
            if (sendReload && serverRef && (atlasChanged || assetsChanged)) {
                serverRef.ws.send({ type: "full-reload", path: "/initial" });
            }
            // Swallow the trailing generated-assets watcher events from the freshly
            // written atlas for a short grace window so they don't fire a second reload.
            skipReloadUntil = Math.max(skipReloadUntil, Date.now() + 500);
            texturePackBuilding = false;
            if (queued) {
                queued = false;
                run("queued changes");
            }
        };

        child = spawn(resolvedCommand, args, {
            cwd: projectRoot,
            stdio: "inherit",
            shell: useShell
        });
        child.on("error", (error) => {
            console.error(`[assets] build:assets failed to start: ${error.message}`);
            finish(false);
        });
        child.on("close", (code) => {
            if (code !== 0) {
                console.error(`[assets] build:assets failed with code ${code}`);
            }
            finish(true);
        });
    }

    // build has no dev server to run the pack, and public/initial/generated is gitignored,
    // so a fresh checkout would bundle without the atlas. run it once and wait, before
    // bare:generated-assets reads the atlas json in its own buildStart
    function runForBuild() {
        if (!fs.existsSync(watchDir)) {
            console.warn(`[assets] texturePackImages folder not found: ${watchDir}`);
            return Promise.resolve();
        }

        const [command, ...args] = buildCommand;
        const resolvedCommand = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
        const useShell = process.platform === "win32" && /\.cmd$/i.test(resolvedCommand);
        console.log(`[assets] Running ${buildCommand.join(" ")} (build)`);

        return new Promise((resolve, reject) => {
            const buildChild = spawn(resolvedCommand, args, {
                cwd: projectRoot,
                stdio: "inherit",
                shell: useShell
            });
            buildChild.on("error", error => reject(new Error(`build:assets failed to start: ${error.message}`)));
            buildChild.on("close", code => code === 0
                ? resolve()
                : reject(new Error(`build:assets failed with code ${code}`)));
        });
    }

    let isBuild = false;

    return {
        name: "bare:texture-pack-images",
        configResolved(config) {
            isBuild = config.command === "build";
        },
        buildStart: {
            order: "pre",
            sequential: true,
            async handler() {
                if (isBuild) {
                    await runForBuild();
                }
            }
        },
        configureServer(server) {
            serverRef = server;
            // On Windows a file that is still being copied/saved is locked, so chokidar's
            // fs.watch on it throws EBUSY/EPERM. Without an "error" listener that kills the
            // dev server; instead retry watching once the lock is released.
            server.watcher.on("error", (error) => {
                const filePath = error?.path || error?.filename;
                if (!filePath || (error.code !== "EBUSY" && error.code !== "EPERM")) {
                    console.error(`[watcher] ${error?.message || error}`);
                    return;
                }
                setTimeout(() => {
                    server.watcher.unwatch(filePath);
                    server.watcher.add(filePath);
                    if (normalize(filePath).startsWith(normalize(watchDir))) {
                        schedule(`retry:${path.relative(watchDir, filePath)}`);
                    }
                }, 500);
            });
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

// name -> contents of every file directly in dir (missing dir -> empty map)
function snapshotDir(dir) {
    const snapshot = new Map();
    if (!fs.existsSync(dir)) {
        return snapshot;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile()) {
            snapshot.set(entry.name, fs.readFileSync(path.join(dir, entry.name)));
        }
    }
    return snapshot;
}

function sameSnapshot(a, b) {
    if (a.size !== b.size) {
        return false;
    }
    for (const [name, contents] of a) {
        if (!b.has(name) || !contents.equals(b.get(name))) {
            return false;
        }
    }
    return true;
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

function emitTransformedTs(filePath, code, compilerOptions, stripDecorators) {
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
                ...(stripDecorators ? [createDecoratorStripTransformer()] : []),
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
    const map = outputs.has(mapName) ? JSON.parse(outputs.get(mapName)) : null;
    applyTransformedSourceContent(map, filePath, code, stripDecorators, program);

    return {
        code: outputs.get(jsName),
        map
    };
}

function transpileTransformedTs(filePath, code, compilerOptions, stripDecorators) {
    const result = ts.transpileModule(code, {
        fileName: filePath,
        compilerOptions,
        transformers: {
            before: [
                ...(stripDecorators ? [createDecoratorStripTransformer()] : []),
                createControllerProxyTransformer(),
                createGameObjectNameTransformer()
            ]
        }
    });

    const map = result.sourceMapText ? JSON.parse(result.sourceMapText) : null;
    applyTransformedSourceContent(map, filePath, code, stripDecorators);

    return {
        code: result.outputText,
        map
    };
}

function applyTransformedSourceContent(map, filePath, code, stripDecorators, program) {
    if (!map || !Array.isArray(map.sources)) {
        return;
    }

    const transformedSource = buildLinePreservingDebugSource(filePath, code, program);
    if (!transformedSource) {
        return;
    }

    map.sourcesContent ||= [];
    for (let i = 0; i < map.sources.length; i++) {
        if (sourceMapEntryMatchesFile(map.sources[i], filePath)) {
            map.sourcesContent[i] = transformedSource;
        }
    }
}

function sourceMapEntryMatchesFile(source, filePath) {
    const normalizedSource = normalize(source || "");
    const normalizedFile = normalize(filePath);

    if (normalizedSource === normalizedFile) {
        return true;
    }

    const resolvedSource = normalize(path.resolve(path.dirname(filePath), source || ""));
    return resolvedSource === normalizedFile
        || normalizedSource.endsWith(`/${path.basename(filePath)}`);
}

const debugBareModuleFields = new Set([
    "object",
    "component",
    "mouse",
    "tween",
    "particle",
    "hitbox",
    "arcade",
    "sopiro",
    "level",
    "camera"
]);

function buildLinePreservingDebugSource(filePath, code, program) {
    const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const ms = new MagicString(code);
    const checker = program ? program.getTypeChecker() : null;
    let changed = false;

    function visit(node, classContext = null) {
        if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
            const nextContext = getDebugClassContext(node, checker);
            ts.forEachChild(node, child => visit(child, nextContext));
            return;
        }

        if (classContext?.hasScene && ts.isPropertyAccessExpression(node)) {
            const fieldName = node.name && ts.isIdentifier(node.name) ? node.name.text : "";
            if (ts.isIdentifier(node.expression) && node.expression.text === "bare") {
                if (fieldName === "events") {
                    overwriteNode(ms, sourceFile, node, classContext.extendsScene ? "this.events" : "this.scene.events");
                    changed = true;
                    return;
                }

                if (debugBareModuleFields.has(fieldName)) {
                    overwriteNode(ms, sourceFile, node, classContext.extendsScene ? `this.${fieldName}` : `this.scene.${fieldName}`);
                    changed = true;
                    return;
                }
            }
        }

        if (classContext?.hasScene && ts.isIdentifier(node) && isDebugIdentifierReference(node)) {
            if (node.text === "bScene") {
                overwriteNode(ms, sourceFile, node, classContext.extendsScene ? "this" : "this.scene");
                changed = true;
                return;
            }
            if (node.text === "events") {
                overwriteNode(ms, sourceFile, node, classContext.extendsScene ? "this.events" : "this.scene.events");
                changed = true;
                return;
            }
        }

        ts.forEachChild(node, child => visit(child, classContext));
    }

    visit(sourceFile);
    return changed ? ms.toString() : code;
}

function getDebugClassContext(node, checker) {
    const extendsScene = debugClassExtendsScene(node, checker);
    return {
        extendsScene,
        hasScene: extendsScene || debugClassHasScene(node, checker)
    };
}

function debugClassExtendsScene(node, checker) {
    if (debugClassExtendsName(node, "Scene")) {
        return true;
    }

    if (!checker) {
        return false;
    }

    const visited = new Set();
    function walk(type) {
        if (!type || visited.has(type)) {
            return false;
        }
        visited.add(type);

        if (type.symbol && type.symbol.name === "Scene") {
            return true;
        }

        const bases = type.getBaseTypes ? type.getBaseTypes() : [];
        return bases && bases.some(walk);
    }

    return walk(checker.getTypeAtLocation(node));
}

function debugClassHasScene(node, checker) {
    if (debugClassDeclaresScene(node) || debugClassExtendsName(node, "GameObject")) {
        return true;
    }

    if (!checker) {
        return false;
    }

    const type = checker.getTypeAtLocation(node);
    return !!(type && type.getProperty && type.getProperty("scene"));
}

function debugClassExtendsName(node, name) {
    if (!node.heritageClauses) {
        return false;
    }

    for (const clause of node.heritageClauses) {
        if (clause.token !== ts.SyntaxKind.ExtendsKeyword) {
            continue;
        }
        for (const type of clause.types) {
            const expression = type.expression;
            if (ts.isIdentifier(expression) && expression.text === name) {
                return true;
            }
            if (ts.isPropertyAccessExpression(expression) && expression.name.text === name) {
                return true;
            }
        }
    }

    return false;
}

function debugClassDeclaresScene(node) {
    return node.members.some(member => {
        if (
            (ts.isPropertyDeclaration(member)
                || ts.isGetAccessorDeclaration(member)
                || ts.isSetAccessorDeclaration(member)
                || ts.isMethodDeclaration(member))
            && member.name
            && ts.isIdentifier(member.name)
        ) {
            return member.name.text === "scene";
        }

        if (ts.isConstructorDeclaration(member)) {
            return member.parameters.some(param => param.name && ts.isIdentifier(param.name) && param.name.text === "scene" && hasDebugParamPropertyModifier(param));
        }

        return false;
    });
}

function hasDebugParamPropertyModifier(param) {
    return !!param.modifiers && param.modifiers.some(modifier =>
        modifier.kind === ts.SyntaxKind.PublicKeyword
        || modifier.kind === ts.SyntaxKind.PrivateKeyword
        || modifier.kind === ts.SyntaxKind.ProtectedKeyword
        || modifier.kind === ts.SyntaxKind.ReadonlyKeyword
    );
}

function overwriteNode(ms, sourceFile, node, replacement) {
    ms.overwrite(node.getStart(sourceFile), node.end, replacement);
}

function isDebugIdentifierReference(node) {
    const parent = node.parent;
    if (!parent) {
        return true;
    }

    if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
    if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
    if (ts.isPropertyDeclaration(parent) && parent.name === node) return false;
    if (ts.isBindingElement(parent) && parent.name === node) return false;
    if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
    if (ts.isImportClause(parent) && parent.name === node) return false;
    if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
    if (ts.isParameter(parent) && parent.name === node) return false;
    if (ts.isFunctionDeclaration(parent) && parent.name === node) return false;
    if (ts.isMethodDeclaration(parent) && parent.name === node) return false;
    if (ts.isClassDeclaration(parent) && parent.name === node) return false;
    if (ts.isInterfaceDeclaration(parent) && parent.name === node) return false;
    if (ts.isTypeAliasDeclaration(parent) && parent.name === node) return false;
    if (ts.isTypeReferenceNode(parent) && parent.typeName === node) return false;

    return true;
}

function injectInitialAssets(html, folder, version) {
    if (html.includes('data-initial-asset="true"')) {
        return html;
    }

    let tags = "";
    if (fs.existsSync(folder)) {
        for (const filePath of getFilesRecursive(folder)) {
            const relativePath = path.relative(folder, filePath).replace(/\\/g, "/");
            // Versioned so a new build can't end up with a fresh atlas JSON paired
            // against a browser-cached stale image (or vice versa) - see getInitialAssetKey()
            // in index.html, which already strips the query string before keying the asset
            const url = `./initial/${relativePath}?v=${version}`;
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

function toComponentClassName(name) {
    // Strip whitespace and any character that isn't valid in an identifier, then
    // drop a trailing "Component" (any case) so "Foo", "foo" and "FooComponent"
    // all resolve to the same FooComponent class.
    const cleaned = String(name || "").replace(/\s+/g, "").replace(/[^A-Za-z0-9_$]/g, "");
    const base = cleaned.replace(/component$/i, "") || cleaned;
    if (!base || !/^[A-Za-z_$]/.test(base)) {
        throw new Error("Invalid component name");
    }
    return `${base.charAt(0).toUpperCase()}${base.slice(1)}Component`;
}

// Add the component (by its decapitalized name) to a prefab's `components` map in
// settingsData.json, walking childPath into nested children if given.
function attachComponentToPrefab(projectRoot, { prefab, childPath, componentName }) {
    const settingsPath = path.join(projectRoot, "public", "data", "settingsData.json");
    if (!fs.existsSync(settingsPath)) {
        return false;
    }
    let data;
    try {
        data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {
        return false;
    }
    const findPrefab = group => Array.isArray(group)
        ? group.find(value => value.name === prefab)
        : group && group[prefab];
    const normalPrefab = findPrefab(data.prefabs);
    const basePrefab = findPrefab(data.basePrefabs);
    if (normalPrefab && basePrefab) {
        throw new Error(`Prefab name '${prefab}' exists in both prefabs and basePrefabs`);
    }
    let target = normalPrefab || basePrefab;
    if (!target) {
        return false;
    }
    for (const index of childPath) {
        const children = Array.isArray(target.children) ? target.children : null;
        target = children && children[index];
        if (!target) {
            return false;
        }
    }
    target.components = target.components || {};
    if (target.components[componentName] === undefined) {
        target.components[componentName] = {};
    }
    writeFormattedJsonFile(settingsPath, data);
    return true;
}

function componentTemplate(className) {
    return `import { Component } from "bare-engine";

export class ${className} extends Component
{
    OnAdded(): void
    {

    }
}
`;
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

// Wait until every file under dir has stopped changing size and isn't locked. A
// copy/save into texturePackImages fires "add" while the file is still being written
// (and locked on Windows), so packing right away silently leaves the new image out.
async function waitForStableFiles(dir, { intervalMs = 100, stableMs = 500, timeoutMs = 10000 } = {}) {
    const snapshot = () => {
        if (!fs.existsSync(dir)) {
            return "";
        }
        return getFilesRecursive(dir).map((filePath) => {
            try {
                fs.closeSync(fs.openSync(filePath, "r+"));
                return `${filePath}:${fs.statSync(filePath).size}`;
            } catch {
                return `${filePath}:locked:${Date.now()}`;
            }
        }).join("|");
    };

    const deadline = Date.now() + timeoutMs;
    let previous = snapshot();
    let stableSince = Date.now();
    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        const current = snapshot();
        if (current !== previous) {
            previous = current;
            stableSince = Date.now();
        } else if (Date.now() - stableSince >= stableMs) {
            return;
        }
    }
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

// Wrap the `transform` hook of the given plugins so that, when a hook returns
// changed code as a bare string (no sourcemap), we attach a real map describing
// the edit. Vite otherwise assumes such a transform didn't move any lines and
// chains an identity map - which is wrong whenever the plugin inserts/removes
// lines (e.g. vite-plugin-entry-shaking expands a barrel import into many lines),
// shifting every following line and throwing off breakpoints in the devtools.
function withTransformSourcemap(plugins) {
    for (const plugin of plugins) {
        if (typeof plugin.transform !== "function") {
            continue;
        }
        const innerTransform = plugin.transform;
        plugin.transform = async function (code, id) {
            const newCode = await innerTransform.call(this, code, id);
            if (typeof newCode !== "string" || newCode === code) {
                return newCode;
            }
            return { code: newCode, map: buildLineShiftMap(code, newCode, id) };
        };
    }
    return plugins;
}

// Build a sourcemap for an edit known only by its before/after text. We collapse
// the change to a single replaced span (everything between the common prefix and
// common suffix) and apply it through MagicString, which then maps the untouched
// prefix and suffix - in particular the whole body below an expanded import block -
// back to their exact original positions.
function buildLineShiftMap(original, next, id) {
    const minLen = Math.min(original.length, next.length);
    let start = 0;
    while (start < minLen && original[start] === next[start]) {
        start++;
    }
    let end = 0;
    while (end < minLen - start
        && original[original.length - 1 - end] === next[next.length - 1 - end]) {
        end++;
    }

    const originalEnd = original.length - end;
    const replacement = next.slice(start, next.length - end);

    const ms = new MagicString(original);
    if (originalEnd > start) {
        ms.overwrite(start, originalEnd, replacement);
    } else if (replacement) {
        ms.appendLeft(start, replacement);
    }

    return ms.generateMap({ source: id, includeContent: true, hires: true });
}

const ASSET_IMAGE_EXTENSIONS = new Set([".webp", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg"]);
const ASSET_GENERATED_IMAGE_EXTENSIONS = new Set([".webp"]);
const ASSET_SOUND_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"]);
const ASSET_FONT_EXTENSIONS = new Set([".ttf", ".otf", ".woff", ".woff2"]);
const ASSET_LEVEL_EXTENSIONS = new Set([".json"]);

// Generates src/generated/assets.ts, giving the project typed enum-like constants
// for every public asset and every named definition in settingsData.json, eg:
//   Asset.Image.HUD_COIN  Asset.Sound.COIN  Asset.Font.QILKA_BOLD  Asset.Level.LEVEL
//   Data.Prefab.PLAYER    Data.Animation.PLAYER_IDLE                Data.Layer.OBJECTS
function bareGeneratedAssetsPlugin(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const outputPath = options.outputPath || path.join(projectRoot, "src/generated/assets.ts");
    const entryPath = options.entryPath || path.join(projectRoot, "src/game.ts");
    const settingsPath = path.join(projectRoot, "public/data/settingsData.json");
    // Extra image globs (relative to public, eg "demos/**/images/**") pull images that
    // live outside public/images into Asset.Image, each keyed/valued by its name relative
    // to its images folder. This is a bit of a hack - it exists so the showcase/demos
    // project, which scatters images across per-demo folders, can work; normal projects
    // keep everything under public/images and never set this.
    const imageGlobs = Array.isArray(options.imageGlobs) ? options.imageGlobs : [];
    const publicDir = path.join(projectRoot, "public");
    const watchDirs = [
        path.join(projectRoot, "public/initial"),
        path.join(projectRoot, "public/images"),
        path.join(projectRoot, "public/sounds"),
        path.join(projectRoot, "public/fonts"),
        path.join(projectRoot, "public/data/levels"),
        ...imageGlobs.map(glob => path.join(publicDir, globStaticPrefix(glob)))
    ];

    let importSpecifier = normalize(path.relative(path.dirname(entryPath), outputPath)).replace(/\.[cm]?[jt]sx?$/, "");
    if (!importSpecifier.startsWith(".")) {
        importSpecifier = `./${importSpecifier}`;
    }
    const entryNorm = normalize(path.resolve(entryPath));
    let isServe = false;

    return {
        name: "bare:generated-assets",
        configResolved(config) {
            isServe = config.command === "serve";
        },
        buildStart() {
            generateAssets(projectRoot, outputPath, imageGlobs);
            if (fs.existsSync(settingsPath)) {
                this.addWatchFile(settingsPath);
            }
        },
        // The generated module registers Bare.assets.* / Bare.data.* on import. Those
        // are only read in dev (prod inlines everything to literals), so inject the
        // side-effect import into the entry module in-memory rather than touching the
        // project's source file.
        transform(code, id) {
            if (!isServe || normalize(path.resolve(cleanId(id))) !== entryNorm) {
                return null;
            }
            if (/generated\/assets(?:\.[a-z]+)?['"]/.test(code)) {
                return null; // already imported
            }
            const ms = new MagicString(code);
            ms.prepend(`import '${importSpecifier}';\n`);
            return { code: ms.toString(), map: ms.generateMap({ source: id, includeContent: true, hires: true }) };
        },
        configureServer(server) {
            generateAssets(projectRoot, outputPath, imageGlobs);

            for (const target of [settingsPath, ...watchDirs]) {
                if (fs.existsSync(target)) {
                    server.watcher.add(target);
                }
            }

            const outputNorm = normalize(outputPath);
            const outputResolved = normalize(path.resolve(outputPath));
            const sources = [normalize(settingsPath), ...watchDirs.map(normalize)];
            const regenerate = (filePath) => {
                const norm = normalize(filePath);
                if (norm === outputNorm) {
                    return; // never react to our own output
                }
                // Mid-build, public/initial holds a half-moved atlas (the new webp before its
                // json is moved next to it), which would generate a bogus assets.ts. The
                // texturePackImages plugin regenerates once the build has finished.
                if (texturePackBuilding) {
                    return;
                }
                const isSource = sources.some(src => norm === src || norm.startsWith(src + "/"));
                if (isSource && generateAssets(projectRoot, outputPath, imageGlobs)) {
                    // assets.ts is excluded from the dev watcher (vite.config server.watch.ignored)
                    // to avoid reacting to our own writes, so Vite won't HMR it on its own. Drop its
                    // cached transform and full-reload so the running game picks up the new module.
                    const mods = server.moduleGraph.getModulesByFile(outputResolved);
                    if (mods) {
                        for (const mod of mods) {
                            server.moduleGraph.invalidateModule(mod);
                        }
                    }
                    // Keep the regenerated assets.ts on disk (correct for the next real reload),
                    // but skip the full-reload while a skipReload save is in flight - the running
                    // game already applied the entity change in-memory via the plugin handler -
                    // or while a texturePackImages build is mid-rewrite of the atlas (the
                    // texturePackImages plugin reloads once the atlas is back on disk).
                    if (Date.now() > skipReloadUntil && !texturePackBuilding) {
                        server.ws.send({ type: "full-reload", path: "*" });
                    }
                }
            };

            regenerateGeneratedAssets = () => {
                if (!generateAssets(projectRoot, outputPath, imageGlobs)) {
                    return false;
                }
                const mods = server.moduleGraph.getModulesByFile(outputResolved);
                if (mods) {
                    for (const mod of mods) {
                        server.moduleGraph.invalidateModule(mod);
                    }
                }
                return true;
            };

            server.watcher.on("add", regenerate);
            server.watcher.on("unlink", regenerate);
            server.watcher.on("change", regenerate);
        }
    };
}

function bareInlineGeneratedAssetsPlugin(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const generatedPath = normalize(path.resolve(options.outputPath || path.join(projectRoot, "src/generated/assets.ts")));
    let generatedValues = null;

    function loadGeneratedValues() {
        if (!fs.existsSync(generatedPath)) {
            generatedValues = null;
            return;
        }

        const source = fs.readFileSync(generatedPath, "utf8");
        generatedValues = {
            Asset: flattenGeneratedAssetObject(extractGeneratedConstObject(source, "Asset")),
            Data: flattenGeneratedAssetObject(extractGeneratedConstObject(source, "Data"))
        };
    }

    return {
        name: "bare:inline-generated-assets",
        apply: "build",
        buildStart() {
            loadGeneratedValues();
        },
        transform(code, id) {
            const filePath = cleanId(id);
            const normalizedFilePath = normalize(path.resolve(filePath));
            if (normalizedFilePath === generatedPath) {
                return null;
            }
            if (!/\.[cm]?[jt]sx?$/.test(filePath) || /\.d\.ts$/.test(filePath)) {
                return null;
            }

            if (!generatedValues) {
                loadGeneratedValues();
            }
            if (!generatedValues) {
                return null;
            }

            const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);
            const importedRoots = new Map();
            const namespaceImports = new Set();
            const importRanges = [];

            // Collect Asset / Data imported from the generated module, then inline
            // their references to literals and drop the (now unused) import so the
            // generated module is left out of the production bundle.
            for (const statement of sourceFile.statements) {
                if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
                    continue;
                }
                if (!isGeneratedAssetsImport(filePath, statement.moduleSpecifier.text, generatedPath)) {
                    continue;
                }

                importRanges.push(getStatementRemovalRange(code, statement));

                const clause = statement.importClause;
                if (!clause) {
                    continue;
                }
                const bindings = clause.namedBindings;
                if (bindings && ts.isNamespaceImport(bindings)) {
                    namespaceImports.add(bindings.name.text);
                } else if (bindings && ts.isNamedImports(bindings)) {
                    for (const element of bindings.elements) {
                        const importedName = (element.propertyName || element.name).text;
                        if (importedName === "Asset" || importedName === "Data") {
                            importedRoots.set(element.name.text, importedName);
                        }
                    }
                }
            }

            const ms = new MagicString(code);

            function visit(node) {
                if (ts.isPropertyAccessExpression(node)) {
                    const replacement = getGeneratedAssetReplacement(node, sourceFile, importedRoots, namespaceImports, generatedValues);
                    if (replacement !== null) {
                        ms.overwrite(node.getStart(sourceFile), node.getEnd(), replacement);
                        return;
                    }
                }
                ts.forEachChild(node, visit);
            }

            visit(sourceFile);

            for (let i = importRanges.length - 1; i >= 0; i--) {
                ms.remove(importRanges[i].start, importRanges[i].end);
            }

            const next = ms.toString();
            if (next === code) {
                return null;
            }

            return {
                code: next,
                map: ms.generateMap({ source: id, includeContent: true, hires: true })
            };
        }
    };
}

function extractGeneratedConstObject(source, name) {
    const constIndex = source.indexOf(`export const ${name}`);
    if (constIndex < 0) {
        return {};
    }

    const objectStart = source.indexOf("{", constIndex);
    const objectEnd = findMatchingBrace(source, objectStart);
    if (objectStart < 0 || objectEnd < 0) {
        return {};
    }

    try {
        return Function(`"use strict"; return (${source.slice(objectStart, objectEnd + 1)});`)();
    } catch {
        return {};
    }
}

// Flatten to a lookup keyed by the path after the root, eg:
//   Image.CAT -> "cat" (typed map entry)   Images -> ["cat"] (plural "all" list)
function flattenGeneratedAssetObject(value) {
    const out = new Map();
    if (!value || typeof value !== "object") {
        return out;
    }

    for (const [sectionName, section] of Object.entries(value)) {
        if (Array.isArray(section)) {
            out.set(sectionName, section);
        } else if (section && typeof section === "object") {
            for (const [key, entryValue] of Object.entries(section)) {
                out.set(`${sectionName}.${key}`, entryValue);
            }
        }
    }

    return out;
}

function isGeneratedAssetsImport(fromFile, importPath, generatedPath) {
    if (!importPath.startsWith(".")) {
        return false;
    }

    const resolved = normalize(path.resolve(path.dirname(fromFile), importPath));
    return resolved.replace(/\.[cm]?[jt]sx?$/, "") === generatedPath.replace(/\.[cm]?[jt]sx?$/, "");
}

function getStatementRemovalRange(code, statement) {
    let start = statement.getFullStart();
    let end = statement.end;

    if (code[end] === "\r" && code[end + 1] === "\n") {
        end += 2;
    } else if (code[end] === "\n") {
        end += 1;
    }

    return { start, end };
}

function getGeneratedAssetReplacement(node, sourceFile, importedRoots, namespaceImports, generatedValues) {
    const chain = getPropertyAccessChain(node);
    if (!chain) {
        return null;
    }

    // Resolve root (Asset/Data) and the path after it: [Section, KEY] for a specific
    // value (Asset.Image.CAT) or [Plural] for the whole list (Asset.Images).
    let rootName = "";
    let rest = null;

    if (importedRoots.has(chain[0])) {
        rootName = importedRoots.get(chain[0]);
        rest = chain.slice(1);
    } else if (namespaceImports.has(chain[0]) && (chain[1] === "Asset" || chain[1] === "Data")) {
        rootName = chain[1];
        rest = chain.slice(2);
    } else {
        return null;
    }

    if (!rest || rest.length === 0) {
        return null;
    }

    const rootValues = generatedValues[rootName];
    if (!rootValues) {
        return null;
    }

    const mapKey = rest.join(".");
    if (!rootValues.has(mapKey)) {
        return null;
    }

    const value = rootValues.get(mapKey);
    // The plural "get all" lists (Asset.Images, Data.Layers, ...) are cleared for
    // production, so inline them as an empty array rather than the full literal.
    // Set bareEngine.stripGeneratedAssets: false to keep them populated instead.
    if (Array.isArray(value)) {
        return "[]";
    }

    return toInlineLiteral(value);
}

function getPropertyAccessChain(node) {
    const chain = [];
    let current = node;

    while (ts.isPropertyAccessExpression(current)) {
        chain.unshift(current.name.text);
        current = current.expression;
    }

    if (!ts.isIdentifier(current)) {
        return null;
    }

    chain.unshift(current.text);
    return chain;
}

function toInlineLiteral(value) {
    return typeof value === "number" ? String(value) : JSON.stringify(value);
}

function generateAssets(projectRoot, outputPath, imageGlobs = []) {
    try {
        const publicDir = path.join(projectRoot, "public");

        const images = collectAssetFiles(path.join(publicDir, "images"), ASSET_GENERATED_IMAGE_EXTENSIONS);
        const initialImages = collectInitialImageEntries(path.join(publicDir, "initial"));
        const sounds = collectAssetFiles(path.join(publicDir, "sounds"), ASSET_SOUND_EXTENSIONS);
        const fonts = collectAssetFiles(path.join(publicDir, "fonts"), ASSET_FONT_EXTENSIONS);
        const levels = collectAssetFiles(path.join(publicDir, "data/levels"), ASSET_LEVEL_EXTENSIONS);

        // Images/sounds/levels are referenced by their path relative to their root
        // folder without extension (eg "player/player_idle", "coin", "level"), matching
        // how the engine resolves textures, sounds and levels. Fonts use the bare name,
        // matching LoadFont(name) which appends the extension itself.
        const standardImageEntries = dedupeAssetEntries([...images, ...initialImages], file => file.relNoExt);
        // Glob-matched images (eg from public/demos/**/images) join the same Image map,
        // keyed/valued by their name relative to their images folder.
        const imageEntries = appendGlobImageEntries(standardImageEntries, collectGlobImageEntries(publicDir, imageGlobs));
        const soundEntries = dedupeAssetEntries(sounds, file => file.relNoExt);
        const fontEntries = dedupeAssetEntries(fonts, file => file.base);
        const levelEntries = dedupeAssetEntries(levels, file => file.relNoExt);

        let prefabDefs = [];
        let basePrefabDefs = [];
        let animations = [];
        let layers = [];
        const settingsPath = path.join(publicDir, "data/settingsData.json");
        if (fs.existsSync(settingsPath)) {
            const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
            prefabDefs = data.prefabs || [];
            basePrefabDefs = data.basePrefabs || [];
            animations = Object.keys(data.animations || {});
            layers = (data.layers || []).slice();
            // Mirror SettingsHandler.Process(): the engine prepends the default
            // "objects" layer at runtime, so the indices here must account for it.
            if (!layers.includes("objects")) {
                layers.unshift("objects");
            }
        }

        const prefabEntries = dedupeNamedEntries(prefabDefs.map(entity => entity.name));
        const basePrefabEntries = dedupeNamedEntries(basePrefabDefs.map(entity => entity.name));
        const animationEntries = dedupeNamedEntries(animations);
        const layerEntries = layers.map((name, index) => ({ key: toEnumKey(name), value: index }));

        const output = buildAssetsFile({
            Asset: {
                Image: imageEntries,
                Sound: soundEntries,
                Font: fontEntries,
                Level: levelEntries
            },
            Data: {
                Prefab: prefabEntries,
                BasePrefab: basePrefabEntries,
                Animation: animationEntries,
                Layer: layerEntries
            }
        });

        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
        if (existing !== output) {
            fs.writeFileSync(outputPath, output);
            console.log(`Generated assets.ts (${imageEntries.length} images, ${soundEntries.length} sounds, ${fontEntries.length} fonts, ${levelEntries.length} levels, ${prefabEntries.length} prefabs, ${basePrefabEntries.length} base prefabs, ${animationEntries.length} animations, ${layerEntries.length} layers)`);
            return true;
        }
    } catch (error) {
        console.error("Error generating assets.ts:", error);
    }
    return false;
}

// Recursively collect files with one of the given extensions, returning the
// base name (without extension) and the path relative to dir (without extension).
function collectAssetFiles(dir, extensions) {
    const results = [];
    if (!fs.existsSync(dir)) {
        return results;
    }

    const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            const ext = path.extname(entry.name).toLowerCase();
            if (!extensions.has(ext)) {
                continue;
            }
            const rel = normalize(path.relative(dir, full));
            results.push({
                base: path.basename(entry.name, path.extname(entry.name)),
                relNoExt: rel.slice(0, rel.length - path.extname(entry.name).length)
            });
        }
    };

    walk(dir);
    results.sort((a, b) => a.relNoExt.localeCompare(b.relNoExt));
    return results;
}

function collectInitialImageEntries(initialDir) {
    const images = collectAssetFiles(initialDir, ASSET_IMAGE_EXTENSIONS);
    const atlasData = collectInitialAtlasEntries(initialDir);
    const regularImages = images.filter(file => !atlasData.atlasImageRelNoExt.has(file.relNoExt));

    return [...regularImages, ...atlasData.frameEntries]
        .sort((a, b) => a.relNoExt.localeCompare(b.relNoExt));
}

function collectInitialAtlasEntries(initialDir) {
    const atlasImageRelNoExt = new Set();
    const frameEntries = [];

    if (!fs.existsSync(initialDir)) {
        return { atlasImageRelNoExt, frameEntries };
    }

    for (const filePath of getFilesRecursive(initialDir)) {
        if (path.extname(filePath).toLowerCase() !== ".json") {
            continue;
        }

        let json;
        try {
            json = JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch {
            continue;
        }

        if (!json.frames || !json.meta || !json.meta.image) {
            continue;
        }

        const relJsonPath = normalize(path.relative(initialDir, filePath));
        const atlasImageRel = normalize(path.posix.join(path.posix.dirname(relJsonPath), json.meta.image));
        atlasImageRelNoExt.add(removePathExtension(atlasImageRel));

        for (const frameName of Object.keys(json.frames)) {
            const relNoExt = frameName.split(".")[0];
            if (!relNoExt) {
                continue;
            }
            frameEntries.push({
                base: path.posix.basename(relNoExt),
                relNoExt
            });
        }
    }

    return { atlasImageRelNoExt, frameEntries };
}

function removePathExtension(value) {
    const ext = path.posix.extname(value);
    return ext ? value.slice(0, -ext.length) : value;
}

// Build { key, value } entries, skipping duplicate values and giving any
// colliding key for a different value a numeric suffix.
function toUniqueEntries(items, keyFn, valueFn) {
    const usedKeys = new Set();
    const usedValues = new Set();
    const entries = [];

    for (const item of items) {
        const base = keyFn(item);
        const value = valueFn(item);
        if (usedValues.has(value)) {
            continue;
        }

        let key = base;
        let suffix = 2;
        while (usedKeys.has(key)) {
            key = `${base}_${suffix++}`;
        }
        usedKeys.add(key);
        usedValues.add(value);
        entries.push({ key, value });
    }

    return entries;
}

// Asset files key off their CONSTANT_CASE base name, falling back to the full
// relative path when two files share a base name.
function dedupeAssetEntries(files, valueFn) {
    const baseCount = {};
    for (const file of files) {
        baseCount[toEnumKey(file.base)] = (baseCount[toEnumKey(file.base)] || 0) + 1;
    }
    const keyFn = file => baseCount[toEnumKey(file.base)] > 1 ? toEnumKey(file.relNoExt) : toEnumKey(file.base);
    return toUniqueEntries(files, keyFn, valueFn);
}

// settingsData names key off the name directly.
function dedupeNamedEntries(names) {
    return toUniqueEntries(names, toEnumKey, name => name);
}

// Collect every image under publicDir whose path (relative to public) matches one
// of the given globs. Each is keyed/valued by its path relative to the nearest
// "images" folder (just like public/images), since that is the name the engine
// resolves textures by, eg "demos/basics/images/coin" -> "coin".
function collectGlobImageEntries(publicDir, globs) {
    if (!Array.isArray(globs) || globs.length === 0 || !fs.existsSync(publicDir)) {
        return [];
    }

    const matchers = globs.map(globToRegExp);
    const results = [];
    for (const filePath of getFilesRecursive(publicDir)) {
        if (!ASSET_IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
            continue;
        }
        const rel = normalize(path.relative(publicDir, filePath));
        if (!matchers.some(re => re.test(rel))) {
            continue;
        }
        const value = relativeToImagesRoot(removePathExtension(rel));
        results.push({ keyBase: toEnumKey(value), value });
    }

    results.sort((a, b) => a.value.localeCompare(b.value));
    return results;
}

// Drop everything up to and including the last "images" path segment, so an image
// resolves by the same name the engine uses, eg "demos/foo/images/sub/coin" -> "sub/coin".
function relativeToImagesRoot(relNoExt) {
    const segments = relNoExt.split("/");
    const lastImagesIndex = segments.lastIndexOf("images");
    return lastImagesIndex === -1 ? relNoExt : segments.slice(lastImagesIndex + 1).join("/");
}

// Append glob images to the standard image entries, skipping any value already
// present and giving colliding keys a numeric suffix.
function appendGlobImageEntries(standardEntries, globEntries) {
    const usedKeys = new Set(standardEntries.map(entry => entry.key));
    const usedValues = new Set(standardEntries.map(entry => entry.value));
    const merged = standardEntries.slice();

    for (const entry of globEntries) {
        if (usedValues.has(entry.value)) {
            continue;
        }
        let key = entry.keyBase || "IMAGE";
        let suffix = 2;
        while (usedKeys.has(key)) {
            key = `${entry.keyBase}_${suffix++}`;
        }
        usedKeys.add(key);
        usedValues.add(entry.value);
        merged.push({ key, value: entry.value });
    }

    return merged;
}

// Minimal glob -> RegExp over forward-slash paths. Supports ** (any depth, also
// matching zero segments), * (within a segment) and ? (single char).
function globToRegExp(glob) {
    let source = "^";
    for (let i = 0; i < glob.length; i++) {
        const char = glob[i];
        if (char === "*") {
            if (glob[i + 1] === "*") {
                i++;
                if (glob[i + 1] === "/") {
                    i++;
                    source += "(?:[^/]+/)*"; // **/ -> zero or more directories
                } else {
                    source += ".*"; // trailing ** -> anything, including slashes
                }
            } else {
                source += "[^/]*";
            }
        } else if (char === "?") {
            source += "[^/]";
        } else if (/[.+^${}()|[\]\\]/.test(char)) {
            source += `\\${char}`;
        } else {
            source += char;
        }
    }
    return new RegExp(`${source}$`);
}

// The literal directory prefix of a glob, before the first wildcard, eg
// "demos/**/images/**" -> "demos". Used to pick a folder to watch.
function globStaticPrefix(glob) {
    const wildcardIndex = glob.search(/[*?]/);
    const staticPart = wildcardIndex === -1 ? glob : glob.slice(0, wildcardIndex);
    const lastSlash = staticPart.lastIndexOf("/");
    return lastSlash === -1 ? "" : staticPart.slice(0, lastSlash);
}

// camelCase / kebab-case / nested/paths -> CONSTANT_CASE, eg:
//   hudCoin -> HUD_COIN, Qilka-Bold -> QILKA_BOLD, player/player_idle -> PLAYER_PLAYER_IDLE
function toEnumKey(value) {
    return replaceEmojiWithNames(String(value))
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase();
}

function replaceEmojiWithNames(value) {
    let result = value;
    for (const emoji of EMOJI_KEYS_BY_LENGTH) {
        if (!result.includes(emoji)) {
            continue;
        }
        result = result.split(emoji).join(` emoji_${emojiMappingEmojiToName[emoji]} `);
    }
    return result;
}

function buildAssetsFile(groups) {
    const renderValue = value => typeof value === "number" ? value : JSON.stringify(value);
    // Image -> Images, BasePrefab -> BasePrefabs. The plural holds every value of
    // the group, so Asset.Images is the "get all" counterpart of Asset.Image.X.
    const pluralName = section => section.endsWith("y") ? `${section.slice(0, -1)}ies` : `${section}s`;

    const renderGroup = (name, entries) => {
        if (entries.length === 0) {
            return `    ${name}: {},`;
        }
        const inner = entries.map(entry => `        ${entry.key}: ${renderValue(entry.value)},`).join("\n");
        return `    ${name}: {\n${inner}\n    },`;
    };

    const renderNamespace = (name, sections) => {
        const body = Object.entries(sections)
            .map(([section, entries]) =>
                `${renderGroup(section, entries)}\n    ${pluralName(section)}: [${entries.map(entry => renderValue(entry.value)).join(", ")}],`)
            .join("\n");
        return `export const ${name} = {\n${body}\n} as const;`;
    };

    return `// Generated by bare:generated-assets Vite plugin - DO NOT EDIT.

// IMPORTANT, THESE FIELDS GET CLEARED FOR PRODUCTION:
// Asset.Images, Asset.Sounds, Asset.Fonts, Asset.Levels
// Data.Prefabs, Data.BasePrefabs, Data.Animations, Data.Layers
// IF YOU WANT TO KEEP THEM, ADD THIS IN package.json:
//  "bareEngine": {
//      "stripGeneratedAssets": false
//  }

import { Bare } from "bare-engine";

${renderNamespace("Asset", groups.Asset)}

${renderNamespace("Data", groups.Data)}

// Bridge the lists into the engine's Bare registry, which engine code reads at
// runtime. Object.values returns a mutable string[], avoiding the readonly type of
// the \`as const\` arrays.
Bare.assets.images = Object.values(Asset.Image);
Bare.assets.sounds = Object.values(Asset.Sound);
Bare.assets.fonts = Object.values(Asset.Font);
Bare.assets.levels = Object.values(Asset.Level);
Bare.data.prefabs = Object.values(Data.Prefab);
Bare.data.basePrefabs = Object.values(Data.BasePrefab);
Bare.data.animations = Object.values(Data.Animation);
Bare.data.layers = Object.values(Data.Layer);
`;
}

module.exports = {
    bareAutoRegisterClassesPlugin,
    bareEditorAndApiPlugin,
    bareGeneratedAssetsPlugin,
    bareInlineGeneratedAssetsPlugin,
    bareFullReloadPlugin,
    bareHtmlPlugin,
    bareIgnoreLevelJsonHotUpdatesPlugin,
    bareInitialAssetsPlugin,
    bareShaderRawPlugin,
    bareStripTexturePackImagesPlugin,
    bareTexturePackImagesPlugin,
    bareTypeScriptTransformPlugin,
    stripUnusedMethodsPlugin,
    readProjectPackage,
    withTransformSourcemap
};
