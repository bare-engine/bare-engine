# Level

`bare.level` loads and saves [levels](../guide/levels-and-layers) for the current scene. Levels are JSON files in `public/data/levels/`.

```ts
await bare.level.Load('level1');
await bare.level.Restart();
```

| Method | Behavior |
| --- | --- |
| `Load(nameOrData = "")` | Clears the scene, preserving persistent objects, then loads the level. |
| `LoadOnly(nameOrData)` | Load a level without clearing the scene first. |
| `LoadData(name: string)` | Returns cached level data, or fetches and caches it, without creating scene objects. |
| `LoadCurrent()` / `Restart()` | Reloads the current level. |
| `Save()` | Save the current level. |
| `Serialize(level: LevelData)` | Turn the scene's objects into level data. |
| `Clear()` | Clear the loaded level. |

See [saving destinations](./save-data#saving-destinations) for an explicit recipe to persist gameplay changes, and the [level editor](../guide/level-editor) for writes to project files.

From a scene, `this.LoadLevel(name)` does the same as `bare.level.Load(name)`. Override `OnPreLoadLevel(level)` and `OnPostLoadLevel(level)` to run code around loading.

## Startup order during loading

Set per-level state needed by newly created objects in `OnPreLoadLevel(level)`. It runs before textures are loaded and entities are created.

When loading into a scene that has already started, adding each entity runs its object and component `OnStart` hooks during the load, before the scene's `OnPostLoadLevel`. Use `OnPostLoadLevel` for work that needs all level entities to exist, such as finding spawn points or linking objects together.

When the scene awaits its first level load inside its own `OnStart`, object and component starts are deferred until scene `OnStart` finishes. In that case, `OnPostLoadLevel` runs first. Do not rely on that initial-load ordering for later level changes.

`LoadOnly` calls `OnPreLoadLevel` and creates entities, but does not call `OnPostLoadLevel` itself.

```ts
override OnPreLoadLevel(level: LevelData)
{
    this.levelName = level.name;
    this.nav = level.customData?.nav ?? [];
}
```

Here `levelName` and `nav` are fields declared by the game, and `LevelData` is imported from `bare-engine`.

Only GameObjects with `persistent = true` survive loading a new level.

**Examples:** the [Platformer](https://github.com/bare-engine/bare-platformer) [loads its level](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L43-L47). The [RPG](https://github.com/bare-engine/bare-rpg) [loads the player's saved level](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L74-L77), and [fetches neighbouring levels ahead of time](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L107-L123) with `LoadData`.
