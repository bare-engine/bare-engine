const path = require("node:path");
const fs = require("node:fs");
const entryShaking = require("vite-plugin-entry-shaking");
const {
    bareAutoRegisterClassesPlugin,
    bareEditorAndApiPlugin,
    bareFullReloadPlugin,
    bareGeneratedLayersPlugin,
    bareHtmlPlugin,
    bareIgnoreLevelJsonHotUpdatesPlugin,
    bareInitialAssetsPlugin,
    bareShaderRawPlugin,
    bareStripTexturePackImagesPlugin,
    bareTexturePackImagesPlugin,
    bareTypeScriptTransformPlugin,
    stripUnusedMethodsPlugin,
    readProjectPackage
} = require("../vite/plugins.cjs");
const { resolveTexturePackImagesConfig } = require("../scripts/texturePackImagesConfig.cjs");

module.exports = ({ mode }) => {
    const projectRoot = process.cwd();
    const isDev = mode === "development";
    const engineIndexPath = path.resolve(__dirname, "index.html");
    const buildIndexPath = ensureLocalBuildIndex(projectRoot, engineIndexPath);
    const projectPackage = readProjectPackage(projectRoot);
    const stripOptions = projectPackage.bareEngine?.stripUnusedMethods;
    const autoRegisterClasses = projectPackage.bareEngine?.autoRegisterClasses !== false
        && projectPackage.bareEngine?.autoRegisterComponents !== false;
    const texturePackImages = resolveTexturePackImagesConfig(projectPackage, { warn: console.warn });

    return {
        root: projectRoot,
        base: "./",
        publicDir: path.join(projectRoot, "public"),
        define: {
            __DEV__: JSON.stringify(isDev)
        },
        resolve: {
            extensions: [".ts", ".js", ".json"]
        },
        plugins: [
            bareFilterSettingsDataWarningPlugin(),
            entryShaking.default({
                targets: [
                    path.resolve(__dirname, "../src/index.ts"),
                    path.resolve(__dirname, "../src/arcade.ts"),
                    path.resolve(__dirname, "../src/sopiro.ts")
                ]
            }),
            bareShaderRawPlugin(),
            ...(autoRegisterClasses ? [bareAutoRegisterClassesPlugin({ projectRoot })] : []),
            bareTypeScriptTransformPlugin({
                projectRoot,
                useTypeChecker: false
            }),
            bareFullReloadPlugin({ projectRoot }),
            bareIgnoreLevelJsonHotUpdatesPlugin({ projectRoot }),
            bareHtmlPlugin({
                projectRoot,
                indexHtmlPath: engineIndexPath
            }),
            bareIndexOutputPlugin(),
            bareInitialAssetsPlugin({ projectRoot }),
            bareGeneratedLayersPlugin({ projectRoot }),
            bareEditorAndApiPlugin({
                projectRoot,
                editorHtmlPath: path.resolve(__dirname, "editor.html")
            }),
            ...(!isDev && texturePackImages.stripUnused ? [bareStripTexturePackImagesPlugin({ projectRoot, texturePackImages })] : []),
            bareTexturePackImagesPlugin({
                projectRoot,
                runOnStart: true
            }),
            ...(!isDev && stripOptions !== false ? [stripUnusedMethodsPlugin(typeof stripOptions === "object" ? stripOptions : {})] : [])
        ],
        server: {
            open: false,
            watch: {
                ignored: [
                    "**/node_modules/**",
                    "**/dist/**",
                    "**/src/_bareTypes/layer.ts"
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
                include: [/node_modules/, /src[\\/]libraries[\\/]howler[\\/]howler\.core\.js/]
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

function isSettingsDataPublicImportWarning(message) {
    const text = String(message).replace(/\\/g, "/");

    return text.includes("Assets in public directory cannot be imported from JavaScript")
        && text.includes("/public/data/settingsData.json");
}

function bareIndexOutputPlugin() {
    let outDir = "";

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
                .replace(/src="\.\.\/\.\.\/bundle\.min\.js"/g, 'src="./bundle.min.js"');

            fs.writeFileSync(outputPath, html);
            fs.rmSync(path.join(outDir, "node_modules"), { recursive: true, force: true });
        }
    };
}

