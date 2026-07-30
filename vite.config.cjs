const {
    bareShaderRawPlugin
} = require("./vite/plugins.cjs");

module.exports = {
    define: {
        __DEV__: "false",
        __BARE_GAME_ID__: JSON.stringify("bare-engine-library")
    },
    plugins: [
        bareShaderRawPlugin()
    ],
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: true,
        commonjsOptions: {
            include: [/node_modules/]
        },
        lib: {
            entry: "src/index.ts",
            name: "BareEngine",
            formats: ["umd"],
            fileName: () => "bare-engine.js"
        },
        rollupOptions: {
            output: {
                exports: "named"
            }
        }
    }
};
