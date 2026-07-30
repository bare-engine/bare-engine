const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const entryShaking = require("vite-plugin-entry-shaking");
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
    const stripGeneratedAssets = projectPackage.bareEngine?.stripGeneratedAssets;
    // Strip the editor-only inspector decorators in prod so decorators.ts tree-shakes away.
    // On by default for prod builds; opt out with "bareEngine.stripDecorators": false.
    const stripDecorators = !isDev && projectPackage.bareEngine?.stripDecorators !== false;
    const autoRegisterClasses = projectPackage.bareEngine?.autoRegisterClasses !== false
        && projectPackage.bareEngine?.autoRegisterComponents !== false;
    const texturePackImages = resolveTexturePackImagesConfig(projectPackage, { warn: console.warn });

    return {
        root: projectRoot,
        base: "./",
        publicDir: path.join(projectRoot, "public"),
        define: {
            __DEV__: JSON.stringify(isDev),
            __BARE_GAME_ID__: JSON.stringify(gameId),
            __STRIP_GENERATED_ASSETS__: JSON.stringify(stripGeneratedAssets !== false)
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
                gameId
            }),
            bareIndexOutputPlugin(),
            bareInitialAssetsPlugin({ projectRoot }),
            bareGeneratedAssetsPlugin({ projectRoot, imageGlobs: projectPackage.bareEngine?.imageGlobs }),
            ...(!isDev && stripGeneratedAssets !== false ? [bareInlineGeneratedAssetsPlugin({ projectRoot })] : []),
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
            ...(!isDev ? [bareRemoveBuildPlaceholdersPlugin()] : [])
        ],
        server: {
            open: false,
            watch: {
                ignored: [
                    "**/node_modules/**",
                    "**/dist/**",
                    "**/src/generated/assets.ts"
                ]
            }
        },
        esbuild: {
            keepNames: true
        },
        build: {
            outDir: path.join(projectRoot, "dist"),
            emptyOutDir: true,
            copyPublicDir: true,
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

function bareRemoveBuildPlaceholdersPlugin() {
    let outDir = "";

    return {
        name: "bare:remove-build-placeholders",
        apply: "build",
        configResolved(config) {
            outDir = path.resolve(config.build.outDir);
        },
        closeBundle() {
            removeBuildPlaceholders(outDir, true);
        }
    };
}

function removeBuildPlaceholders(directory, isRoot = false) {
    if (!fs.existsSync(directory)) {
        return;
    }

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            removeBuildPlaceholders(entryPath);
        } else if (entry.isFile() && entry.name === ".gitkeep") {
            fs.rmSync(entryPath);
        }
    }

    if (!isRoot && fs.readdirSync(directory).length === 0) {
        fs.rmdirSync(directory);
    }
}

function isSettingsDataPublicImportWarning(message) {
    const text = String(message).replace(/\\/g, "/");

    return text.includes("Assets in public directory cannot be imported from JavaScript")
        && text.includes("/public/data/settingsData.json");
}

function bareIndexOutputPlugin() {
    let outDir = "";
    // Same purpose as the initial-assets version stamp: entryFileNames is a fixed
    // "bundle.min.js" (not content-hashed), so without this a redeploy can leave
    // browsers serving a stale cached bundle against fresh index.html/assets
    const version = Date.now().toString(36);

    return {
        name: "bare:index-output",
        configResolved(config) {
            outDir = config.build.outDir;
        },
        generateBundle(_options, bundle) {
            for (const [fileName, item] of Object.entries(bundle)) {
                if (fileName.replace(/\\/g, "/").endsWith("node_modules/.bare-engine/index.html")) {
                    delete bundle[fileName];
                    item.fileName = "index.html";
                    bundle["index.html"] = item;
                    return;
                }
            }
        },
        closeBundle() {
            const nestedPath = path.join(outDir, "node_modules/.bare-engine/index.html");
            const outputPath = path.join(outDir, "index.html");

            if (!fs.existsSync(nestedPath)) {
                return;
            }

            const html = fs.readFileSync(nestedPath, "utf8")
                .replace(/src="\.\.\/\.\.\/bundle\.min\.js"/g, `src="./bundle.min.js?v=${version}"`);

            fs.writeFileSync(outputPath, html);
            fs.rmSync(path.join(outDir, "node_modules"), { recursive: true, force: true });
        }
    };
}

