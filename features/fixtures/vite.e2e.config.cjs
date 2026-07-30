const path = require("node:path");
const {
    bareShaderRawPlugin,
    bareTypeScriptTransformPlugin
} = require("../../vite/plugins.cjs");

const fixtureRoot = __dirname;
const repoRoot = path.resolve(__dirname, "../..");

module.exports = {
    root: fixtureRoot,
    publicDir: false,
    define: {
        __DEV__: "true",
        __BARE_GAME_ID__: JSON.stringify("bare-engine-e2e")
    },
    resolve: {
        extensions: [".ts", ".js", ".json"],
        alias: {
            "bare-engine/arcade": path.resolve(repoRoot, "src/arcade.ts"),
            "bare-engine/sopiro": path.resolve(repoRoot, "src/sopiro.ts"),
            "bare-engine": path.resolve(repoRoot, "src/index.ts")
        }
    },
    plugins: [
        bareShaderRawPlugin(),
        bareTypeScriptTransformPlugin({
            projectRoot: repoRoot,
            tsconfigPath: path.resolve(repoRoot, "tsconfig.json"),
            useTypeChecker: false,
            include: (filePath) => {
                const normalized = filePath.replace(/\\/g, "/");
                return normalized.startsWith(path.resolve(fixtureRoot, "src").replace(/\\/g, "/"))
                    || normalized.startsWith(path.resolve(repoRoot, "src").replace(/\\/g, "/"));
            }
        })
    ],
    build: {
        outDir: path.resolve(fixtureRoot, "public"),
        emptyOutDir: false,
        sourcemap: false,
        minify: false,
        commonjsOptions: {
            include: [/node_modules/]
        },
        lib: {
            entry: path.resolve(fixtureRoot, "src/game.ts"),
            name: "BareEngineBrowserTests",
            formats: ["iife"],
            fileName: () => "browser-tests.js"
        }
    }
};
