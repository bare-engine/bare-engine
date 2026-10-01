# Levels & Layers

## Levels

A level is a JSON file in `public/data/levels/`. It holds layers of [entities](./prefabs#entities), which become GameObjects when the level loads. Usually each entity extends a prefab and overrides a few properties:

```json
{
  "name": "level1",
  "dimensions": { "width": 1536, "height": 1152 },
  "entitiesByLayer": {
    "objects": [
      { "extends": "player",   "position": { "x": 100, "y": 800 } },
      { "extends": "grassMid", "position": { "x": 192, "y": 896 } }
    ]
  }
}
```

You build levels with the in-game level editor rather than by hand.

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
