const createDevConfig = () => require("../webpack/config.dev");
const createProdConfig = () => require("../webpack/config.prod");

module.exports = (env = {}, argv = {}) => {
    const mode = argv.mode || env.mode || process.env.NODE_ENV || "production";

    return mode === "development"
        ? createDevConfig()
        : createProdConfig();
};
