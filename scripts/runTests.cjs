const { spawnSync } = require("node:child_process");
const path = require("node:path");

const requestedScene = process.argv[2];

if (requestedScene) 
{
    process.env.BARE_TEST_SCENE = requestedScene;
}

const cucumberBin = path.resolve(__dirname, "../node_modules/@cucumber/cucumber/bin/cucumber.js");
const result = spawnSync(process.execPath, [cucumberBin], {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
});

process.exit(result.status ?? 1);
