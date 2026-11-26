// Tests for the PNGs in public/images becoming .webp: the dev server middleware and the build copy
// (vite/streamedImages.cjs).
// Run: node --test scripts/streamedImages.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { bareStreamedImagesPlugin, copyPublicDir } = require('../vite/streamedImages.cjs');

const png = (r, g, b) => sharp({ create: { width: 2, height: 2, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();

async function withProject(files, run) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-images-'));
    try {
        fs.writeFileSync(path.join(root, 'package.json'), '{}');
        for (const [file, content] of Object.entries(files)) {
            const full = path.join(root, file);
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, await content);
        }
        await run(root);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

function fakeServer(middlewares = { use() {} }) {
    const handlers = {};
    const sent = [];
    return {
        middlewares,
        config: { logger: { error() {} } },
        watcher: { on(event, handler) { handlers[event] = handler; } },
        ws: { send: message => sent.push(message) },
        handlers,
        sent,
    };
}

// the plugin's middleware, called like connect would: resolves with the response, or 'next'
function request(plugin, url, method = 'GET') {
    let middleware;
    plugin.configureServer(fakeServer({ use: fn => { middleware = fn; } }));

    return new Promise((resolve, reject) => {
        const chunks = [];
        const headers = {};
        const res = new (require('node:stream').Writable)({
            write(chunk, _encoding, done) { chunks.push(chunk); done(); },
        });
        res.statusCode = 0;
        res.setHeader = (name, value) => { headers[name.toLowerCase()] = value; };
        res.on('finish', () => resolve({ status: res.statusCode, headers, body: Buffer.concat(chunks) }));
        middleware({ method, url }, res, error => error ? reject(error) : resolve('next'));
    });
}

const pixel = async buffer => [...(await sharp(buffer).raw().toBuffer()).subarray(0, 3)];

test('a .webp request is served from the PNG next to it', async () => {
    await withProject({ 'public/images/enemies/saw.png': png(255, 0, 0) }, async root => {
        const response = await request(bareStreamedImagesPlugin({ projectRoot: root }), '/images/enemies/saw.webp?v=1');
        assert.equal(response.status, 200);
        assert.equal(response.headers['content-type'], 'image/webp');
        assert.equal((await sharp(response.body).metadata()).format, 'webp');
        assert.deepEqual(await pixel(response.body), [255, 0, 0]);
    });
});

test('the PNG wins over a .webp of the same name', async () => {
    await withProject({ 'public/images/coin.png': png(0, 255, 0), 'public/images/coin.webp': 'old' }, async root => {
        const response = await request(bareStreamedImagesPlugin({ projectRoot: root }), '/images/coin.webp');
        assert.deepEqual(await pixel(response.body), [0, 255, 0]);
    });
});

test('requests without a streamed PNG go on to vite', async () => {
    await withProject({
        'public/images/only.webp': 'webp',
        'public/initial/hud.png': png(0, 0, 255),
        'public/images/coin.png': png(0, 0, 255),
    }, async root => {
        const plugin = bareStreamedImagesPlugin({ projectRoot: root });
        assert.equal(await request(plugin, '/images/only.webp'), 'next');
        assert.equal(await request(plugin, '/initial/hud.webp'), 'next');
        assert.equal(await request(plugin, '/images/coin.png'), 'next');
        assert.equal(await request(plugin, '/images/../../package.webp'), 'next');
        assert.equal(await request(plugin, '/images/coin.webp', 'POST'), 'next');
    });
});

test('an image in an imageGlobs folder is converted too', async () => {
    await withProject({ 'public/demos/basics/images/cat.png': png(1, 2, 3) }, async root => {
        assert.equal(await request(bareStreamedImagesPlugin({ projectRoot: root }), '/demos/basics/images/cat.webp'), 'next');
        const response = await request(bareStreamedImagesPlugin({ projectRoot: root, imageGlobs: ['demos/**/images/**'] }), '/demos/basics/images/cat.webp');
        assert.equal(response.status, 200);
    });
});

test('a changed PNG is converted again, an unchanged one comes from the cache', async () => {
    await withProject({ 'public/images/coin.png': png(255, 0, 0), 'public/images/emoji/⛏️.png': png(9, 9, 9) }, async root => {
        const plugin = bareStreamedImagesPlugin({ projectRoot: root });
        await request(plugin, '/images/coin.webp');
        const cached = path.join(root, 'node_modules/.bare-engine/images/lossless/public/images/coin.webp');
        assert.ok(fs.existsSync(cached));

        // a cache hit serves the cached file as it is
        fs.writeFileSync(cached, 'cached');
        fs.utimesSync(cached, new Date(), fs.statSync(path.join(root, 'public/images/coin.png')).mtime);
        assert.equal(String((await request(plugin, '/images/coin.webp')).body), 'cached');

        fs.writeFileSync(path.join(root, 'public/images/coin.png'), await png(0, 0, 255));
        fs.utimesSync(path.join(root, 'public/images/coin.png'), new Date(), new Date(Date.now() + 5000));
        assert.deepEqual(await pixel((await request(plugin, '/images/coin.webp')).body), [0, 0, 255]);

        const emoji = await request(plugin, '/images/emoji/' + encodeURIComponent('⛏️') + '.webp');
        assert.equal(emoji.status, 200);
    });
});

test('webpQuality makes lossy images, and keeps its own cache', async () => {
    await withProject({ 'public/images/coin.png': png(255, 0, 0) }, async root => {
        await request(bareStreamedImagesPlugin({ projectRoot: root, webpQuality: 80 }), '/images/coin.webp');
        assert.ok(fs.existsSync(path.join(root, 'node_modules/.bare-engine/images/q80/public/images/coin.webp')));
    });
});

test('a changed streamed PNG tells the game which image to swap', () => {
    const root = path.join(os.tmpdir(), 'bare-images-watch');
    const server = fakeServer();
    bareStreamedImagesPlugin({ projectRoot: root, imageGlobs: ['demos/**/images/**'] }).configureServer(server);

    server.handlers.change(path.join(root, 'public/images/player/idle.png'));
    server.handlers.add(path.join(root, 'public/demos/basics/images/cat.png'));
    server.handlers.change(path.join(root, 'public/initial/hud.png'));
    server.handlers.change(path.join(root, 'public/images/old.webp'));
    server.handlers.change(path.join(root, 'src/game.ts'));

    assert.deepEqual(server.sent, [
        { type: 'custom', event: 'bare:image-changed', data: { url: 'images/player/idle.webp' } },
        { type: 'custom', event: 'bare:image-changed', data: { url: 'demos/basics/images/cat.webp' } },
    ]);
});

test('the build writes a .webp for every streamed PNG and copies everything else', async () => {
    await withProject({
        'public/images/coin.png': png(255, 0, 0),
        'public/images/coin.webp': 'old',
        'public/images/sub/atlas.png': png(0, 255, 0),
        'public/images/sub/atlas.json': '{}',
        'public/images/leftover.webp': 'kept',
        'public/images/.gitkeep': '',
        'public/initial/hud.png': 'initial png',
        'public/sounds/.gitkeep': '',
        'public/index.html': 'from public',
    }, async root => {
        const outDir = path.join(root, 'dist');
        await copyPublicDir(root, path.join(root, 'public'), outDir, { skip: rel => rel === 'index.html' });

        const out = rel => path.join(outDir, rel);
        assert.deepEqual(await pixel(fs.readFileSync(out('images/coin.webp'))), [255, 0, 0]);
        assert.ok(!fs.existsSync(out('images/coin.png')));
        assert.equal((await sharp(fs.readFileSync(out('images/sub/atlas.webp'))).metadata()).format, 'webp');
        assert.equal(fs.readFileSync(out('images/sub/atlas.json'), 'utf8'), '{}');
        assert.equal(fs.readFileSync(out('images/leftover.webp'), 'utf8'), 'kept');
        assert.equal(fs.readFileSync(out('initial/hud.png'), 'utf8'), 'initial png');
        assert.ok(!fs.existsSync(out('images/.gitkeep')));
        assert.ok(!fs.existsSync(out('sounds')), 'a folder with only a placeholder is not made');
        assert.ok(!fs.existsSync(out('index.html')), 'a file the bundle wrote is left alone');
    });
});
