const fs = require("node:fs");
const path = require("node:path");
const { bareHtmlPlugin } = require("../../vite/plugins.cjs");

const fixtureRoot = __dirname;
const indexHtmlPath = path.resolve(__dirname, "../../config/index.html");
const gameId = "bare-engine-e2e";

function renderFixtureHtml(bootstrap) {
    const html = fs.readFileSync(indexHtmlPath, "utf8");
    const plugin = bareHtmlPlugin({
        projectRoot: fixtureRoot,
        indexHtmlPath,
        gameId,
        bootstrap
    });

    return plugin.transformIndexHtml.handler(html);
}

module.exports = { renderFixtureHtml };
