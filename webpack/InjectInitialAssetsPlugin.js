const fs = require("fs");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

class InjectInitialAssetsPlugin {
    apply(compiler) {
        const watchDir = path.join(__dirname, "../public/assets/initial");
        const { RawSource } = compiler.webpack.sources;

        compiler.hooks.afterCompile.tap("InjectInitialAssetsPlugin", compilation => {
            if (fs.existsSync(watchDir)) {
                this.addWatchDirsRecursive(watchDir, compilation);
            }
        });

        compiler.hooks.compilation.tap("InjectInitialAssetsPlugin", compilation => {
            const signature = this.getInitialAssetsSignature();
            const initialChanged = signature !== this.lastInitialAssetsSignature;
            compilation.__initialAssetsChanged = initialChanged;
            compiler.__lastInitialAssetsChanged = initialChanged;
            this.lastInitialAssetsSignature = signature;

            compilation.hooks.fullHash.tap("InjectInitialAssetsPlugin", hash => {
                const folder = path.join(__dirname, "../public/assets/initial");
                if (!fs.existsSync(folder)) {
                    return;
                }

                const files = this.getFilesRecursive(folder);
                files.forEach(filePath => {
                    const relativePath = path.relative(folder, filePath);
                    const stat = fs.statSync(filePath);
                    hash.update(relativePath);
                    hash.update(String(stat.mtimeMs));
                    hash.update(String(stat.size));
                });
                console.log(`[InjectInitialAssetsPlugin] Added ${files.length} initial files to compilation hash`);
            });

            compilation.hooks.processAssets.tap(
                {
                    name: "InjectInitialAssetsPlugin",
                    stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH
                },
                assets => {
                    const htmlAssetName = this.lastHtmlAssetName
                        || Object.keys(assets).find(name => name.endsWith(".html"))
                        || "index.html";
                    const asset = compilation.getAsset(htmlAssetName);
                    if (!asset) {
                        console.log(`[InjectInitialAssetsPlugin] No HTML asset found for ${htmlAssetName}`);
                        return;
                    }

                    const originalHtml = asset.source.source().toString();
                    if (originalHtml.includes('data-initial-asset="true"')) {
                        console.log(`[InjectInitialAssetsPlugin] Skipped processAssets (already injected) for ${htmlAssetName}`);
                        return;
                    }

                    const updatedHtml = this.injectInitialAssets(originalHtml);
                    if (updatedHtml !== originalHtml) {
                        compilation.updateAsset(htmlAssetName, new RawSource(updatedHtml));
                        console.log(`[InjectInitialAssetsPlugin] Updated ${htmlAssetName} during processAssets`);
                    } else {
                        console.log(`[InjectInitialAssetsPlugin] No changes for ${htmlAssetName} during processAssets`);
                    }
                }
            );

            HtmlWebpackPlugin.getHooks(compilation).beforeEmit.tapAsync(
                "InjectInitialAssetsPlugin",
                (data, cb) => {
                    this.lastHtmlAssetName = data.outputName;
                    if (data.html.includes('data-initial-asset="true"')) {
                        cb(null, data);
                        return;
                    }
                    data.html = this.injectInitialAssets(data.html);
                    cb(null, data);
                }
            );
        });
    }

    getInitialAssetsSignature() {
        const folder = path.join(__dirname, "../public/assets/initial");
        if (!fs.existsSync(folder)) {
            return "";
        }

        const files = this.getFilesRecursive(folder);
        const parts = [];
        files.forEach(filePath => {
            const relativePath = path.relative(folder, filePath).replace(/\\/g, "/");
            const stat = fs.statSync(filePath);
            parts.push(`${relativePath}:${stat.mtimeMs}:${stat.size}`);
        });

        return parts.sort().join("|");
    }

    injectInitialAssets(html) {
        let bundleTag = "";
        let updatedHtml = html.replace(
            /<script[^>]*src="([^"]*bundle[^"]*\.js)"[^>]*><\/script>/,
            (match, src) => {
                bundleTag = `
<script data-initial-asset="true"
        src="${src}"
        async
        onload="this.dataset.loaded='true'"
        onerror="this.dataset.loaded='true'"></script>`;
                return "";
            }
        );

        const folder = path.join(__dirname, "../public/assets/initial");
        let tags = "";

        if (fs.existsSync(folder)) {
            const files = this.getFilesRecursive(folder);
            files.forEach(filePath => {
                const relativePath = path.relative(folder, filePath);
                const url = `./assets/initial/${relativePath.replace(/\\/g, "/")}`;

                if (filePath.endsWith(".js")) {
                    tags += `<script data-initial-asset="true" src="${url}" async onload="this.dataset.loaded='true'" onerror="this.dataset.loaded='true'"></script>\n`;
                }
                else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(filePath)) {
                    tags += `<img data-initial-asset="true" src="${url}" style="display:none;" onload="this.dataset.loaded='true'" onerror="this.dataset.loaded='true'">\n`;
                }
                else if (filePath.endsWith(".json")) {
                    tags += `<link data-initial-asset="true" rel="preload" href="${url}" as="fetch" crossorigin onload="this.dataset.loaded='true'" onerror="this.dataset.loaded='true'">\n`;
                }
                else {
                    tags += `<link data-initial-asset="true" rel="preload" href="${url}" as="object" onload="this.dataset.loaded='true'" onerror="this.dataset.loaded='true'">\n`;
                }
            });
        }

        updatedHtml = updatedHtml.replace(/<\/head>/, `${bundleTag}\n</head>`);
        updatedHtml = updatedHtml.replace(/<body>/, `<body>\n${tags}`);

        return updatedHtml;
    }

    getFilesRecursive(dir) {
        let results = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results = results.concat(this.getFilesRecursive(fullPath));
            } else {
                results.push(fullPath);
            }
        }

        return results;
    }

    addWatchDirsRecursive(dir, compilation) {
        compilation.contextDependencies.add(dir);
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                this.addWatchDirsRecursive(path.join(dir, entry.name), compilation);
            }
        }
    }
}

module.exports = InjectInitialAssetsPlugin;
