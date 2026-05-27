#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const {
    readStringArray,
    resolveTexturePackImagesConfig
} = require("./texturePackImagesConfig.cjs");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

async function stripTexturePackImages(options = {}) {
    const projectRoot = path.resolve(options.projectRoot || process.cwd());
    const textureDir = path.resolve(options.textureDir || path.join(projectRoot, "texturePackImages"));
    const outputDir = path.resolve(options.outputDir || path.join(projectRoot, "public/initial/generated"));
    const tempDir = path.resolve(options.tempDir || path.join(projectRoot, "node_modules/.bare-engine/stripTexturePackImages"));

    if (!fs.existsSync(textureDir)) {
        console.warn(`[assets] texturePackImages folder not found: ${textureDir}`);
        return { kept: 0, removed: 0, references: [], skipped: true };
    }

    const references = collectTextureReferences(projectRoot, options);
    const files = getFilesRecursive(textureDir)
        .filter(filePath => IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
    const keptFiles = files.filter(filePath => isTextureReferenced(textureDir, filePath, references));

    fs.rmSync(tempDir, { recursive: true, force: true });

    if (keptFiles.length === 0) {
        removeGeneratedTexturePack(outputDir);
        console.warn("[assets] No referenced texturePackImages found; removed generated texture pack output.");
        return { kept: 0, removed: files.length, references: [...references].sort() };
    }

    const tempTextureDir = path.join(tempDir, "texturePackImages");
    for (const filePath of keptFiles) {
        const relativePath = path.relative(textureDir, filePath);
        const outputPath = path.join(tempTextureDir, relativePath);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.copyFileSync(filePath, outputPath);
    }

    try {
        await buildTexturePack(projectRoot, tempTextureDir, outputDir);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    const removed = files.length - keptFiles.length;
    console.log(`[assets] stripTexturePackImages kept ${keptFiles.length}/${files.length} images (${removed} removed).`);

    return { kept: keptFiles.length, removed, references: [...references].sort() };
}

function collectTextureReferences(projectRoot, options = {}) {
    const references = new Set();
    const alwaysInclude = resolveAlwaysInclude(projectRoot, options);

    for (const textureName of alwaysInclude) {
        addTextureReference(references, textureName);
    }

    collectSettingsDataEntityKeys(
        options.settingsDataPath || path.join(projectRoot, "public/data/settingsData.json"),
        references
    );
    collectLevelEntityNames(
        options.levelsDir || path.join(projectRoot, "public/data/levels"),
        references
    );

    return references;
}

function resolveAlwaysInclude(projectRoot, options = {}) {
    if (options.texturePackImages?.alwaysInclude !== undefined) {
        return readStringArray(options.texturePackImages.alwaysInclude, "texturePackImages.alwaysInclude");
    }

    if (options.alwaysInclude !== undefined) {
        return readStringArray(options.alwaysInclude, "alwaysInclude");
    }

    if (options.texturePackImagesToInclude !== undefined) {
        return readStringArray(options.texturePackImagesToInclude, "texturePackImagesToInclude");
    }

    const projectPackage = readProjectPackage(projectRoot);
    return resolveTexturePackImagesConfig(projectPackage, { warn: console.warn }).alwaysInclude;
}

function readProjectPackage(projectRoot) {
    const packagePath = path.join(projectRoot, "package.json");
    if (!fs.existsSync(packagePath)) {
        return {};
    }

    try {
        return JSON.parse(fs.readFileSync(packagePath, "utf8"));
    } catch (error) {
        console.warn(`[assets] Could not read ${packagePath}: ${error.message}`);
        return {};
    }
}

function collectSettingsDataEntityKeys(settingsDataPath, references) {
    if (!fs.existsSync(settingsDataPath)) {
        return;
    }

    try {
        const data = JSON.parse(fs.readFileSync(settingsDataPath, "utf8"));
        for (const key of Object.keys(data.entities || {})) {
            addTextureReference(references, key);
        }
        collectTextureFields(data, references);
    } catch (error) {
        console.warn(`[assets] Could not read ${settingsDataPath}: ${error.message}`);
    }
}

function collectTextureFields(value, references) {
    if (!value || typeof value !== "object") {
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectTextureFields(item, references);
        }
        return;
    }

    for (const [key, childValue] of Object.entries(value)) {
        if (key === "texture" && typeof childValue === "string") {
            addTextureReference(references, childValue);
        }

        collectTextureFields(childValue, references);
    }
}

function collectLevelEntityNames(levelsDir, references) {
    if (!fs.existsSync(levelsDir)) {
        return;
    }

    for (const filePath of getFilesRecursive(levelsDir)) {
        if (path.extname(filePath).toLowerCase() !== ".json") {
            continue;
        }

        try {
            const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
            collectEntitiesByLayerNames(data.entitiesByLayer, references);
        } catch (error) {
            console.warn(`[assets] Could not read ${filePath}: ${error.message}`);
        }
    }
}

function collectEntitiesByLayerNames(entitiesByLayer, references) {
    if (!entitiesByLayer || typeof entitiesByLayer !== "object") {
        return;
    }

    for (const entities of Object.values(entitiesByLayer)) {
        if (!Array.isArray(entities)) {
            continue;
        }

        for (const entity of entities) {
            collectEntityName(entity, references);
        }
    }
}

function collectEntityName(entity, references) {
    if (!entity || typeof entity !== "object") {
        return;
    }

    if (typeof entity.name === "string") {
        addTextureReference(references, entity.name);
    }

    if (Array.isArray(entity.children)) {
        for (const child of entity.children) {
            collectEntityName(child, references);
        }
    }
}

function addTextureReference(references, value) {
    const normalized = normalizeTextureKey(value);
    if (normalized) {
        references.add(normalized);
    }
}

function isTextureReferenced(textureDir, filePath, references) {
    const relativeKey = normalizeTextureKey(path.relative(textureDir, filePath));
    const basenameKey = normalizeTextureKey(path.basename(filePath));

    return references.has(relativeKey) || references.has(basenameKey);
}

function normalizeTextureKey(value) {
    let key = String(value || "").replace(/\\/g, "/").replace(/^\.?\//, "");
    key = key.replace(/^texturePackImages\//, "");
    key = key.replace(/^public\/initial\/generated\//, "");
    const extension = path.posix.extname(key);

    if (IMAGE_EXTENSIONS.has(extension.toLowerCase())) {
        key = key.slice(0, -extension.length);
    }

    return key;
}

async function buildTexturePack(projectRoot, entryDir, outputDir) {
    const { AssetPack } = await importProjectPackage(projectRoot, "@assetpack/core");
    const { compress } = await importProjectPackage(projectRoot, "@assetpack/core/image");
    const { checkExt, createNewAssetAt, swapExt } = await importProjectPackage(projectRoot, "@assetpack/core");
    const { texturePacker } = await importProjectPackage(projectRoot, "@assetpack/core/texture-packer");

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
            const parentDir = path.dirname(pipeSystem.outputPath);
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
                    path.join(pipeSystem.outputPath, entry)
                );
            }
        }
    });

    const assetpack = new AssetPack({
        entry: entryDir,
        output: outputDir,
        cache: false,
        ignore: ["*.png", "**/*"],
        pipes: [
            tagRootAsTps(),
            texturePacker({
                texturePacker: {
                    nameStyle: "relative",
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
    });

    await assetpack.run();
}

async function importProjectPackage(projectRoot, specifier) {
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
            `Could not load ${specifier}. Install @assetpack/core in this project before using stripTexturePackImages.`,
            { cause: error }
        );
    }
}

function removeGeneratedTexturePack(outputDir) {
    fs.rmSync(path.join(outputDir, "texturePackImages.json"), { force: true });
    fs.rmSync(path.join(outputDir, "texturePackImages.webp"), { force: true });
    fs.rmSync(path.join(outputDir, "texturePackImages.png"), { force: true });
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

function getFilesRecursive(dir) {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(getFilesRecursive(fullPath));
        } else {
            results.push(fullPath);
        }
    }
    return results;
}

if (require.main === module) {
    stripTexturePackImages()
        .catch((error) => {
            console.error(`[assets] ${error.message}`);
            process.exit(1);
        });
}

module.exports = {
    stripTexturePackImages,
    collectTextureReferences
};
