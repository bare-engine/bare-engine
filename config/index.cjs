const createBareViteConfig = require("./vite.config.cjs");

function defineBareConfig(options = {}) {
    return (env) => {
        const config = createBareViteConfig(env);
        const projectPlugins = normalizePlugins(
            typeof options.plugins === "function"
                ? options.plugins(env, config)
                : options.plugins
        );

        return {
            ...config,
            plugins: [
                ...(config.plugins || []),
                ...projectPlugins
            ]
        };
    };
}

function normalizePlugins(plugins) {
    if (!plugins)
        return [];

    return Array.isArray(plugins) ? plugins : [plugins];
}

module.exports = {
    defineBareConfig
};
