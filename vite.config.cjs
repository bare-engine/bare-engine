const {
    bareShaderRawPlugin
} = require("./vite/plugins.cjs");

module.exports = {
    define: {
        __DEV__: "false"
    },
    plugins: [
        bareShaderRawPlugin()
    ],
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: true,
        commonjsOptions: {
            include: [/node_modules/, /src[\\/]libraries[\\/]howler[\\/]howler\.core\.js/]
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
