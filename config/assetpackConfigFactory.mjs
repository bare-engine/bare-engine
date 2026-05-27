import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export async function createAssetPackConfig(options = {}) {
    const projectRoot = path.resolve(options.projectRoot || process.cwd());
    const entry = options.entry || "./texturePackImages";
    const output = options.output || "./public/initial/generated";

    const { compress } = await importAssetPack(projectRoot, "@assetpack/core/image");
    const { checkExt, createNewAssetAt, swapExt } = await importAssetPack(projectRoot, "@assetpack/core");
    const { texturePacker } = await importAssetPack(projectRoot, "@assetpack/core/texture-packer");

    const textureJsonToWebp = () => ({
        name: "texture-json-webp",
        test: (asset) => asset.allMetaData?.tps && checkExt(asset.path, ".json"),
        transform: async (asset) => {
            const json = JSON.parse(asset.buffer.toString());
            if (!json?.meta?.image) {
                return [asset];
            }

            const nextJson = JSON.parse(JSON.stringify(json));
            nextJson.meta.image = swapExt(nextJson.meta.image, ".webp");

            const nextAsset = createNewAssetAt(asset, asset.filename);
            nextAsset.buffer = Buffer.from(JSON.stringify(nextJson, null, 2));

            return [nextAsset];
        }
    });

    const tagRootAsTps = () => ({
        name: "tag-root-tps",
        test: (asset) => asset.isFolder && asset.rootAsset === asset,
        transform: async (asset) => {
            asset.metaData.tps = true;
            return [asset];
        }
    });

    const movePackedFromParent = () => ({
        name: "move-packed-from-parent",
        finish: async (_root, _options, pipeSystem) => {
            const outputDir = pipeSystem.outputPath;
            const parentDir = path.dirname(outputDir);
            const rootName = "texturePackImages";

            if (!fs.existsSync(parentDir)) {
                return;
            }

            for (const entry of fs.readdirSync(parentDir)) {
                if (!entry.startsWith(rootName)) {
                    continue;
                }

                moveFileSync(
                    path.join(parentDir, entry),
                    path.join(outputDir, entry)
                );
            }
        }
    });

    return {
        entry,
        output,
        cache: false,
        ignore: ["*.png", "**/*"],
        pipes: [
            tagRootAsTps(),
            texturePacker({
                texturePacker: {
                    nameStyle: "short",
                    removeFileExtension: true,
                    allowRotation: false,
                    allowTrim: false
                },
                resolutionOptions: {
                    resolutions: { default: 1 },
                    maximumTextureSize: 4096
                }
            }),
            compress({
                png: "skip",
                webp: {
                    lossless: true
                }
            }),
            textureJsonToWebp(),
            movePackedFromParent()
        ]
    };
}

export async function importAssetPack(projectRoot, specifier) {
    const projectRequire = createRequire(path.join(projectRoot, "package.json"));

    try {
        return await import(pathToFileURL(projectRequire.resolve(specifier)).href);
    } catch (error) {
        if (error.code !== "MODULE_NOT_FOUND" && error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
            throw error;
        }
    }

    try {
        return await import(specifier);
    } catch (error) {
        throw new Error(
            `Could not load ${specifier}. Install @assetpack/core in the project or as a bare-engine dependency.`,
            { cause: error }
        );
    }
}

function moveFileSync(from, to) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.rmSync(to, { force: true });

    try {
        fs.renameSync(from, to);
    } catch (error) {
        if (error.code !== "EXDEV") {
            throw error;
        }

        fs.copyFileSync(from, to);
        fs.rmSync(from, { force: true });
    }
}
