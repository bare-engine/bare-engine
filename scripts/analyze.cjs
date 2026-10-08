#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");

const projectRoot = process.cwd();
const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || defaultConfigPath(projectRoot);
const outputPath = args.output || args.o || path.join("dist", "stats.html");
const mode = args.mode || args.m || "production";
const template = args.template || args.t || "treemap";
const open = parseBoolean(args.open, true);
const sourcemap = parseBoolean(args.sourcemap, false);

run().catch(error => {
    console.error(error.message || error);
    process.exit(1);
});

async function run() {
    const projectRequire = createRequire(path.join(projectRoot, "package.json"));
    let visualizerPath;
    try {
        visualizerPath = projectRequire.resolve("vite-bundle-visualizer");
    } catch (error) {
        if (error.code !== "MODULE_NOT_FOUND") throw error;
        throw new Error("Bundle analysis requires an optional package. Install it with npm install --save-dev vite-bundle-visualizer@^1.2.1, then run npm run analyze again.");
    }
    const start = (await import(pathToFileURL(visualizerPath).href)).default;

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
    //    children, but our tree wraps the real folders under a prefix of
    //    structural nodes (root > bundle > <abs path> > <pkg root> > folders),
    //    and that prefix is a different depth per project. So: treat the prefix
    //    as a "wrapper region" -- root, the bundle(s), and any path-segment node
    //    (name has a separator) that still has children -- then the category is
    //    the first non-wrapper node on each branch. Every node inherits its
    //    category's hue, graded light (header) -> saturated (leaf) by depth
    //    within the category. Wrappers themselves stay neutral grey.
    const categoryColorJs = [
        "colorParentMap.set(root, COLOR_BASE); ",
        "const __all = []; (function __r(n){ __all.push(n); (n.children || []).forEach(__r); })(root); ",
        "const __nm = (n) => (n && n.data && n.data.name) || ''; ",
        "const __bs = String.fromCharCode(92); ",
        "const __sep = (n) => { const s = __nm(n); return s.indexOf('/') >= 0 || s.indexOf(':') >= 0 || s.indexOf(__bs) >= 0; }; ",
        "const __dir = (c) => c.children && c.children.length > 0; ",
        "const __pkgRoot = (c) => __dir(c) && c.children.every((gc) => __sep(gc)); ",
        "const __wrap = new Set(); (function __mark(n){ __wrap.add(n); (n.children || []).forEach((c) => { if ((n === root) || (__sep(c) && __dir(c)) || __pkgRoot(c)) __mark(c); }); })(root); ",
        "const __catOf = (n) => { let g = n; while (g && g.parent && !__wrap.has(g.parent)) g = g.parent; return (g && !__wrap.has(g)) ? g : null; }; ",
        "const __cats = __all.filter((n) => __catOf(n) === n); ",
        // Rank categories by size: the largest folders get distinct vivid
        // hues, the smallest converge toward one calm neutral tone, graded
        // evenly by rank so a single huge category can't grey out everything.
        "const __sorted = __cats.slice().sort((a, b) => (b.value || 0) - (a.value || 0)); ",
        "const __rank = new Map(); __sorted.forEach((n, r) => __rank.set(n, r)); ",
        "const __n1 = Math.max(1, __cats.length - 1); const __ch = 215; ",
        "__cats.forEach((c, id) => { const __t = 1 - __rank.get(c) / __n1; const __hd = 360 * id / Math.max(1, __cats.length); const __h = __ch + (__hd - __ch) * __t; const __s = 0.12 + 0.45 * __t; colorParentMap.set(c, hsl(__h, __s, 0.85).toString()); });"
    ].join("");

    html = html
        // Build the wrapper region and assign one hue per category.
        .replace("colorParentMap.set(root, COLOR_BASE);", categoryColorJs)
        // The visualizer's per-child coloring is now redundant; drop it.
        .replace(
            /const colorScale = sequential\(\[0, root\.children\.length\], \(n\) => hsl\(360 \* n, 0\.3, 0\.85\)\);\s*root\.children\.forEach\(\(c, id\) => \{\s*colorParentMap\.set\(c, colorScale\(id\)\.toString\(\)\);\s*\}\);/,
            ""
        )
        // Lightness ramps with depth *within* a category (clamped at 4 levels).
        .replace(
            "const lightScale = linear().domain([0, root.height]).range([0.9, 0.3]);",
            "const lightScale = linear().domain([0, 4]).range([0.85, 0.55]);"
        )
        // Resolve each node to its category; wrappers fall back to grey.
        .replace(
            /const parents = node\.ancestors\(\);\s*const colorStr = parents\.length === 1\s*\? colorParentMap\.get\(parents\[0\]\)\s*: colorParentMap\.get\(parents\[parents\.length - 2\]\);/,
            "const __g = __catOf(node); const colorStr = __g ? colorParentMap.get(__g) : COLOR_BASE;"
        )
        .replace(
            "hslColor.l = lightScale(node.depth);",
            "hslColor.l = lightScale(Math.min(4, __g ? (node.depth - __g.depth) : 0));"
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
