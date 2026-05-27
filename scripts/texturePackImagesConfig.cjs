function resolveTexturePackImagesConfig(projectPackage = {}, options = {}) {
    const warn = typeof options.warn === "function" ? options.warn : null;
    const bareEngine = isObject(projectPackage.bareEngine) ? projectPackage.bareEngine : {};
    const bare = isObject(projectPackage.bare) ? projectPackage.bare : {};
    const hasBareEngineOptions = Object.prototype.hasOwnProperty.call(bareEngine, "texturePackImages");
    const hasBareOptions = Object.prototype.hasOwnProperty.call(bare, "texturePackImages");
    const newOptions = hasBareEngineOptions
        ? readObject(bareEngine.texturePackImages, "bareEngine.texturePackImages")
        : (hasBareOptions ? readObject(bare.texturePackImages, "bare.texturePackImages") : null);
    const legacyStrip = bareEngine.stripTexturePackImages ?? bare.stripTexturePackImages;
    const legacyInclude = bareEngine.texturePackImagesToInclude ?? bare.texturePackImagesToInclude;
    const hasLegacyStrip = legacyStrip !== undefined;
    const hasLegacyInclude = legacyInclude !== undefined;

    if (newOptions && (hasLegacyStrip || hasLegacyInclude) && warn) {
        warn("[assets] bareEngine.stripTexturePackImages and bareEngine.texturePackImagesToInclude are deprecated and ignored when bareEngine.texturePackImages is set.");
    } else if ((hasLegacyStrip || hasLegacyInclude) && warn) {
        warn("[assets] bareEngine.stripTexturePackImages and bareEngine.texturePackImagesToInclude are deprecated. Use bareEngine.texturePackImages.stripUnused and bareEngine.texturePackImages.alwaysInclude.");
    }

    const stripUnused = newOptions
        ? readBoolean(newOptions.stripUnused, "bareEngine.texturePackImages.stripUnused")
        : legacyStrip === true;
    const alwaysInclude = newOptions
        ? readStringArray(newOptions.alwaysInclude, "bareEngine.texturePackImages.alwaysInclude")
        : readStringArray(legacyInclude, "bareEngine.texturePackImagesToInclude");
    const nameStyle = newOptions
        ? readString(newOptions.nameStyle, "bareEngine.texturePackImages.nameStyle", "relative")
        : "relative";

    if (!stripUnused && alwaysInclude.length > 0) {
        throw new Error("bareEngine.texturePackImages.alwaysInclude requires bareEngine.texturePackImages.stripUnused to be true.");
    }

    return {
        stripUnused,
        alwaysInclude,
        nameStyle
    };
}

function readBoolean(value, name) {
    if (value === undefined) {
        return false;
    }

    if (typeof value !== "boolean") {
        throw new Error(`${name} must be a boolean.`);
    }

    return value;
}

function readStringArray(value, name) {
    if (value === undefined) {
        return [];
    }

    if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
        throw new Error(`${name} must be an array of strings.`);
    }

    return value;
}

function readString(value, name, defaultValue = "") {
    if (value === undefined) {
        return defaultValue;
    }

    if (typeof value !== "string") {
        throw new Error(`${name} must be a string.`);
    }

    return value;
}

function readObject(value, name) {
    if (!isObject(value)) {
        throw new Error(`${name} must be an object.`);
    }

    return value;
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
    resolveTexturePackImagesConfig,
    readStringArray,
    readString
};
