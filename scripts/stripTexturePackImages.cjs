const fs = require("node:fs");
const path = require("node:path");
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
        const entities = Array.isArray(data.entities)
            ? data.entities
            : Object.entries(data.entities || {}).map(([name, entity]) => ({ ...entity, name }));
        for (const entity of entities) {
            addTextureReference(references, entity.name);
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

    // Level entries reference textures either directly ("texture") or through an
    // entity name ("entity" / "name") which resolves to a texture of the same name
    // via the base entity "texture": "NAME" rule.
    for (const key of ["name", "entity", "texture"]) {
        if (typeof entity[key] === "string") {
            addTextureReference(references, entity[key]);
        }
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
    const configFactoryPath = path.join(__dirname, "../config/assetpackConfigFactory.mjs");
    const { createAssetPackConfig, importAssetPack } = await import(pathToFileURL(configFactoryPath).href);
    const { AssetPack } = await importAssetPack(projectRoot, "@assetpack/core");
    const config = await createAssetPackConfig({
        projectRoot,
        entry: entryDir,
        output: outputDir
    });

    const assetpack = new AssetPack(config);
    await assetpack.run();
}

function removeGeneratedTexturePack(outputDir) {
    fs.rmSync(path.join(outputDir, "texturePackImages.json"), { force: true });
    fs.rmSync(path.join(outputDir, "texturePackImages.webp"), { force: true });
    fs.rmSync(path.join(outputDir, "texturePackImages.png"), { force: true });
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
