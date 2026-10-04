#!/usr/bin/env node
// Check the rendered site so heading IDs and links match VitePress exactly.
const fs = require('node:fs');
const path = require('node:path');

const siteRoot = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '../docs/.vitepress/dist');
const config = fs.readFileSync(path.resolve(__dirname, '../docs/.vitepress/config.mts'), 'utf8');
const base = config.match(/\bbase:\s*["']([^"']+)["']/)?.[1];
if (!base || !fs.existsSync(path.join(siteRoot, 'index.html'))) {
    console.error('[docs] Missing site or base configuration. Run npm run docs:build first.');
    process.exit(1);
}

function htmlFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? htmlFiles(file) : file.endsWith('.html') ? [file] : [];
    });
}

function decodeAttribute(value) {
    return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

const ids = new Map();
let checked = 0;
const problems = [];
for (const file of htmlFiles(siteRoot)) {
    const html = fs.readFileSync(file, 'utf8');
    const source = path.relative(siteRoot, file).replace(/\\/g, '/');
    const pageUrl = new URL(base + source, 'https://docs.invalid');
    // Check links and embedded images; leave remote URLs to the example checker.
    for (const [, raw] of html.matchAll(/<(?:a\b[^>]*?\bhref|img\b[^>]*?\bsrc)="([^"]+)"/g)) {
        const url = new URL(decodeAttribute(raw), pageUrl);
        if (url.origin !== pageUrl.origin) continue;
        checked++;
        if (!url.pathname.startsWith(base)) {
            problems.push(`${source}: outside site base: ${raw}`);
            continue;
        }
        const relative = decodeURIComponent(url.pathname.slice(base.length));
        const candidate = path.resolve(siteRoot, relative || 'index.html');
        if (!candidate.startsWith(siteRoot + path.sep) && candidate !== siteRoot) {
            problems.push(`${source}: outside output directory: ${raw}`);
            continue;
        }
        const target = [candidate, `${candidate}.html`, path.join(candidate, 'index.html')]
            .find(value => fs.existsSync(value) && fs.statSync(value).isFile());
        if (!target) {
            problems.push(`${source}: missing target: ${raw}`);
            continue;
        }
        if (url.hash && target.endsWith('.html')) {
            if (!ids.has(target)) {
                ids.set(target, new Set([...fs.readFileSync(target, 'utf8')
                    .matchAll(/\bid="([^"]+)"/g)].map(match => decodeAttribute(match[1]))));
            }
            if (!ids.get(target).has(decodeURIComponent(url.hash.slice(1))))
                problems.push(`${source}: missing anchor: ${raw}`);
        }
    }
}
for (const problem of problems) console.error(`[docs] ${problem}`);
console.log(`[docs] checked ${checked} rendered links/images, ${problems.length} problems.`);
process.exitCode = problems.length ? 1 : 0;
