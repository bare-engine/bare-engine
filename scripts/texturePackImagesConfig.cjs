function resolveTexturePackImagesConfig(projectPackage = {}) {
    const bareEngine = isObject(projectPackage.bareEngine) ? projectPackage.bareEngine : {};
    const options = bareEngine.texturePackImages === undefined
        ? {}
        : readObject(bareEngine.texturePackImages, "bareEngine.texturePackImages");

    const stripUnused = readBoolean(options.stripUnused, "bareEngine.texturePackImages.stripUnused");
    const alwaysInclude = readStringArray(options.alwaysInclude, "bareEngine.texturePackImages.alwaysInclude");
    const nameStyle = readString(options.nameStyle, "bareEngine.texturePackImages.nameStyle", "relative");
    const flattenNames = readBoolean(options.flattenNames, "bareEngine.texturePackImages.flattenNames");
    const webpQuality = readWebpQuality(options.webpQuality, "bareEngine.texturePackImages.webpQuality");

    if (!stripUnused && alwaysInclude.length > 0) {
        throw new Error("bareEngine.texturePackImages.alwaysInclude requires bareEngine.texturePackImages.stripUnused to be true.");
    }

    return {
        stripUnused,
        alwaysInclude,
        nameStyle,
        flattenNames,
        webpQuality
    };
}

function readWebpQuality(value, name) {
    if (value === undefined) {
        return undefined;
    }

    if (!Number.isInteger(value) || value < 0 || value > 100) {
        throw new Error(`${name} must be an integer between 0 and 100.`);
    }

    return value;
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
    readString,
    readWebpQuality
};
