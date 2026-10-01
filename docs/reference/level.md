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
| `LoadData(name: string)` | Reads cached level data without loading it. |
| `LoadCurrent()` / `Restart()` | Reloads the current level. |
| `Save()` | Save the current level (used by the editor). |
| `Serialize(level: LevelData)` | Turn the scene's objects into level data. |
| `Clear()` | Clear the loaded level. |

See [saving destinations](./save-data#saving-destinations) for an explicit recipe to persist gameplay changes, and the [level editor](../guide/level-editor) for writes to project files.

From a scene, `this.LoadLevel(name)` does the same as `bare.level.Load(name)`. Override `OnPreLoadLevel(level)` and `OnPostLoadLevel(level)` to run code around loading.

Only GameObjects with `persistent = true` survive loading a new level.

**Examples:** the [Platformer](https://github.com/bare-engine/bare-platformer) [loads its level](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L43-L47). The [RPG](https://github.com/bare-engine/bare-rpg) [loads the player's saved level](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L74-L77), and [fetches neighbouring levels ahead of time](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L107-L123) with `LoadData`.
