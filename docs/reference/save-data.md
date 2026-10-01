# Save Data

`SaveData` holds values that should survive between sessions, and `bare.storage` writes them to the browser's `localStorage`.

```ts
import { SaveData } from 'bare-engine';

bare.storage.Load();                 // read saved values, usually at startup

SaveData.soundEnabled = false;
bare.storage.Save();                 // write all values
```

Loading is not automatic, so call `bare.storage.Load()` once when your game starts, for example in `OnAwake`.

## Adding your own fields

Register your fields and their default values with `SetDefaults`:

```ts
bare.storage.SetDefaults({
    highScore: 0,
    unlockedLevels: new Set<string>(),
});
bare.storage.Load();

(SaveData as any).highScore = 1200;
bare.storage.Save();
```

Numbers, strings, booleans, objects, arrays, `Set` and `Map` are all supported.

## Built-in fields

| Field | Description |
| --- | --- |
| `soundEnabled` | When `false`, `bare.sound.Play` does nothing. |
| `musicEnabled` | For your own music toggle. |
| `currentLevelStr` | The last loaded level name. Save it to resume where the player left off. |

## Methods

| Method | Description |
| --- | --- |
| `bare.storage.Load()` | Read saved values, or use the defaults. |
| `bare.storage.Save()` | Write all values. |
| `bare.storage.Clear()` | Delete the save. |
| `bare.storage.SetDefaults(values)` | Add fields with default values. |

Saves are stored under your game's `gameId` from `package.json`, so games on the same domain don't overwrite each other.

::: tip
While developing, press **C** to restart with cleared save data.
:::
