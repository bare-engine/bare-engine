// Tests for moving a freshly packed atlas into place without the folder going empty
// (installPackedOutput in scripts/buildAssets.cjs).
// Run: node --test scripts/buildAssets.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installPackedOutput } = require('./buildAssets.cjs');

// a packed atlas in `from`, and the current one in `to`
function setup(t, current, packed) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-install-packed-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const from = path.join(root, 'temp');
    const to = path.join(root, 'generated');
    fs.mkdirSync(from);
    for (const [name, content] of Object.entries(packed))
        fs.writeFileSync(path.join(from, name), content);
    if (current)
    {
        fs.mkdirSync(to);
        for (const [name, content] of Object.entries(current))
            fs.writeFileSync(path.join(to, name), content);
    }
    return { from, to };
}

function read(dir) {
    return Object.fromEntries(fs.readdirSync(dir).sort().map(name => [name, fs.readFileSync(path.join(dir, name), 'utf8')]));
}

test('the new atlas replaces the old one, and files it no longer has are removed', (t) => {
    const { from, to } = setup(t,
        { 'texturePackImages.json': 'old json', 'texturePackImages.png': 'old png' },
        { 'texturePackImages.json': 'new json', 'texturePackImages.webp': 'new webp' });

    installPackedOutput(from, to);

    assert.deepEqual(read(to), { 'texturePackImages.json': 'new json', 'texturePackImages.webp': 'new webp' });
});

test('the json is never missing, and goes in after its image', (t) => {
    const { from, to } = setup(t,
        { 'texturePackImages.json': 'old json', 'texturePackImages.webp': 'old webp' },
        { 'texturePackImages.json': 'new json', 'texturePackImages.webp': 'new webp' });

    const json = path.join(to, 'texturePackImages.json');
    const moved = [];
    for (const method of ['renameSync', 'copyFileSync', 'rmSync'])
    {
        const original = fs[method];
        t.mock.method(fs, method, function (...args) {
            const result = original.apply(this, args);
            assert.ok(fs.existsSync(json), `texturePackImages.json was missing after ${method}`);
            moved.push(path.basename(String(args[method === 'rmSync' ? 0 : 1])));
            return result;
        });
    }

    installPackedOutput(from, to);
    t.mock.restoreAll();

    assert.deepEqual(moved, ['texturePackImages.webp', 'texturePackImages.json']);
});

test('unchanged files are left alone', (t) => {
    const { from, to } = setup(t,
        { 'texturePackImages.json': 'same json', 'texturePackImages.webp': 'old webp' },
        { 'texturePackImages.json': 'same json', 'texturePackImages.webp': 'new webp' });
    const rename = t.mock.method(fs, 'renameSync');

    installPackedOutput(from, to);

    assert.deepEqual(rename.mock.calls.map(call => path.basename(call.arguments[1])), ['texturePackImages.webp']);
});

test('the output folder is created when it does not exist yet', (t) => {
    const { from, to } = setup(t, null, { 'texturePackImages.json': 'json' });

    installPackedOutput(from, to);

    assert.deepEqual(read(to), { 'texturePackImages.json': 'json' });
});
