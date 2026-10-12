// Tests for the bare:auto-register-classes Vite plugin and generateAssets (vite/plugins.cjs).
// Each test builds a small project in a temp folder, runs the plugin's transform on its
// src/game.ts, and checks which classes it registers and where it imports them from.
// Run: node --test scripts/autoRegisterPlugin.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bareAutoRegisterClassesPlugin, generateAssets } = require('../vite/plugins.cjs');

const GAME = (body = '') => `import { Scene, StartBare } from 'bare-engine';
export class Game extends Scene
{
    override OnAwake() {}
    override OnStart()
    {
        ${body}
    }
}
StartBare(Game);
`;

function withProject(files, run) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-plugin-'));
    try {
        for (const [file, content] of Object.entries(files)) {
            const full = path.join(root, file);
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
        }
        return run(root);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

// what the plugin injects into game.ts: { name: importedFrom }
function registrations(root) {
    const plugin = bareAutoRegisterClassesPlugin({ projectRoot: root });
    plugin.buildStart.call({});
    const id = path.resolve(root, 'src/game.ts').split(path.sep).join('/');
    const code = plugin.transform.call({}, fs.readFileSync(id, 'utf8'), id)?.code ?? '';

    const imports = Object.fromEntries([...code.matchAll(/import \{ (\w+) \} from "([^"]+)";/g)].map(m => [m[1], m[2]]));
    const result = {};
    for (const m of code.matchAll(/bare\.(?:AddClass|RegisterComponent)\((\w+), "\w+"\)/g)) {
        result[m[1]] = imports[m[1]] ?? '(already imported)';
    }
    return result;
}

const settings = (prefabs, basePrefabs = []) => ({ 'public/data/settingsData.json': { prefabs, basePrefabs } });

test('a project with no references registers nothing', () => {
    withProject({ 'src/game.ts': GAME() }, root => {
        assert.deepEqual(registrations(root), {});
    });
});

test('exported project components register from their file, others do not', () => {
    withProject({
        'src/game.ts': GAME(),
        'src/components/enemyComponent.ts': `import { Component } from 'bare-engine';\nexport class EnemyComponent extends Component {}\n`,
        'src/components/hiddenComponent.ts': `import { Component } from 'bare-engine';\nclass HiddenComponent extends Component {}\n`,
    }, root => {
        assert.deepEqual(registrations(root), { EnemyComponent: './components/enemyComponent' });
    });
});

test('engine components named in settingsData register from bare-engine, also in nested children', () => {
    withProject({
        'src/game.ts': GAME(),
        ...settings([
            { name: 'ground', components: { tiled: {} } },
            { name: 'player', children: [{ name: 'label', children: [{ name: 'deep', components: { text: {} } }] }] },
        ], [
            { name: 'sparkly', components: { particle: {} } },
        ]),
    }, root => {
        assert.deepEqual(registrations(root), {
            ParticleComponent: 'bare-engine',
            TextComponent: 'bare-engine',
            TiledComponent: 'bare-engine',
        });
    });
});

test('engine components named in a components object in code register, nested field names do not', () => {
    withProject({
        'src/game.ts': GAME(`this.AddGameObject({ texture: 'grass', components: { tiled: { scroll: { x: 1, particle: 2 } }, "text": {}, enemy: {} } });`),
    }, root => {
        assert.deepEqual(registrations(root), { TextComponent: 'bare-engine', TiledComponent: 'bare-engine' });
    });
});

test('every component bare-engine exports can be registered by name', () => {
    // read the exports the same way a user would see them, so a new engine component is covered automatically
    const index = fs.readFileSync(path.join(__dirname, '../src/index.ts'), 'utf8');
    const exported = [...index.matchAll(/export \{([^}]*)\} from "\.\/components\/[^"]+"/g)]
        .flatMap(m => m[1].split(',').map(s => s.trim()))
        .filter(name => name.endsWith('Component'));
    assert.ok(exported.length >= 6, 'expected the engine to export its components: ' + exported.join(', '));

    const key = name => name.charAt(0).toLowerCase() + name.slice(1, -'Component'.length);
    withProject({
        'src/game.ts': GAME(),
        ...settings([{ name: 'everything', components: Object.fromEntries(exported.map(name => [key(name), {}])) }]),
    }, root => {
        const registered = registrations(root);
        for (const name of exported) {
            assert.equal(registered[name], 'bare-engine', `${name} should register from bare-engine`);
        }
    });
});

test('engine baseClasses in settingsData register the class or its physics controller', () => {
    withProject({
        'src/game.ts': GAME(),
        ...settings([
            { name: 'label', baseClass: 'TextObject' },
            { name: 'menu', children: [{ name: 'play', baseClass: 'Button' }] },
            { name: 'player', baseClass: 'ArcadeObject' },
            { name: 'crate', baseClass: 'Box' },
            { name: 'plain', baseClass: 'GameObject' },
        ]),
    }, root => {
        assert.deepEqual(registrations(root), {
            ArcadePhysicsController: 'bare-engine/arcade',
            Button: 'bare-engine',
            SopiroPhysicsController: 'bare-engine/sopiro',
            TextObject: 'bare-engine',
        });
    });
});

test('a baseClass in code registers too', () => {
    withProject({
        'src/game.ts': GAME(`this.AddGameObject({ baseClass: "Circle" }); this.AddGameObject({ baseClass: 'TextObject', text: 'hi' });`),
    }, root => {
        assert.deepEqual(registrations(root), { SopiroPhysicsController: 'bare-engine/sopiro', TextObject: 'bare-engine' });
    });
});

test('project GameObject classes register when named as a baseClass, with the physics controller they extend', () => {
    withProject({
        'src/game.ts': GAME(),
        'src/hero.ts': `import { ArcadeObject } from 'bare-engine/arcade';\nexport class Hero extends ArcadeObject {}\nexport class Unused extends ArcadeObject {}\n`,
        'src/boss.ts': `import { Hero } from './hero';\nexport class Boss extends Hero {}\n`,
        'src/decorated.ts': `import { GameObject, InspectorBaseClass } from 'bare-engine';\n@InspectorBaseClass\nexport class Decorated extends GameObject {}\n`,
        ...settings([{ name: 'boss', baseClass: 'Boss' }]),
    }, root => {
        assert.deepEqual(registrations(root), {
            ArcadePhysicsController: 'bare-engine/arcade',
            Boss: './boss',
            Decorated: './decorated',
        });
    });
});

test('classes the game already registers itself are not registered twice', () => {
    withProject({
        'src/game.ts': `import { Scene, StartBare, TextObject } from 'bare-engine';
import { ArcadePhysicsController } from 'bare-engine/arcade';
export class Game extends Scene
{
    override OnAwake()
    {
        bare.AddClass(ArcadePhysicsController);
        bare.AddClass(TextObject);
    }
}
StartBare(Game);
`,
        ...settings([{ name: 'label', baseClass: 'TextObject', components: { tiled: {} } }, { name: 'player', baseClass: 'ArcadeObject' }]),
    }, root => {
        assert.deepEqual(registrations(root), { TiledComponent: 'bare-engine' });
    });
});

test('generateAssets lists prefabs, base prefabs and layers from settingsData', () => {
    withProject({
        'src/game.ts': GAME(),
        'public/data/settingsData.json': {
            layers: ['ground', 'enemies'],
            prefabs: [{ name: 'enemy_grunt' }, { name: 'grassField' }],
            basePrefabs: [{ name: 'tower' }],
        },
    }, root => {
        const output = path.join(root, 'src/generated/assets.ts');
        generateAssets(root, output);
        const code = fs.readFileSync(output, 'utf8');
        assert.match(code, /ENEMY_GRUNT: "enemy_grunt"/);
        assert.match(code, /GRASS_FIELD: "grassField"/);
        assert.match(code, /TOWER: "tower"/);
        assert.match(code, /GROUND: \d+/);
        assert.match(code, /ENEMIES: \d+/);
    });
});
