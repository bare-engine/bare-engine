const { spawnSync } = require("node:child_process");
const path = require("node:path");

const requestedScene = process.argv[2];

if (requestedScene) 
{
    process.env.BARE_TEST_SCENE = requestedScene;
}

// on windows the repo can be opened as c:\ or C:\; node caches modules by exact path, so a lowercase
// cucumber bin plus uppercase-resolved step definitions loads cucumber twice ("instance of Cucumber that
// isn't running"). always use an uppercase drive letter so both sides agree
const upperDrive = (p) => (/^[a-z]:/.test(p) ? p[0].toUpperCase() + p.slice(1) : p);
const root = upperDrive(path.resolve(__dirname, ".."));

const cucumberBin = path.join(root, "node_modules/@cucumber/cucumber/bin/cucumber.js");
const result = spawnSync(process.execPath, [cucumberBin], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
});

process.exit(result.status ?? 1);
