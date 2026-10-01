# Levels & Layers

## Levels

A level is a JSON file in `public/data/levels/`. It holds layers of [entities](./prefabs#entities), which become GameObjects when the level loads. Usually each entity extends a prefab and overrides a few properties:

```json
{
  "name": "level1",
  "dimensions": {
    "width": 1536,
    "height": 1152
  },
  "entitiesByLayer": {
    "objects": [
      {
        "extends": "player",
        "position": {
          "x": 100,
          "y": 800
        }
      },
      {
        "extends": "grassMid",
        "position": {
          "x": 192,
          "y": 896
        }
      }
    ]
  }
}
```

You build levels with the in-game level editor rather than by hand.

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [`level.json`](https://github.com/bare-engine/bare-platformer/blob/main/public/data/levels/level.json).

### Loading levels

```ts
async OnStart()
{
    await this.LoadLevel('level1');
}

OnPostLoadLevel(level: LevelData)
{
    bare.camera.SetDimensionsToLevel();
}
```

Or through `bare.level`:

```ts
await bare.level.Load('level2');
await bare.level.Restart();
await bare.level.Save();
```

`OnPreLoadLevel` and `OnPostLoadLevel` on your scene run before and after a level loads. See [Level](../reference/level) for all methods.

::: tip
Set `"firstLevelLoad": "level1"` under `bareEngine` in `package.json` to start fetching that level while the page loads. See [package.json Options](../reference/package-json#firstlevelload).
:::

**Examples:** the [Platformer](https://github.com/bare-engine/bare-platformer) [loads its level and fits the camera](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L43-L53), and the [RPG](https://github.com/bare-engine/bare-rpg) [starts from the player's saved level](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L74-L77).

## What gets saved

When a level is saved, each object is stored as an entity. Values that are the same as the prefab's or the class default are left out, so levels stay small.

Which properties are saved depends on where you save from:

- **In the [level editor](./level-editor)**, all properties are saved, so everything you set up is kept.
- **While playing**, with `bare.level.Save()`, only the properties in `saveVars` are saved. Use this to remember the state of a level, like enemies that were defeated, when the player comes back to it.

By default, `saveVars` saves `position`, `children` and `components` for every GameObject. Add more per class in `settingsData.json`:

```json
"saveVars": {
  "ArcadeObject": ["color"]
}
```

Lists add to the default `GameObject` list, and a class also gets the lists of the classes it extends, so the example saves `position`, `children`, `components` and `color` for every `ArcadeObject`. The class has to be registered with `bare.AddClass()`.

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg) [saves the level](https://github.com/bare-engine/bare-rpg/blob/main/src/components/playerComponents.ts#L125) when the player walks to the next one, and its [`saveVars`](https://github.com/bare-engine/bare-rpg/blob/main/public/data/settingsData.json#L191-L193) also keep each object's color. So, for example, a killed rat stays gray.

### Saving fields with @Save

A component saves the fields you mark with `@Save`:

```ts
import { Component, Inspector, InspectorField, Save } from 'bare-engine';

export class AliveComponent extends Component
{
    @Save
    @InspectorField
    @Inspector.Int
    health: number = 0;

    @InspectorField
    @Inspector.Int
    maxHealth: number = 10;
}
```

Here each enemy you place can get its own `health`, which is saved in the level. `maxHealth` is only an inspector field, so it isn't saved with the level; set it in the prefab instead.

- `@Save` works the same on fields of your own [GameObject classes](./custom-game-objects).
- `@Save` fields also show up in the [Chrome extension](./chrome-extension), so `@InspectorField` is only needed for options like `@Inspector.Int`.
- A component without any `@Save` field saves its constructor parameters instead.

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg)'s [`AliveComponent`](https://github.com/bare-engine/bare-rpg/blob/main/src/components/aliveComponent.ts#L5-L12) and its [level connector](https://github.com/bare-engine/bare-rpg/blob/main/src/components/levelConnectorComponent.ts#L10-L13), which saves which level each side leads to.

## Layers

Within a scene, GameObjects live on layers. Layers decide draw order: later layers draw on top. `objects` is the default layer and always exists.

Add more in `settingsData.json`:

```json
"layers": ["background", "objects"]
```

The generated `Data.Layer` updates to include them:

```ts
this.AddGameObject('cloud', Data.Layer.BACKGROUND);
this.AddGameObject('cloud', 'background');   // same thing
```

Layer methods on `bare.object`:

```ts
bare.object.GetLayerByName('background');
bare.object.GetLayerOf(obj);
bare.object.MoveToLayer(obj, layerIndex);
```

### Layer settings

Settings per layer go in `layersInfo`:

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
| `pointerCollisionType` | `0` | How the pointer picks objects: `0` takes the top object, `1` the nearest one. See [Mobile & Touch](./mobile#fingers-are-less-precise). |

**Example:** the [Shmup](https://github.com/bare-engine/bare-shmup) [defines a layer per kind of object](https://github.com/bare-engine/bare-shmup/blob/main/public/data/settingsData.json#L83) (enemies, their bullets, your bullets, the player), and [counts objects per layer](https://github.com/bare-engine/bare-shmup/blob/main/src/game.ts#L126-L136).
