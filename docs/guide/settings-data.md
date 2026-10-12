# settingsData.json

`public/data/settingsData.json` holds your game's data: prefabs, base prefabs, presets, animations, layers, and settings for physics, saving and the level editor. You can edit it by hand, but the browser extension ([Chrome](https://chromewebstore.google.com/detail/bare-engine/dbohigkcdpdnchgaffmofeoffnpkmphb) / [Firefox](https://addons.mozilla.org/en-GB/firefox/addon/bare-engine/)) is made for it.

Pass it to your scene to use it:

```ts
import settingsData from '../public/data/settingsData.json';

export class Game extends Scene
{
    constructor()
    {
        super(settingsData);
    }
}
```

A scene without `settingsData` gets the [built-in defaults](#defaults) only.

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [`settingsData.json`](https://github.com/bare-engine/bare-platformer/blob/main/public/data/settingsData.json).

## Overview

Every key is optional. A small file using most of them:

```json
{
  "gravity": 5000,
  "layers": ["background", "objects", "ui"],
  "layersInfo": {
    "background": { "showInEditor": false }
  },
  "basePrefabs": [
    { "name": "block", "baseClass": "ArcadeObject", "hitbox": "FULL", "static": true }
  ],
  "prefabs": [
    { "name": "player", "texture": "player", "components": { "animation": {} } },
    { "name": "grass", "extends": "block" }
  ],
  "animations": {
    "player_walk": { "frames": ["player/player_walk#2"], "framesPerSecond": 10 }
  },
  "categories": {
    "blocks": { "entries": ["grass"], "expanded": true }
  },
  "saveVars": {
    "ArcadeObject": ["color"]
  },
  "settings": { "gridEnabled": true, "gridSize": 32 }
}
```

| Key | Default | Description |
| --- | --- | --- |
| `prefabs` | `[]` | Named GameObject definitions. See [Prefabs](./prefabs). |
| `basePrefabs` | `ANY` and `NONE` | Building blocks for other prefabs. See [Base prefabs](./prefabs#base-prefabs). |
| `presets` | `FULL`, `CENTER` | Reusable property values. See [Presets](./prefabs#presets). |
| `animations` | | Named frame animations, used by `AnimationComponent`. See [Animations](./animations#defining-animations). |
| `layers` | `["objects"]` | Layer names, in draw order. See [Layers](#layers). |
| `layersInfo` | | Settings per layer. See [Layers](#layers). |
| `gravity` | `0` | Downward gravity for [physics](../reference/physics). |
| `sopiro` | | Solver settings for [realistic physics](../reference/physics#tuning) in this scene. |
| `saveVars` | `position`, `children`, `components` | Properties saved per GameObject class when a level is saved while playing. See [saveVars](../reference/save-data#savevars). |
| `categories` | | How prefabs are grouped in the [level editor](./level-editor#categories)'s sidebar. |
| `settings` | grid off, size `64` | Level editor grid: `gridEnabled` and `gridSize`. See [Grid](./level-editor#grid). |
| `editorObjectSnapToPivot` | `true` | `false` makes objects fill the [level editor grid](./level-editor#grid) cell instead of snapping their pivot to the lines. |
| `name` | | The file name the editor saves to. See [More than one settings file](#more-than-one-settings-file). |

## Layers

`layers` lists your layer names. Later layers draw on top. `objects` always exists: if you leave it out, it's added at the start, below your own layers. See [Levels & Layers](./levels-and-layers#layers) for using layers in code.

```json
"layers": ["background", "objects"]
```

Settings per layer go in `layersInfo`, keyed by layer name:

```json
"layersInfo": {
  "background": {
    "save": false,
    "showInEditor": false
  }
}
```

| Setting | Default | Description |
| --- | --- | --- |
| `collidesWith` | | Layers this layer's objects collide with. See [collision layers](../reference/physics#collision-layers). |
| `save` | `true` | Save this layer's objects into the level file. |
| `showInEditor` | `true` | Show the layer in the level editor. |
| `pointerCollisionType` | `"POINT"` | How the pointer picks objects: `"POINT"` takes the top object, `"RADIUS"` the nearest one. In code: `CollisionHandlingType.POINT` / `CollisionHandlingType.RADIUS`. See [Mobile & Touch](./mobile#fingers-are-less-precise). |

**Example:** the [Shmup](https://github.com/bare-engine/bare-shmup) [defines a layer per kind of object](https://github.com/bare-engine/bare-shmup/blob/main/public/data/settingsData.json#L83) and [which of them collide](https://github.com/bare-engine/bare-shmup/blob/main/public/data/settingsData.json#L84-L94).

## Defaults

When a scene loads its settings, the built-in defaults are merged into a copy of your data, so they don't end up in your file:

- **A missing key** gets its default.
- **Lists** get the default items they're missing. That's how `objects` ends up in `layers`.
- **Objects** like `presets`, `layersInfo` and `saveVars` keep all your entries and get the default entries you don't have. An entry you share with the defaults is merged with it, so your own `FULL` preset replaces the built-in one key by key, and a `GameObject` list in `saveVars` still includes `position`, `children` and `components`.

`ANY` and `NONE` are added to `basePrefabs` if you don't define them. See [Base prefabs](./prefabs#base-prefabs).

## Editing

The browser extension ([Chrome](https://chromewebstore.google.com/detail/bare-engine/dbohigkcdpdnchgaffmofeoffnpkmphb) / [Firefox](https://addons.mozilla.org/en-GB/firefox/addon/bare-engine/)) edits prefabs and the level editor's settings while your game runs, and the dev server writes them back to `settingsData.json`.

## Generated names

While the dev server runs, the `Data` object in `src/generated/assets.ts` is generated from `settingsData.json`, so you get autocomplete and typo checks:

```ts
import { Data } from './generated/assets';

this.AddGameObject(Data.Prefab.PLAYER);
this.AddGameObject('cloud', Data.Layer.BACKGROUND);
anim.Play(Data.Animation.PLAYER_WALK);
```

| Map | From |
| --- | --- |
| `Data.Prefab` | `prefabs` |
| `Data.BasePrefab` | `basePrefabs` |
| `Data.Animation` | `animations` |
| `Data.Layer` | `layers`, as layer indices, including `objects` |

Each also has a list, like `Data.Prefabs`.

## More than one settings file

Each scene has its own settings, so scenes can use different files:

```ts
import menuData from '../public/data/menuData.json';

export class Menu extends Scene
{
    constructor()
    {
        super(menuData);
    }
}
```

Give every extra file a `name`, like `"name": "menuData"`. The editor saves to `<name>.json` in `public/data/`, and without a name it would overwrite `settingsData.json`.

The `Data` object is only generated from `settingsData.json`.

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg)'s map editor uses its own [`mapData.json`](https://github.com/bare-engine/bare-rpg/blob/main/public/data/mapData.json). See [Example: the RPG's map editor](./level-editor#example-the-rpg-s-map-editor).
