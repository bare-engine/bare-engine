#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = process.cwd();
const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || defaultConfigPath(projectRoot);
const outputPath = args.output || args.o || path.join("dist", "stats.html");
const mode = args.mode || args.m || "production";
const template = args.template || args.t || "treemap";
const open = parseBoolean(args.open, true);
const sourcemap = parseBoolean(args.sourcemap, false);

run().catch(error => {
    console.error(error);
    process.exit(1);
});

async function run() {
    const start = (await import("vite-bundle-visualizer")).default;

    await start({
        config: configPath,
        output: outputPath,
        mode,
        template,
        open,
        sourcemap
    });
}

function defaultConfigPath(root) {
    const localConfig = path.join(root, "vite.config.cjs");

    return fs.existsSync(localConfig)
        ? localConfig
        : require.resolve("../config/vite.config.cjs");
}

function parseArgs(values) {
    const parsed = {};

    for (let index = 0; index < values.length; index++) {
        const value = values[index];
        if (!value.startsWith("--") && !value.startsWith("-")) {
            continue;
        }

        const name = value.replace(/^-+/, "");
        const next = values[index + 1];

        if (!next || next.startsWith("-")) {
            parsed[name] = true;
            continue;
        }

        parsed[name] = next;
        index++;
    }

    return parsed;
}

function parseBoolean(value, fallback) {
    if (value === undefined) {
        return fallback;
    }

    if (typeof value === "boolean") {
        return value;
    }

    return value === "true" || value === "1";
}
