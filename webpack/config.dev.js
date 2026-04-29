const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");
const webpack = require("webpack");
const fs = require("fs");
const InjectInitialAssetsPlugin = require("./InjectInitialAssetsPlugin");
const WatchTexturePackImagesPlugin = require("./WatchTexturePackImagesPlugin");
const createControllerProxyTransformer = require("./controllerProxyTransformer");
const createGameObjectNameTransformer = require("./gameObjectNameTransformer");
const GenerateLayersPlugin = require("./GenerateLayersPlugin");

// Counter for skip reload requests (handles rapid successive saves)
let skipReloadCount = 0;
let skipReloadTimeout = null;
let skipReloadNextOk = false;
let lastSettingsDataPath = "";


const watchTexturePackImagesPlugin = new WatchTexturePackImagesPlugin({
    watchDir: path.join(__dirname, "../texturePackImages"),
    reloadPath: "/assets/initial",
    buildCommand: ["npm", "run", "build:assets"],
    buildCwd: process.cwd(),
    runOnStart: true
});

function startSkipReloadWindow(count = 1, timeoutMs = 500) {
    skipReloadCount += count;
    if (skipReloadTimeout) {
        clearTimeout(skipReloadTimeout);
    }
    skipReloadTimeout = setTimeout(() => {
        skipReloadCount = 0;
        skipReloadTimeout = null;
    }, timeoutMs);
}

