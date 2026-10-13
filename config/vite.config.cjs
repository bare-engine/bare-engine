const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const entryShaking = require("bare-tools/entry-shaking");
const {
    bareAutoRegisterClassesPlugin,
    bareEditorAndApiPlugin,
    bareFullReloadPlugin,
    bareGeneratedAssetsPlugin,
    bareHtmlPlugin,
    bareIgnoreLevelJsonHotUpdatesPlugin,
    bareInitialAssetsPlugin,
    bareInlineGeneratedAssetsPlugin,
    bareShaderRawPlugin,
    bareStripTexturePackImagesPlugin,
    bareTexturePackImagesPlugin,
    bareTypeScriptTransformPlugin,
    stripUnusedMethodsPlugin,
    readProjectPackage,
    withTransformSourcemap
} = require("../vite/plugins.cjs");
const { resolveTexturePackImagesConfig } = require("../scripts/texturePackImagesConfig.cjs");

module.exports = ({ mode }) => {
    const projectRoot = process.cwd();
    const isDev = mode === "development";
    const engineIndexPath = path.resolve(__dirname, "index.html");
    const buildIndexPath = ensureLocalBuildIndex(projectRoot, engineIndexPath);
    const projectPackage = readProjectPackage(projectRoot);
    const gameId = ensureGameId(projectRoot, projectPackage);
    const stripOptions = projectPackage.bareEngine?.stripUnusedMethods;
    // Opt in: inlines Asset.X.Y to literals and leaves src/generated/assets.ts out of the build,
    // which only works when the code uses full paths. See bareInlineGeneratedAssetsPlugin.
    const stripGeneratedAssets = projectPackage.bareEngine?.stripGeneratedAssets === true;
    // Strip the editor-only inspector decorators in prod so decorators.ts tree-shakes away.
    // On by default for prod builds; opt out with "bareEngine.stripDecorators": false.
    const stripDecorators = !isDev && projectPackage.bareEngine?.stripDecorators !== false;
    const autoRegisterClasses = projectPackage.bareEngine?.autoRegisterClasses !== false;
    const texturePackImages = resolveTexturePackImagesConfig(projectPackage);

    return {
        root: projectRoot,
        base: "./",
        publicDir: path.join(projectRoot, "public"),
        define: {
            __DEV__: JSON.stringify(isDev),
            __BARE_GAME_ID__: JSON.stringify(gameId),
            __STRIP_GENERATED_ASSETS__: JSON.stringify(stripGeneratedAssets)
        },
        resolve: {
            extensions: [".ts", ".js", ".json"]
        },
        plugins: [
            bareTerminalTitlePlugin(projectPackage.bareEngine?.index?.title || projectPackage.bareEngine?.name || projectPackage.name),
            bareFilterSettingsDataWarningPlugin(),
            ...withTransformSourcemap(entryShaking.default({
                targets: [
                    path.resolve(__dirname, "../src/index.ts"),
                    path.resolve(__dirname, "../src/arcade.ts"),
                    path.resolve(__dirname, "../src/sopiro.ts")
                ]
            })),
            bareShaderRawPlugin(),
            ...(autoRegisterClasses ? [bareAutoRegisterClassesPlugin({ projectRoot })] : []),
            bareTypeScriptTransformPlugin({
                projectRoot,
                useTypeChecker: false,
                stripDecorators
            }),
            bareFullReloadPlugin({ projectRoot }),
            bareIgnoreLevelJsonHotUpdatesPlugin({ projectRoot }),
            bareHtmlPlugin({
                projectRoot,
                indexHtmlPath: engineIndexPath,
                gameId,
                isDev
            }),
            bareIndexOutputPlugin(),
            bareInitialAssetsPlugin({ projectRoot }),
            bareGeneratedAssetsPlugin({ projectRoot, imageGlobs: projectPackage.bareEngine?.imageGlobs }),
            ...(!isDev && stripGeneratedAssets ? [bareInlineGeneratedAssetsPlugin({ projectRoot })] : []),
            bareEditorAndApiPlugin({
                projectRoot,
                editorHtmlPath: path.resolve(__dirname, "editor.html")
            }),
            ...(!isDev && texturePackImages.stripUnused ? [bareStripTexturePackImagesPlugin({ projectRoot, texturePackImages })] : []),
            bareTexturePackImagesPlugin({
                projectRoot,
                runOnStart: true
            }),
            ...(!isDev && stripOptions !== false ? [stripUnusedMethodsPlugin(typeof stripOptions === "object" ? stripOptions : {})] : []),
            ...(!isDev ? [barePublicCopyPlugin()] : [])
        ],
        server: {
            open: false,
            // Transform the entry (and, via pre-transform, its whole import graph) as soon as
            // the server starts, instead of waiting for the browser's first request. Every
            // module goes through the TypeScript transformer, so a cold first load is slow.
            warmup: {
                clientFiles: ["./src/game.ts"]
            },
            watch: {
                ignored: [
                    "**/node_modules/**",
                    "**/dist/**",
                    "**/src/generated/assets.ts"
                ]
            }
        },
        esbuild: {
            // Class names are kept by vite/classNameTransformer.js instead. keepNames would also
            // wrap every named function in an Object.defineProperty call, which is slow in hot code
            keepNames: false
        },
        build: {
            outDir: path.join(projectRoot, "dist"),
            emptyOutDir: true,
            // public/ is copied by barePublicCopyPlugin, without its .gitkeep placeholders
            copyPublicDir: false,
            sourcemap: false,
            minify: "esbuild",
            target: "es2020",
            commonjsOptions: {
                include: [/node_modules/]
            },
            rollupOptions: {
                input: {
                    index: buildIndexPath
                },
                output: {
                    entryFileNames: "bundle.min.js",
                    chunkFileNames: "[name]-[hash].js",
                    assetFileNames: "[name]-[hash][extname]"
                }
            }
        }
    };
};

