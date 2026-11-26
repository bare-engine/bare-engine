// Streamed images (public/images, and the imageGlobs folders) are PNGs on disk, while the engine
// always asks for <name>.webp. The dev server converts a PNG when its .webp is requested, and the
// build writes a .webp for every PNG. Both use the same disk cache, so an image converts only once.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");

const CACHE_DIR = "node_modules/.bare-engine/images";

// webpQuality: undefined for lossless, like the atlas, else 0-100
function bareStreamedImagesPlugin(options = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const publicDir = path.join(projectRoot, "public");
    const isStreamed = createStreamedImageTest(options.imageGlobs);
    const converter = createConverter(projectRoot, options.webpQuality);

    return {
        name: "bare:streamed-images",
        apply: "serve",
        configureServer(server) {
            // before vite serves public/, so a PNG wins over a leftover .webp of the same name
            server.middlewares.use((req, res, next) => {
                if (req.method !== "GET" && req.method !== "HEAD") {
                    next();
                    return;
                }

                const pngPath = findStreamedPng(publicDir, req.url, isStreamed);
                if (!pngPath) {
                    next();
                    return;
                }

                converter.convert(pngPath).then(webpPath => {
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "image/webp");
                    res.setHeader("Cache-Control", "no-cache");
                    if (req.method === "HEAD") {
                        res.end();
                        return;
                    }
                    fs.createReadStream(webpPath).on("error", next).pipe(res);
                }, error => {
                    server.config.logger.error(`[bare] Could not convert ${path.relative(projectRoot, pngPath)} to webp: ${error.message}`);
                    res.statusCode = 500;
                    res.end();
                });
            });
        }
    };
}

// the PNG a request for a streamed .webp comes from, if it has one
function findStreamedPng(publicDir, url, isStreamed) {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(url || "/", "http://127.0.0.1").pathname);
    } catch {
        return null;
    }

    if (!pathname.toLowerCase().endsWith(".webp")) {
        return null;
    }

    const rel = pathname.replace(/^\/+/, "").replace(/\.webp$/i, ".png");
    if (!isStreamed(rel)) {
        return null;
    }

    const rootPath = path.resolve(publicDir);
    const pngPath = path.resolve(rootPath, rel);
    if (!pngPath.startsWith(rootPath + path.sep) || !isFile(pngPath)) {
        return null;
    }
    return pngPath;
}

// rel: a path relative to public/, with forward slashes
function createStreamedImageTest(imageGlobs = []) {
    const { globToRegExp } = require("./plugins.cjs");
    const matchers = (Array.isArray(imageGlobs) ? imageGlobs : []).map(globToRegExp);

    return rel => rel.toLowerCase().endsWith(".png")
        && (rel.startsWith("images/") || matchers.some(re => re.test(rel)));
}

function createConverter(projectRoot, webpQuality) {
    const cacheDir = path.join(projectRoot, CACHE_DIR, webpQuality === undefined ? "lossless" : `q${webpQuality}`);
    const webpOptions = webpQuality === undefined ? { lossless: true } : { quality: webpQuality };
    const converting = new Map();
    let sharp = null;

    // resolves with the cached .webp for pngPath, converting it first when the PNG is new or changed
    function convert(pngPath) {
        const pending = converting.get(pngPath);
        if (pending) {
            return pending;
        }

        const promise = convertNow(pngPath).finally(() => converting.delete(pngPath));
        converting.set(pngPath, promise);
        return promise;
    }

    async function convertNow(pngPath) {
        const pngStat = fs.statSync(pngPath);
        const cachePath = path.join(cacheDir, path.relative(projectRoot, pngPath).replace(/\.png$/i, ".webp"));

        // the cached file gets the PNG's modified time, so a different time means the PNG changed.
        // Within a millisecond: utimes takes seconds as a float, so the time it sets can be off by a hair
        if (isFile(cachePath) && Math.abs(fs.statSync(cachePath).mtimeMs - pngStat.mtimeMs) < 1) {
            return cachePath;
        }

        sharp = sharp || loadSharp(projectRoot);
        // from a buffer: given a path, sharp keeps the file open on Windows, and an image editor can't save it
        const buffer = await sharp(fs.readFileSync(pngPath)).webp(webpOptions).toBuffer();

        // written next to it and renamed, so a request never reads a half-written file
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        const tempPath = `${cachePath}.${process.pid}.tmp`;
        fs.writeFileSync(tempPath, buffer);
        fs.utimesSync(tempPath, pngStat.atime, pngStat.mtime);
        fs.renameSync(tempPath, cachePath);
        return cachePath;
    }

    return { convert };
}

// Copies public/ into the build. Streamed PNGs become .webp, and a .webp that has such a PNG
// is left out. skip(relativePath) leaves out other files, like ones the bundle already wrote.
async function copyPublicDir(projectRoot, publicDir, outDir, options = {}) {
    const isStreamed = createStreamedImageTest(options.imageGlobs);
    const skip = options.skip || (() => false);
    const files = listFiles(publicDir);
    const pngs = new Set(files.filter(isStreamed).map(rel => rel.replace(/\.png$/i, ".webp")));

    for (const rel of files) {
        if (isStreamed(rel) || pngs.has(rel) || skip(rel)) {
            continue;
        }
        const to = path.join(outDir, rel);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(path.join(publicDir, rel), to);
    }

    const converter = createConverter(projectRoot, options.webpQuality);
    const queue = files.filter(rel => isStreamed(rel) && !skip(rel.replace(/\.png$/i, ".webp")));
    const worker = async () => {
        for (let rel = queue.shift(); rel !== undefined; rel = queue.shift()) {
            const cachePath = await converter.convert(path.join(publicDir, rel));
            const to = path.join(outDir, rel.replace(/\.png$/i, ".webp"));
            fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.copyFileSync(cachePath, to);
        }
    };
    // sharp works on its own threads, so a few conversions at once keep them all busy
    await Promise.all(Array.from({ length: Math.min(queue.length, availableParallelism()) }, worker));
}

// every file under dir, relative to it with forward slashes, without .gitkeep placeholders
function listFiles(dir, relativeDir = "") {
    const results = [];
    if (!fs.existsSync(dir)) {
        return results;
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
        const fullPath = path.join(dir, entry.name);
        if (fs.statSync(fullPath).isDirectory()) {
            results.push(...listFiles(fullPath, relativePath));
        } else if (entry.name !== ".gitkeep") {
            results.push(relativePath);
        }
    }
    return results;
}

// sharp comes with bare-tools, which packs the atlas with it
function loadSharp(projectRoot) {
    const projectRequire = createRequire(path.join(projectRoot, "package.json"));
    const attempts = [
        () => projectRequire("sharp"),
        () => createRequire(projectRequire.resolve("bare-tools/assetpack"))("sharp"),
        () => require("sharp"),
        () => createRequire(require.resolve("bare-tools/assetpack"))("sharp")
    ];

    for (const attempt of attempts) {
        try {
            return attempt();
        } catch (error) {
            if (error.code !== "MODULE_NOT_FOUND" && error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
                throw error;
            }
        }
    }
    throw new Error("Could not load sharp, which comes with bare-tools. Try running npm install again.");
}

function availableParallelism() {
    return typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
}

function isFile(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch {
        return false;
    }
}

module.exports = {
    bareStreamedImagesPlugin,
    copyPublicDir,
    createConverter,
    createStreamedImageTest
};
