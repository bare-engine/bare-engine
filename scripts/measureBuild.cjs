#!/usr/bin/env node
// Report transfer-size estimates without installing a separate analyzer.
const fs = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');

const root = path.resolve(process.argv[2] || 'dist');
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`Build directory not found: ${root}`);
    process.exit(1);
}
function files(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? files(file) : [file];
    });
}
let rawTotal = 0;
let gzipTotal = 0;
for (const file of files(root).sort()) {
    if (!/\.(?:html|js|css)$/.test(file)) continue;
    const data = fs.readFileSync(file);
    const compressed = gzipSync(data, { level: 9 }).length;
    rawTotal += data.length;
    gzipTotal += compressed;
    console.log(`${path.relative(root, file)}: ${data.length} bytes raw, ${compressed} bytes gzip`);
}
console.log(`HTML + JS + CSS: ${rawTotal} bytes raw, ${gzipTotal} bytes gzip (level 9, each file compressed separately).`);
console.log('Excludes images, fonts, sounds, JSON, and HTTP headers; total files are not necessarily all loaded at startup.');
