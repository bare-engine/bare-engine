#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

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

    // Generate without opening so we can restyle the HTML first, then open it.
    await start({
        config: configPath,
        output: outputPath,
        mode,
        template,
        open: false,
        sourcemap
    });

    if (template === "treemap") {
        applyWebpackStyling(path.resolve(projectRoot, outputPath));
    }

    if (open) {
        openInBrowser(path.resolve(projectRoot, outputPath));
    }
}

// Restyle rollup-plugin-visualizer's treemap to visually match
// webpack-bundle-analyzer: light background, saturated pastel hues per
// top-level group, white gaps between cells, and dark labels.
function applyWebpackStyling(htmlPath) {
    if (!fs.existsSync(htmlPath)) {
        return;
    }

    let html = fs.readFileSync(htmlPath, "utf8");

    // 1. Light theme (webpack-bundle-analyzer uses a light canvas, dark text).
    html = html
        .replace("--background-color: #2b2d42;", "--background-color: #ffffff;")
        .replace("--text-color: #edf2f4;", "--text-color: #1a1a1a;");

    // 2. webpack-bundle-analyzer palette: a single pink hue (no rainbow), with
    //    light parents grading down to saturated rose leaves by depth.
    html = html
        .replace("hsl(360 * n, 0.3, 0.85)", "hsl(340, 0.6, 0.85)")
        .replace(".range([0.9, 0.3])", ".range([0.93, 0.62])")
        // Selection outline needs to be visible on a light background.
        .replace('stroke: selected ? "#fff"', 'stroke: selected ? "#333"');

    // 3. Labels grow to fill their cell like webpack/FoamTree. The visualizer
    //    caps the text scale at 1 (shrink-only), so labels stay tiny; lift the
    //    cap and trim to 80% so they fill the box without crowding it.
    html = html.split("scale = Math.min(1, scale);").join("scale = scale * 0.8;");

    // 4. Extra CSS: lighter tooltip.
    const extraCss = [
        "",
        "/* webpack-bundle-analyzer look */",
        ".tooltip { border-color: #cccccc !important; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18); }",
        ""
    ].join("\n  ");

    html = html.replace("  </style>", extraCss + "</style>");

    fs.writeFileSync(htmlPath, html);
}

function openInBrowser(filePath) {
    const url = filePath;
    const command = process.platform === "win32"
        ? "cmd"
        : process.platform === "darwin"
            ? "open"
            : "xdg-open";
    const cmdArgs = process.platform === "win32"
        ? ["/c", "start", "", url]
        : [url];

    spawn(command, cmdArgs, { stdio: "ignore", detached: true }).unref();
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
