// Tests for project paths whose drive letter case differs (c:\ vs C:\)
// (vite/plugins.cjs, vite/controllerProxyTransformer.js).
// Run: node --test scripts/pathCase.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const createControllerProxyTransformer = require('../vite/controllerProxyTransformer');
const { bareGeneratedAssetsPlugin } = require('../vite/plugins.cjs');

const windowsOnly = { skip: process.platform !== 'win32' && 'drive letters only exist on Windows' };

// the same path with the drive letter in the other case: c:\x <-> C:\x
function flipDriveCase(filePath) {
    const drive = filePath[0];
    const flipped = drive === drive.toUpperCase() ? drive.toLowerCase() : drive.toUpperCase();
    return flipped + filePath.slice(1);
}

function transform(fileName, code) {
    return ts.transpileModule(code, {
        fileName,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        transformers: { before: [createControllerProxyTransformer()] },
    }).outputText;
}

const USES_STORAGE = `import { Scene, StartBare } from 'bare-engine';
class Game extends Scene {}
StartBare(Game, { OnInit: () => { bare.storage.Load(); } });
`;

test('bare.storage is rewritten in a project file', () => {
    const output = transform(path.join(process.cwd(), 'game/src/game.ts'), USES_STORAGE);
    assert.match(output, /__Bare_SaveDataHandler\.Load\(\)/);
});

test('bare.storage is rewritten when the drive letter case differs from the working folder', windowsOnly, () => {
    const output = transform(flipDriveCase(path.join(process.cwd(), 'game/src/game.ts')), USES_STORAGE);
    assert.match(output, /__Bare_SaveDataHandler\.Load\(\)/);
});

test('bare.storage outside the project root fails the build instead of the game', () => {
    const outside = path.join(path.parse(process.cwd()).root, 'somewhere-else', 'src', 'game.ts');
    assert.throws(() => transform(outside, USES_STORAGE), /isn't under the project root/);
});

test('bare.storage in a dependency is left alone', () => {
    const output = transform(path.join(process.cwd(), 'node_modules/some-lib/index.ts'), USES_STORAGE);
    assert.match(output, /bare\.storage\.Load\(\)/);
});

// A project in a temp folder, plus a fake dev server that records what the plugin does.
function withDevServer(run) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-assets-'));
    try {
        fs.mkdirSync(path.join(root, 'public/data'), { recursive: true });
        fs.mkdirSync(path.join(root, 'public/images'), { recursive: true });
        fs.mkdirSync(path.join(root, 'src'), { recursive: true });
        fs.writeFileSync(path.join(root, 'public/data/settingsData.json'), JSON.stringify({ prefabs: [], basePrefabs: [] }));
        fs.writeFileSync(path.join(root, 'src/game.ts'), '');

        const handlers = {};
        const invalidated = [];
        const reloads = [];
        const server = {
            watcher: { add() {}, on(event, handler) { handlers[event] = handler; } },
            moduleGraph: { getModulesByFile: () => new Set([{ id: 'assets.ts' }]), invalidateModule: mod => invalidated.push(mod) },
            ws: { send: message => reloads.push(message) },
        };
        bareGeneratedAssetsPlugin({ projectRoot: root }).configureServer(server);
        run({ root, handlers, invalidated, reloads });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

const addImage = (root, name) => {
    const file = path.join(root, 'public/images', name + '.webp');
    fs.writeFileSync(file, '');
    return file;
};

test('a new image reloads the game with the new assets.ts', () => {
    withDevServer(({ root, handlers, invalidated, reloads }) => {
        handlers.add(addImage(root, 'coin'));
        assert.equal(invalidated.length, 1);
        assert.equal(reloads.length, 1);
        assert.match(fs.readFileSync(path.join(root, 'src/generated/assets.ts'), 'utf8'), /COIN: "coin"/);
    });
});

test('the watcher matches a path whose drive letter case differs', windowsOnly, () => {
    withDevServer(({ root, handlers, invalidated }) => {
        handlers.add(flipDriveCase(addImage(root, 'coin')));
        assert.equal(invalidated.length, 1);
    });
});
