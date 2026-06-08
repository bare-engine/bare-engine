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

    // 2. Color per source category. The visualizer only hues root's direct
    //    children, and our tree wraps the real folders under
    //    root > bundle > <abs path> nodes, so everything ends up one color.
    //    Instead: take the "category level" to be the children of the node with
    //    the most children (the source folder, e.g. .../src with its 14
    //    folders), give every node at that depth a distinct hue (so sibling
    //    path roots like the howler bundle get their own colors too), and grade
    //    light (category header) -> saturated (leaf) within each category.
    html = html
        // Walk the tree once, find the category depth, hue each category node.
        .replace(
            "colorParentMap.set(root, COLOR_BASE);",
            "colorParentMap.set(root, COLOR_BASE); "
                + "const __all = []; (function __rec(n){ __all.push(n); (n.children || []).forEach(__rec); })(root); "
                + "let __gr = root; for (const __n of __all) { const __cn = __n.children ? __n.children.length : 0; if (__cn > (__gr.children ? __gr.children.length : 0)) __gr = __n; } "
                + "const __catDepth = __gr.depth + 1;"
        )
        .replace(
            /const colorScale = sequential\(\[0, root\.children\.length\], \(n\) => hsl\(360 \* n, 0\.3, 0\.85\)\);\s*root\.children\.forEach\(\(c, id\) => \{\s*colorParentMap\.set\(c, colorScale\(id\)\.toString\(\)\);\s*\}\);/,
            "const __cats = __all.filter((n) => n.depth === __catDepth); "
                + "__cats.forEach((c, id) => { colorParentMap.set(c, hsl(360 * id / Math.max(1, __cats.length), 0.5, 0.85).toString()); });"
        )
        // Ramp lightness relative to the category level, not the absolute root.
        .replace(
            "const lightScale = linear().domain([0, root.height]).range([0.9, 0.3]);",
            "const lightScale = linear().domain([0, Math.max(1, root.height - __catDepth)]).range([0.85, 0.55]);"
        )
        // Resolve each node to its category (its ancestor at the category
        // depth); shallower structural wrappers fall back to grey.
        .replace(
            /const parents = node\.ancestors\(\);\s*const colorStr = parents\.length === 1\s*\? colorParentMap\.get\(parents\[0\]\)\s*: colorParentMap\.get\(parents\[parents\.length - 2\]\);/,
            "let __group = null, __a = node; while (__a) { if (__a.depth === __catDepth) { __group = __a; break; } __a = __a.parent; } "
                + "const colorStr = __group ? colorParentMap.get(__group) : COLOR_BASE;"
        )
        .replace(
            "hslColor.l = lightScale(node.depth);",
            "hslColor.l = lightScale(Math.max(0, node.depth - __catDepth));"
        )
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
