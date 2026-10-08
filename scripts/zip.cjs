#!/usr/bin/env node

const path = require("node:path");

const projectRoot = process.cwd();

main().catch((error) => {
    console.error(`[zip] ${error.message}`);
    process.exit(1);
});

async function main() {
    const args = process.argv.slice(2);
    if (args.includes("--help") || args.includes("-h")) {
        printHelp();
        return;
    }

    const sourceDir = path.resolve(projectRoot, args[0] || "dist");
    const outFile = path.resolve(projectRoot, args[1] || "dist.zip");
    const { zipDirectory } = await import("bare-tools/zip");
    const count = zipDirectory(sourceDir, outFile);

    console.log(`[zip] ${path.relative(projectRoot, outFile)}: ${count} files from ${path.relative(projectRoot, sourceDir) || "."}`);
}

function printHelp() {
    console.log(`Usage: bare-engine-zip [source] [output]

Zips the contents of a folder, so its files sit at the root of the zip.

Arguments:
  source      Folder to zip (default: dist)
  output      Zip file to write (default: dist.zip)

Options:
  -h, --help  Show this help
`);
}
