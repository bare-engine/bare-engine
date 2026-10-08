#!/usr/bin/env node
// Checks that code blocks copied from tested example files still match them. Mark a block with
// an HTML comment naming its source, relative to the .md file, right above the fence:
//
//   <!-- example: ../../features/fixtures/src/docExamples/paintScene.ts -->
//   ```ts
//   ...the file's contents...
//   ```
//
// The code is written out instead of using VitePress's <<< include, so the docs also read well
// as plain markdown, eg in node_modules/bare-engine/docs. Run with --fix to rewrite each marked
// block from its source file.

const fs = require("node:fs");
const path = require("node:path");

const docsDir = path.resolve(__dirname, "..", "docs");
const fix = process.argv.includes("--fix");

// MARKER, THEN A FENCED BLOCK. GROUPS: 1 SOURCE PATH, 2 OPENING FENCE, 3 CODE
const blockPattern = /<!-- example: (\S+) -->\r?\n(```\w*\r?\n)([\s\S]*?)^```$/gm;

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

// LF LINE ENDINGS, NO TRAILING WHITESPACE OR TRAILING EMPTY LINES
function normalize(code) {
    return code.replace(/\r\n/g, "\n").split("\n").map(line => line.trimEnd()).join("\n").trimEnd();
}

function firstDifference(expected, actual) {
    const a = expected.split("\n");
    const b = actual.split("\n");
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) {
            return `line ${i + 1} of the block: expected ${JSON.stringify(a[i] ?? "<end>")}, found ${JSON.stringify(b[i] ?? "<end>")}`;
        }
    }
    return "";
}

const problems = [];
let checked = 0;
let fixed = 0;

for (const mdFile of getMarkdownFiles(docsDir)) {
    const markdown = fs.readFileSync(mdFile, "utf8");
    const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
    const relativeMd = path.relative(docsDir, mdFile).replace(/\\/g, "/");

    if (/^<<< /m.test(markdown)) {
        problems.push(`${relativeMd}: uses a <<< include, which shows as a bare path outside the docs site. Write the code out under an <!-- example: path --> marker instead.`);
    }

    const updated = markdown.replace(blockPattern, (block, source, fence, code) => {
        checked++;
        const sourceFile = path.resolve(path.dirname(mdFile), source);
        if (!fs.existsSync(sourceFile)) {
            problems.push(`${relativeMd}: example source not found: ${source}`);
            return block;
        }

        const expected = normalize(fs.readFileSync(sourceFile, "utf8"));
        const actual = normalize(code);
        if (expected === actual) {
            return block;
        }

        if (fix) {
            fixed++;
            return `<!-- example: ${source} -->${eol}${fence}${expected.split("\n").join(eol)}${eol}\`\`\``;
        }
        problems.push(`${relativeMd}: block differs from ${source}, ${firstDifference(expected, actual)}`);
        return block;
    });

    if (updated !== markdown) {
        fs.writeFileSync(mdFile, updated);
    }
}

for (const problem of problems) {
    console.error(`[docs] ${problem}`);
}
console.log(`[docs] checked ${checked} example blocks${fix ? `, rewrote ${fixed}` : ""}, ${problems.length} problems.${problems.length && !fix ? " Run with --fix to rewrite the blocks from their source files." : ""}`);
process.exit(problems.length ? 1 : 0);