module.exports = {
    mode: "development",
    devtool: "eval-source-map",
    entry: "./src/game.ts",
    output: {
        path: path.resolve(process.cwd(), 'dist'),
        filename: "bundle.min.js"
    },
    resolve: {
        extensions: [".ts", ".js", ".json"],
        alias: {
        }
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader"
                }
            },
            {
                test: /\.tsx?$/,
                exclude: /node_modules[\\/](?!bare-engine)/,
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            transpileOnly: false,
                            getCustomTransformers: (program) => ({
                                before: [createControllerProxyTransformer(program), createGameObjectNameTransformer(program)]
                            })
                        }
                    }
                ]
            },
            {
                test: [/\.vert$/, /\.frag$/],
                use: "raw-loader"
            },
            {
                test: /\.(gif|png|jpe?g|svg|xml|glsl)$/i,
                use: "file-loader"
            }
        ]
    },
    plugins: [
        new CleanWebpackPlugin({
            cleanOnceBeforeBuildPatterns: [path.join(__dirname, "dist/**/*")]
        }),
        new HtmlWebpackPlugin({
            template: "./public/index.html",
            scriptLoading: "blocking",
            inject: 'head'
        }),
		new webpack.DefinePlugin({
			__DEV__: JSON.stringify(true)
		}),
        new InjectInitialAssetsPlugin(),
        new GenerateLayersPlugin(),
        watchTexturePackImagesPlugin
    ],
    watchOptions: {
        ignored: [
            '**/node_modules/**',
            '**/public/assets/data/levels/**',
            '**/dist/**',
            '**/src/_bareTypes/layer.ts',
			'**/levels/**' // ADDED JUST FOR DEMO, TO IGNORE EVERY LEVEL FOLDER
        ],
        aggregateTimeout: 100,
        poll: false
    },
    cache: {
        type: 'memory'
    },
    devServer: {
        static: {
            directory: path.join(__dirname, '../public'),
            watch: {
                ignored: [
                    '**/public/assets/data/levels/**',
					'**/levels/**' // ADDED JUST FOR DEMO, TO IGNORE EVERY LEVEL FOLDER
                    // Note: NOT ignoring settingsData.json here so manual edits trigger reload
                ]
            }
        },
        hot: false,
        liveReload: true,
        open: false,
        setupMiddlewares: (middlewares, devServer) => {
            if (!devServer) {
                throw new Error('webpack-dev-server is not defined');
            }

            watchTexturePackImagesPlugin.attachDevServer(devServer);

            // Intercept HMR/reload messages
            const originalSendMessage = devServer.sendMessage.bind(devServer);
            devServer.sendMessage = function(clients, type, data) {
                //console.log(`[dev-server] message: ${type}`, data);
                if (type === "ok") {
                    if (watchTexturePackImagesPlugin.shouldSuppressOk()) {
                        return;
                    }
                    const initialChanged = Boolean(devServer.compiler.__lastInitialAssetsChanged);
                    if (skipReloadNextOk && !initialChanged) {
                        skipReloadNextOk = false;
                        console.log("[dev-server] Skipping ok reload for entity data write");
                        return;
                    }
                    skipReloadNextOk = false;
                }
                if (shouldSkipReload(type, data)) {
                    skipReloadCount--;
                    console.log(`Skipping reload message: ${type} (remaining skips: ${skipReloadCount})`);
                    return;
                }
                if (watchTexturePackImagesPlugin.shouldSuppressMessage(type, data)) {
                    return;
                }
                return originalSendMessage(clients, type, data);
            };

            // Save level endpoint
            devServer.app.post('/api/save-level', (req, res) => {
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });
                req.on('end', () => {
                    try {
                        const { levelData, levelPath } = JSON.parse(body);
                        const fullPath = path.join(__dirname, '../public', levelPath);
                        const dir = path.dirname(fullPath);
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }
                        fs.writeFileSync(fullPath, JSON.stringify(levelData, null, 2));
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                            success: true,
                            message: `Level saved to ${fullPath}`
                        }));
                    } catch (error) {
                        console.error('Save error:', error);
                        res.status(500).setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: error.message }));
                    }
                });
            });

            // Create level endpoint
            devServer.app.post('/api/create-level', (req, res) => {
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });
                req.on('end', () => {
                    try {
                        const { levelData, path: levelPath } = JSON.parse(body);
                        if (!levelData || !levelData.name) {
                            throw new Error('levelData.name is required');
                        }
                        if (!levelPath) {
                            throw new Error('path is required');
                        }

                        const safePath = String(levelPath);
                        if (safePath.includes("..") || safePath.startsWith("..")) {
                            throw new Error('Invalid path');
                        }

                        const fullPath = path.join(__dirname, '../public', safePath);
                        const dir = path.dirname(fullPath);

                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }

                        if (fs.existsSync(fullPath)) {
                            res.status(409).setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ error: `Level already exists: ${safePath}` }));
                            return;
                        }

                        fs.writeFileSync(fullPath, JSON.stringify(levelData, null, 2));
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                            success: true,
                            message: `Level created at ${fullPath}`,
                            path: safePath
                        }));
                    } catch (error) {
                        console.error('Create level error:', error);
                        res.status(500).setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: error.message }));
                    }
                });
            });

            // Remove level endpoint
            devServer.app.post('/api/remove-level', (req, res) => {
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });
                req.on('end', () => {
                    try {
                        const { path: levelPath } = JSON.parse(body);
                        if (!levelPath) {
                            throw new Error('path is required');
                        }

                        const safePath = String(levelPath);
                        if (safePath.includes("..") || safePath.startsWith("..")) {
                            throw new Error('Invalid path');
                        }

                        const fullPath = path.join(__dirname, '../public', safePath);
                        if (!fs.existsSync(fullPath)) {
                            res.status(404).setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ error: `Level not found: ${safePath}` }));
                            return;
                        }

                        fs.unlinkSync(fullPath);
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                            success: true,
                            message: `Level removed at ${fullPath}`,
                            path: safePath
                        }));
                    } catch (error) {
                        console.error('Remove level error:', error);
                        res.status(500).setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: error.message }));
                    }
                });
            });

            // Save entity data endpoint
            devServer.app.post('/api/save-entity-data', (req, res) => {
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });
                req.on('end', () => {
                    try {
                        const { settingsData, path: customPath, skipReload } = JSON.parse(body);
                        if (!settingsData) {
                            throw new Error('No settingsData provided');
                        }

                        const fileName = (settingsData && typeof settingsData === "object" && settingsData.name)
                            ? `${settingsData.name}.json`
                            : "settingsData.json";
                        const relativePath = customPath
                            ? path.join(customPath, fileName)
                            : path.join('assets/data', fileName);
                        const fullPath = path.join(__dirname, '../public', relativePath);
                        const dir = path.dirname(fullPath);
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }

                        // Increment skip counter BEFORE writing file
                        // Skip reload for entity data writes
                        if (skipReload) {
                            startSkipReloadWindow(1);
                            skipReloadNextOk = true;
                            console.log(`Skip reload count: ${skipReloadCount}`);
                        }

                        const jsonStr = JSON.stringify(settingsData, null, 2).replace(
                            /\[\n(\s*"[^"]*",?\n)+\s*\]/g,
                            match => match.replace(/\n\s*/g, ' ').replace('[ ', '[').replace(' ]', ']')
                        );
                        fs.writeFileSync(fullPath, jsonStr);

                        // Track last entity data path for reload suppression.
                        lastSettingsDataPath = relativePath.replace(/\\/g, "/");

                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                            success: true,
                            message: `Entity data saved to ${fullPath}`
                        }));
                    } catch (error) {
                        console.error('Entity save error:', error);
                        res.status(500).setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: error.message }));
                    }
                });
            });

            // List files endpoint
            devServer.app.get('/api/list-files', (req, res) => {
                try {
                    const folderPath = req.query.path;
                    const recursive = req.query.recursive === 'true';
                    const fullPath = path.join(__dirname, '../public', folderPath);

                    if (!fs.existsSync(fullPath)) {
                        res.status(404).setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: 'Folder not found' }));
                        return;
                    }

                    let files;

                    if (recursive) {
                        function getAllFiles(dirPath, arrayOfFiles = []) {
                            const entries = fs.readdirSync(dirPath);

                            entries.forEach(entry => {
                                const entryPath = path.join(dirPath, entry);
                                if (fs.statSync(entryPath).isDirectory()) {
                                    arrayOfFiles = getAllFiles(entryPath, arrayOfFiles);
                                } else {
                                    arrayOfFiles.push(path.relative(fullPath, entryPath));
                                }
                            });

                            return arrayOfFiles;
                        }

                        files = getAllFiles(fullPath);
                    } else {
                        files = fs.readdirSync(fullPath);
                    }

                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ files }));
                } catch (error) {
                    console.error('List files error:', error);
                    res.status(500).setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: error.message }));
                }
            });

            return middlewares;
        }
    }
};

function shouldSkipReload(type, data) {
    if (skipReloadCount <= 0) {
        return false;
    }

    const skippableTypes = ['static-changed', 'content-changed'];
    if (!skippableTypes.includes(type)) {
        return false;
    }

    return isSettingsDataChange(data);
}

function isSettingsDataChange(data) {
    const lastPath = lastSettingsDataPath;
    const matches = value =>
        typeof value === 'string'
        && (value.replace(/\\/g, "/").includes("assets/data/settingsData.json")
            || (lastPath && value.replace(/\\/g, "/").includes(lastPath)));

    if (matches(data)) {
        return true;
    }

    if (Array.isArray(data)) {
        return data.some(matches);
    }

    if (data && typeof data === 'object') {
        return matches(data.filename)
            || matches(data.path)
            || matches(data.file)
            || matches(data.filepath);
    }

    return false;
}
