#!/usr/bin/env node

const path = require("node:path");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");

const projectRoot = process.cwd();
const projectRequire = createRequire(path.join(projectRoot, "package.json"));

main().catch((error) => {
    console.error(`[assets] ${error.message}`);
    process.exit(1);
});

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
    const assetpack = new AssetPack(config);

    if (watch) {
        await assetpack.watch();
    } else {
        await assetpack.run();

        // THE DEV SERVER KEEPS src/generated/assets.ts UP TO DATE. WITHOUT IT, WRITE IT HERE,
        // SO NEW IMAGES AND PREFABS TYPE-CHECK (npx tsc) RIGHT AFTER THIS SCRIPT
        if (!args.includes("--no-generate"))
            generateAssetsFile();
    }
}

function generateAssetsFile() {
    const fs = require("node:fs");
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
