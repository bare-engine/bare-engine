const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const {
    readStringArray,
    resolveTexturePackImagesConfig
} = require("./texturePackImagesConfig.cjs");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);

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
    const wildcards = [...references].filter(reference => reference.includes("*")).map(wildcardToRegExp);
    const keptFiles = files.filter(filePath => isTextureReferenced(textureDir, filePath, references, wildcards));

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

    collectSettingsDataPrefabKeys(
        options.settingsDataPath || path.join(projectRoot, "public/data/settingsData.json"),
        references
    );
    collectLevelEntityNames(
        options.levelsDir || path.join(projectRoot, "public/data/levels"),
        references
    );
    collectSourceReferences(
        projectRoot,
        options.srcDir || path.join(projectRoot, "src"),
        options.generatedAssetsPath || path.join(projectRoot, "src/generated/assets.ts"),
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

    const projectPackage = readProjectPackage(projectRoot);
    return resolveTexturePackImagesConfig(projectPackage).alwaysInclude;
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

function collectSettingsDataPrefabKeys(settingsDataPath, references) {
    if (!fs.existsSync(settingsDataPath)) {
        return;
    }

    try {
        const data = JSON.parse(fs.readFileSync(settingsDataPath, "utf8"));
        for (const entity of data.prefabs || []) {
            addTextureReference(references, entity.name);
        }
        collectTextureFields(data, references);
        collectAnimationFrames(data.animations, references);
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

// animations list their images under "frames", optionally inside an "imagePath" folder
function collectAnimationFrames(animations, references) {
    if (!animations || typeof animations !== "object") {
        return;
    }

    for (const animation of Object.values(animations)) {
        if (!animation || !Array.isArray(animation.frames)) {
            continue;
        }

        const imagePath = typeof animation.imagePath === "string" && animation.imagePath
            ? animation.imagePath.replace(/\/?$/, "/")
            : "";

        for (const frame of animation.frames) {
            if (typeof frame !== "string") {
                continue;
            }

            for (const name of expandNumberedName(frame)) {
                addTextureReference(references, imagePath + name);
            }
        }
    }
}

// mirrors SettingsHandler's frame expansion: "walk#3" -> walk1..walk3, "walk1#2" -> walk1..walk2,
// "walk01#03" -> walk01..walk03, segments joined with "+" (eg "walk1#2+5" -> walk1, walk2, walk5)
function expandNumberedName(name) {
    const match = name.includes("#") ? name.match(/^(.+?)(\d*#\d+.*)$/) : null;
    if (!match) {
        return [name];
    }

    const base = match[1];
    const names = [];
    for (const segment of match[2].split("+")) {
        const shorthandRangeMatch = segment.match(/^#(\d+)$/);
        const rangeMatch = segment.match(/^(\d+)#(\d+)$/);
        if (shorthandRangeMatch || rangeMatch) {
            const startText = rangeMatch ? rangeMatch[1] : "1";
            const endText = rangeMatch ? rangeMatch[2] : shorthandRangeMatch[1];
            const paddingText = rangeMatch ? startText : endText;
            const paddingLength = paddingText.startsWith("0") ? paddingText.length : 0;
            for (let i = parseInt(startText); i <= parseInt(endText); i++) {
                names.push(base + i.toString().padStart(paddingLength, "0"));
            }
        } else {
            names.push(base + segment);
        }
    }
    return names;
}

// any string literal in the game's code may name an image (eg AddGameObject("logo")), and
// Asset.Image.X resolves through the generated assets file. the generated folder itself is
// skipped, since assets.ts lists every image and would keep them all
function collectSourceReferences(projectRoot, srcDir, generatedAssetsPath, references) {
    if (!fs.existsSync(srcDir)) {
        return;
    }

    const ts = loadTypeScript(projectRoot);
    const assetImages = readGeneratedAssetImages(generatedAssetsPath);
    const generatedDir = path.resolve(path.dirname(generatedAssetsPath));

    for (const filePath of getFilesRecursive(srcDir)) {
        const extension = path.extname(filePath).toLowerCase();
        if (!SOURCE_EXTENSIONS.has(extension) || filePath.endsWith(".d.ts")) {
            continue;
        }
        if (path.resolve(filePath).startsWith(generatedDir + path.sep)) {
            continue;
        }

        const code = fs.readFileSync(filePath, "utf8");
        const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, false);

        const visit = (node) => {
            if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
                addTextureReference(references, node.text);
            } else if (ts.isPropertyAccessExpression(node)) {
                const imageKey = getAssetImageKey(ts, node);
                if (imageKey && assetImages.has(imageKey)) {
                    addTextureReference(references, assetImages.get(imageKey));
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
    }
}

// Asset.Image.KEY -> "KEY"
function getAssetImageKey(ts, node) {
    const parent = node.expression;
    if (!ts.isPropertyAccessExpression(parent) || parent.name.text !== "Image") {
        return null;
    }
    if (!ts.isIdentifier(parent.expression) || parent.expression.text !== "Asset") {
        return null;
    }
    return node.name.text;
}

// reads the "Image: { KEY: "value", ... }" map from the generated assets.ts
function readGeneratedAssetImages(generatedAssetsPath) {
    const images = new Map();
    if (!fs.existsSync(generatedAssetsPath)) {
        return images;
    }

    const code = fs.readFileSync(generatedAssetsPath, "utf8");
    const block = code.match(/\bImage:\s*\{([\s\S]*?)\n\s*\}/);
    if (!block) {
        return images;
    }

    for (const entry of block[1].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*("(?:[^"\\]|\\.)*")/g)) {
        images.set(entry[1], JSON.parse(entry[2]));
    }
    return images;
}

function loadTypeScript(projectRoot) {
    try {
        return createRequire(path.join(projectRoot, "package.json"))("typescript");
    } catch {
        return require("typescript");
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
    // entity name ("extends" / "name") which resolves to a texture of the same name
    // via the base prefab "texture": "NAME" rule.
    for (const key of ["name", "extends", "texture"]) {
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

function isTextureReferenced(textureDir, filePath, references, wildcards = []) {
    const relativeKey = normalizeTextureKey(path.relative(textureDir, filePath));
    const basenameKey = normalizeTextureKey(path.basename(filePath));

    return references.has(relativeKey) || references.has(basenameKey)
        || wildcards.some(wildcard => wildcard.test(relativeKey) || wildcard.test(basenameKey));
}

// "iterated_*" -> /^iterated_.*$/, * MATCHES ANY CHARACTERS
function wildcardToRegExp(pattern) {
    const escaped = pattern.split("*").map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(`^${escaped.join(".*")}$`);
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
