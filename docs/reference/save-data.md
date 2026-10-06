# Save Data

`SaveData` holds values that should survive between sessions, and `bare.storage` writes them to the browser's `localStorage`.

```ts
import { SaveData } from 'bare-engine';

bare.storage.Load();                 // read saved values, usually at startup

SaveData.soundEnabled = false;
bare.storage.Save();                 // write all values
```

Loading is not automatic, so call `bare.storage.Load()` once when your game starts, for example in `OnAwake`.

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg) [loads its save](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L71) at startup and [saves after every level](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L104).

## Adding your own fields

Describe your fields once, so TypeScript knows them, and register their default values with `SetDefaults`:

```ts
import { SaveData } from 'bare-engine';

declare module 'bare-engine'
{
    namespace SaveData
    {
        let highScore: number;
        let unlockedLevels: Set<string>;
    }
}

bare.storage.SetDefaults({
    highScore: 0,
    unlockedLevels: new Set<string>(),
});
bare.storage.Load();

SaveData.highScore = 1200;
bare.storage.Save();
```

Numbers, strings, booleans, objects, arrays, `Set` and `Map` are all supported.

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [extend demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/extend/src/DemoExtend.ts#L55-L65) adds a `happyEmojisClicked` field.

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

## Saving destinations

| Action | Result |
| --- | --- |
| `bare.level.Serialize()` | Serializes the current objects into the in-memory level. |
| `await bare.level.Save()` | Serializes the level, if `bare.storage` is active (referenced anywhere in user code), calls `bare.storage.Save()`. |
| `bare.storage.Save()` | Writes `SaveData` (including every serialized/cached level) to browser `localStorage` under the game's `gameId`. |
| Save in the editor on the dev server | Writes the level to disk. |
| Save in the editor in a production build | Writes the level to browser `localStorage`. |

## What gets saved

When a level is saved, each object is stored as an entity. Leaving out as much data as possible, such as default or prefab values.

Which properties are saved depends on where you save from:

- **In the [level editor](../guide/level-editor)**, the serializer considers built-in entity properties and fields marked `@SerializeField`, except `@SerializeField(GameMode.Play)` ones. This includes properties of components.
- **While playing**, with `bare.level.Save()`, it considers GameObject properties selected by `saveVars`, plus fields marked `@SerializeField`, except `@SerializeField(GameMode.Edit)` ones. This includes properties of components. The engine's own classes, like `ArcadeObject`, mark their fields `GameMode.Edit`, so add a property to `saveVars` to keep it.

Layers with `save: false`, persistent objects, and objects with `save: false` are omitted. A field marked only `@InspectorField` is never saved. See [Saving and showing fields](./inspector-decorators#saving-and-showing-fields).

Top-level objects are always saved, but a child is only saved when it's marked `save: true`: in its prefab or entity, like `{ "name": "flag", "save": true }`, or with `child.save = true` in code. Other children aren't stored: when the level loads, the prefab's children come back as the prefab defines them, and children added while playing are gone.

By default, `saveVars` saves `position`, `children` and `components` for every GameObject. Add more per class in `settingsData.json`:

```json
"saveVars": {
  "ArcadeObject": ["color"]
}
```

Lists add to the default `GameObject` list, and a class also gets the lists of the classes it extends, so the example saves `position`, `children`, `components` and `color` for every `ArcadeObject`. The class has to be registered, with `@InspectorBaseClass` or `bare.AddClass()`.

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg) [saves the level](https://github.com/bare-engine/bare-rpg/blob/main/src/components/playerComponents.ts#L125) when the player walks to the next one, and its [`saveVars`](https://github.com/bare-engine/bare-rpg/blob/main/public/data/settingsData.json#L191-L193) also keep each object's color. So, for example, a killed rat stays gray.

::: tip
While developing, press **C** to restart with cleared save data.
:::
