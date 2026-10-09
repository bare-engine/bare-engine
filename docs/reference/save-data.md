# Save Data

`SaveData` holds values that should survive between sessions, and `bare.storage` writes them to the browser's `localStorage`.

```ts
import { SaveData } from 'bare-engine';

bare.storage.Load();                 // read saved values, usually at startup

SaveData.soundEnabled = false;
bare.storage.Save();                 // write all values
```

Loading is not automatic, so call `bare.storage.Load()` once when your game starts. Do it in [`OnInit`](./configuration#oninit), which runs before your first scene, so every scene can read `SaveData`:

```ts
StartBare(Game, {
    OnInit: () => bare.storage.Load(),
});
```

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg) [loads its save](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L71) at startup and [saves after every level](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L104).

## Adding your own fields

Describe your fields once, so TypeScript knows them, and register their default values with `SetDefaults`:

```ts
import { SaveData, Scene, StartBare } from 'bare-engine';

declare module 'bare-engine'
{
    namespace SaveData
    {
        let highScore: number;
        let unlockedLevels: Set<string>;
    }
}

export class Game extends Scene
{
}

StartBare(Game, {
    OnInit: () => {
        bare.storage.SetDefaults({
            highScore: 0,
            unlockedLevels: new Set<string>(),
        });
        bare.storage.Load();
    },
});
```

Then read and change the fields anywhere, and save:

```ts
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

When a level is saved, each object is stored as an entity, leaving out values it would get anyway, such as defaults and prefab values.

Which fields of objects and components are saved, in the editor and while playing, is set by `@SerializeField`; see [Saving and showing fields](./inspector-decorators#saving-and-showing-fields). While playing, built-in properties like `color` are only saved when listed in [`saveVars`](#savevars).

Layers with `save: false`, persistent objects, and objects with `save: false` are omitted.

Objects that come from data are always saved: top-level objects, and children from a prefab, level or save. Mark a child `"save": false` in its prefab or entity to leave it out; it then comes back as the prefab defines it. A child added in code is only saved when you set `child.save = true`; once saved, it's data, so it stays saved after loading. Other children added while playing are gone when the level loads.

### saveVars

By default, `saveVars` saves `position`, `children` and `components` for every GameObject while playing. Add more per class in `settingsData.json`:

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