function ensureGameId(projectRoot, projectPackage) {
    const configuredGameId = typeof projectPackage.bareEngine?.gameId === "string"
        ? projectPackage.bareEngine.gameId.trim()
        : "";

    if (configuredGameId && configuredGameId !== "ID") {
        return configuredGameId;
    }

    const gameId = randomUUID();
    projectPackage.bareEngine = {
        ...(projectPackage.bareEngine || {}),
        gameId
    };

    const packagePath = path.join(projectRoot, "package.json");
    const original = fs.readFileSync(packagePath, "utf8");
    const indentMatch = original.match(/^[\t ]+(?=")/m);
    const indent = indentMatch?.[0] || "  ";
    const newline = original.includes("\r\n") ? "\r\n" : "\n";
    const serialized = JSON.stringify(projectPackage, null, indent).replace(/\n/g, newline) + newline;
    fs.writeFileSync(packagePath, serialized, "utf8");

    console.info(`[bare] Generated bareEngine.gameId "${gameId}" and saved it to package.json.`);
    return gameId;
}

function ensureLocalBuildIndex(projectRoot, engineIndexPath) {
    const outputPath = path.join(projectRoot, "node_modules/.bare-engine/index.html");
    const html = fs.readFileSync(engineIndexPath, "utf8");

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const existing = fs.existsSync(outputPath)
        ? fs.readFileSync(outputPath, "utf8")
        : "";

    if (existing !== html) {
        fs.writeFileSync(outputPath, html);
    }

    return outputPath;
}

function bareTerminalTitlePlugin(title) {
    return {
        name: "bare:terminal-title",
        apply: "serve",
        configureServer() {
            if (!title || !process.stdout.isTTY) {
                return;
            }

            // OSC escape sequence: set the terminal/console window title.
            process.stdout.write(`\x1b]0;${title}\x07`);
        }
    };
}

function bareFilterSettingsDataWarningPlugin() {
    return {
        name: "bare:filter-settings-data-warning",
        configResolved(config) {
            const logger = config.logger;
            const warn = logger.warn.bind(logger);
            const warnOnce = logger.warnOnce.bind(logger);

            logger.warn = (message, options) => {
                if (isSettingsDataPublicImportWarning(message)) {
                    return;
                }

                warn(message, options);
            };

            logger.warnOnce = (message, options) => {
                if (isSettingsDataPublicImportWarning(message)) {
                    return;
                }

                warnOnce(message, options);
            };
        }
    };
}

// Copies public/ into the build like Vite's copyPublicDir, but leaves out .gitkeep placeholders and the
// folders that would only hold them. Copying them and deleting them afterwards failed the build on Windows
// now and then: an editor's file watcher or a virus scanner can hold a just-copied folder open for seconds
function barePublicCopyPlugin() {
    let publicDir = "";
    let outDir = "";

    return {
        name: "bare:public-copy",
        apply: "build",
        configResolved(config) {
            publicDir = config.publicDir;
            outDir = path.resolve(config.build.outDir);
        },
        // after the bundle is written and before closeBundle, where other plugins edit the copied files
        writeBundle(_options, bundle) {
            if (publicDir && fs.existsSync(publicDir))
                copyPublicFiles(publicDir, outDir, new Set(Object.keys(bundle)));
        }
    };
}

// written: bundle output paths. Those win over a public file at the same path, as with Vite's own copy
function copyPublicFiles(fromDir, toDir, written, relativeDir = "") {
    for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
        const fromPath = path.join(fromDir, entry.name);
        const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

        if (fs.statSync(fromPath).isDirectory()) {
            copyPublicFiles(fromPath, path.join(toDir, entry.name), written, relativePath);
        } else if (entry.name !== ".gitkeep" && !written.has(relativePath)) {
            // folders are made for the files that go in them, so a placeholder-only folder never exists
            fs.mkdirSync(toDir, { recursive: true });
            fs.copyFileSync(fromPath, path.join(toDir, entry.name));
        }
    }
}

function isSettingsDataPublicImportWarning(message) {
    const text = String(message).replace(/\\/g, "/");

    return text.includes("Assets in public directory cannot be imported from JavaScript")
        && text.includes("/public/data/settingsData.json");
}

function bareIndexOutputPlugin() {
    // Same purpose as the initial-assets version stamp: entryFileNames is a fixed
    // "bundle.min.js" (not content-hashed), so without this a redeploy can leave
    // browsers serving a stale cached bundle against fresh index.html/assets
    const version = Date.now().toString(36);

    return {
        name: "bare:index-output",
        // "post" so vite:build-html has already emitted the page into the bundle;
        // moving it here (before it's written) also makes Vite log dist/index.html
        enforce: "post",
        generateBundle(_options, bundle) {
            for (const [fileName, item] of Object.entries(bundle)) {
                if (item.type !== "asset" || !fileName.replace(/\\/g, "/").endsWith("node_modules/.bare-engine/index.html")) {
                    continue;
                }

                // The page was built at node_modules/.bare-engine/, so its bundle path climbs two folders
                item.source = String(item.source)
                    .replace(/src="\.\.\/\.\.\/bundle\.min\.js"/g, `src="./bundle.min.js?v=${version}"`);

                delete bundle[fileName];
                item.fileName = "index.html";
                bundle["index.html"] = item;
                return;
            }
        }
    };
}

