#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");

const projectRoot = process.cwd();
const projectRequire = createRequire(path.join(projectRoot, "package.json"));

if (require.main === module) {
    main().catch((error) => {
        console.error(`[assets] ${error.message}`);
        process.exit(1);
    });
}

module.exports = { installPackedOutput };

async function main() {
    const args = process.argv.slice(2);
    if (args.includes("--help") || args.includes("-h")) {
        printHelp();
        return;
    }

    const configPath = getConfigPath(args) || path.resolve(__dirname, "../config/assetpack.config.mjs");
    const watch = args.includes("--watch") || args.includes("-w");
    const { AssetPack } = await importProjectPackage("bare-tools/assetpack");
    const configModule = await import(pathToFileURL(configPath).href);
    const config = configModule.default || configModule;

    if (watch) {
        await new AssetPack(config).watch();
    } else {
        await packWithoutGap(AssetPack, config);

        // THE DEV SERVER KEEPS src/generated/assets.ts UP TO DATE. WITHOUT IT, WRITE IT HERE,
        // SO NEW IMAGES AND PREFABS TYPE-CHECK (npx tsc) RIGHT AFTER THIS SCRIPT
        if (!args.includes("--no-generate"))
            generateAssetsFile();
    }
}

// AssetPack empties its output folder before writing, and a dev server watching it would read that
// moment as "no images". So pack into a temp folder, then move the result in without a gap.
async function packWithoutGap(AssetPack, config) {
    const outputDir = path.resolve(projectRoot, config.output || "./public/initial/generated");
    // in node_modules, which dev servers don't watch, and on the same drive, so a move is a rename.
    // One folder per process, because AssetPack also writes into the output's parent
    const tempRoot = path.join(projectRoot, "node_modules/.bare-engine/assetpack", String(process.pid));
    const tempDir = path.join(tempRoot, "generated");
    fs.rmSync(tempRoot, { recursive: true, force: true });

    try {
        await new AssetPack({ ...config, output: tempDir }).run();
        installPackedOutput(tempDir, outputDir);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}

// Renames each new file over its old one, json last so it never names frames of an image that
// isn't there yet, then removes old files the new pack doesn't have. Unchanged files aren't touched.
function installPackedOutput(fromDir, toDir) {
    fs.mkdirSync(toDir, { recursive: true });
    const names = fs.readdirSync(fromDir).sort((a, b) => a.endsWith(".json") - b.endsWith(".json"));

    for (const name of names) {
        const from = path.join(fromDir, name);
        const to = path.join(toDir, name);
        if (fs.existsSync(to) && fs.readFileSync(from).equals(fs.readFileSync(to)))
            continue;
        try {
            fs.renameSync(from, to);
        } catch {
            // on Windows a file a reader has open can't be renamed over
            fs.copyFileSync(from, to);
        }
    }

    for (const name of fs.readdirSync(toDir))
        if (!names.includes(name))
            fs.rmSync(path.join(toDir, name), { recursive: true, force: true });
}

function generateAssetsFile() {
    const { generateAssets } = require("../vite/plugins.cjs");

    let imageGlobs = [];
    try {
        const projectPackage = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
        imageGlobs = projectPackage.bareEngine?.imageGlobs ?? [];
    } catch {}

    generateAssets(projectRoot, path.join(projectRoot, "src/generated/assets.ts"), imageGlobs);
}

function printHelp() {
    console.log(`Usage: bare-engine-assets [options]

Options:
  -c, --config <path>  Use a custom AssetPack config
  -w, --watch          Watch asset inputs for changes
      --no-generate    Don't write src/generated/assets.ts afterwards
  -h, --help           Show this help
`);
}

async function importProjectPackage(specifier) {
    try {
        return await import(pathToFileURL(projectRequire.resolve(specifier)).href);
    } catch (error) {
        if (error.code !== "MODULE_NOT_FOUND" && error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
            throw error;
        }
    }

    try {
        return await import(specifier);
    } catch (error) {
        throw new Error(
            `Could not load ${specifier}. bare-tools should be installed with bare-engine; try running npm install again.`,
            { cause: error }
        );
    }
}

function getConfigPath(args) {
    const longIndex = args.indexOf("--config");
    if (longIndex !== -1 && args[longIndex + 1]) {
        return path.resolve(projectRoot, args[longIndex + 1]);
    }

    const shortIndex = args.indexOf("-c");
    if (shortIndex !== -1 && args[shortIndex + 1]) {
        return path.resolve(projectRoot, args[shortIndex + 1]);
    }

    return "";
}
