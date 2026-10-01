#!/usr/bin/env node
// Checks the docs' example links (github.com/bare-engine/<repo>/blob/main/<path>#Lx-Ly)
// against local checkouts of the sample projects, which are expected next to this repo
// (eg ../BarePlatformer). Reports missing files and line ranges past the end of a file.
// Run with --verbose to print the first and last linked line of every range, to spot
// links that drifted after the code changed.

const fs = require("node:fs");
const path = require("node:path");

const engineRoot = path.resolve(__dirname, "..");
const docsDir = path.join(engineRoot, "docs");
const parentDir = path.dirname(engineRoot);
const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");

// github repo name -> local folder next to the engine
const repoFolders = {
    "bare-engine": path.basename(engineRoot),
    "bare-platformer": "BarePlatformer",
    "bare-shmup": "BareShmup",
    "bare-rpg": "BareRPG",
    "bare-trust": "BareTrust",
    "bare-showcase": "BareDemos",
    "bare-resolution-demo": "BareResolutionDemo",
    "bare-template": "BareTemplate",
};

const linkPattern = /https:\/\/github\.com\/bare-engine\/([\w-]+)(?:\/blob\/main\/([^)#\s]+))?(?:#L(\d+)(?:-L(\d+))?)?/g;

function getMarkdownFiles(dir) {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== "node_modules" && entry.name !== ".vitepress") {
                results = results.concat(getMarkdownFiles(fullPath));
            }
        } else if (entry.name.endsWith(".md")) {
            results.push(fullPath);
        }
    }
    return results;
}

function checkLink(url, repo, filePath, startText, endText) {
    const folder = repoFolders[repo];
    if (!folder) {
        return filePath ? `unknown repo "${repo}", add it to repoFolders` : null;
    }
    if (!filePath) {
        return null;
    }

    const repoDir = path.join(parentDir, folder);
    if (!fs.existsSync(repoDir)) {
        return `local checkout not found: ${repoDir}`;
    }

    const localPath = path.join(repoDir, decodeURIComponent(filePath));
    if (!fs.existsSync(localPath)) {
        return `file not found: ${folder}/${filePath}`;
    }
    if (!startText) {
        return null;
    }

    const lines = fs.readFileSync(localPath, "utf8").split(/\r?\n/);
    const start = Number(startText);
    const end = Number(endText ?? startText);
    if (end > lines.length || start > end) {
        return `lines ${start}-${end} out of range, ${folder}/${filePath} has ${lines.length} lines`;
    }

    if (verbose) {
        console.log(`${folder}/${filePath}#L${start}-L${end}`);
        console.log(`    ${start}: ${lines[start - 1].trim().slice(0, 100)}`);
        if (end !== start) {
            console.log(`    ${end}: ${lines[end - 1].trim().slice(0, 100)}`);
        }
    }
    return null;
}

const checked = new Set();
let problems = 0;

for (const docPath of getMarkdownFiles(docsDir)) {
    const text = fs.readFileSync(docPath, "utf8");
    for (const [url, repo, filePath, start, end] of text.matchAll(linkPattern)) {
        if (checked.has(url)) {
            continue;
        }
        checked.add(url);

        const problem = checkLink(url, repo, filePath, start, end);
        if (problem) {
            problems++;
            console.error(`[docs] ${path.relative(docsDir, docPath)}: ${problem}\n       ${url}`);
        }
    }
}

console.log(`[docs] checked ${checked.size} example links, ${problems} problem${problems === 1 ? "" : "s"}.`);
process.exit(problems > 0 ? 1 : 0);
