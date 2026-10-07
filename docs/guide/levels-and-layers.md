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

You build levels with the in-game [level editor](./level-editor) rather than by hand. To create a new level, click the **+** button under the **Levels** tab of the [Chrome extension](./chrome-extension).

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [`level.json`](https://github.com/bare-engine/bare-platformer/blob/main/public/data/levels/level.json).

### Loading levels

```ts
override async OnStart()
{
    await this.LoadLevel('level1');
}

override OnPostLoadLevel(level: LevelData)
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

## Saving levels

A level can be saved while playing or from the editor, and only fields marked `@SerializeField` or listed in `saveVars` are kept. See [Save Data](../reference/save-data#saving-destinations).

## Layers

Within a scene, GameObjects live on layers. Layers decide draw order: later layers draw on top. `objects` is the default layer and always exists: if your `layers` list leaves it out, it's added at the start, below your own layers.

Add more in `settingsData.json`:

```json
"layers": ["background", "objects"]
```

The generated `Data.Layer` updates to include them:

```ts
import { Data } from './generated/assets';

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

See [all layer settings](./settings-data#layers): which layers collide, whether a layer is saved and shown in the editor, and how the pointer picks objects on it.

**Example:** the [Shmup](https://github.com/bare-engine/bare-shmup) [defines a layer per kind of object](https://github.com/bare-engine/bare-shmup/blob/main/public/data/settingsData.json#L83) (enemies, their bullets, your bullets, the player), and [counts objects per layer](https://github.com/bare-engine/bare-shmup/blob/main/src/game.ts#L126-L136).
