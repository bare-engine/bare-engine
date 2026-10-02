# Level Editor

Bare has a level editor built into the game. While the dev server runs, editor saves write to the level's JSON file through it. Check the browser console for save errors and review the resulting file changes in Git.

In a [production build](./building-and-publishing), the editor still works, but saves go to that browser's local storage instead of the project's files. Once a level has been edited there, it's loaded from local storage instead of its JSON file.

Saving from the editor differs from calling `bare.level.Save()` during gameplay; see [saving destinations](../reference/save-data#saving-destinations).

## Opening the editor

When a scene has a level loaded, a **Level Editor** button appears at the top of the screen. If the [Chrome extension](./chrome-extension) is connected, the button is hidden and you open the editor from the extension instead.

You can change this with the `showEditorButton` and `editorButtonPosition` options of [`StartBare`](../reference/configuration).

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer) [always shows the button](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L105).

## Editing

| Action | Controls |
| --- | --- |
| Select an object. | Click |
| Select the deepest child under the pointer, instead of the whole object. | **Alt** + click |
| Add to the selection. Clicking an object that's already selected removes it. | **Shift** / **Ctrl** + click, or **Shift** + drag |
| Deselect. | Click an empty spot |
| Select objects whose bounds are fully inside the rectangle. | Drag on an empty spot |
| Select objects whose bounds overlap the rectangle, even partly. | **Alt** + drag on an empty spot |
| Select on all layers. | **Ctrl** + drag on an empty spot |
| Move, scale, rotate. | Drag the selection or its handles |
| Place it. | Pick a prefab, then click |
| Place off the grid; the grid is hidden while you hold Alt. | **Alt** + click while placing |
| Place multiple, with the grid on. | **Shift** while placing |
| Stamp copies of an object: each click places one, with all its edits. Right-click or double-click it again to stop. | Double-click an object |
| Toggle stamping. | **S** |
| Stop stamping. | Right-click an empty spot, or the **Cancel** button |
| Remove an object, or the whole selection when it's selected. | Right-click it |
| Delete the selection. | **Delete** |
| Copy, cut, paste. | **Ctrl+C**, **Ctrl+X**, **Ctrl+V** |
| Select all. | **Ctrl+A** |

Pick prefabs to place from the extension, and choose the layer you're editing there as well.

## Grid

Turn on the grid and set its size with the ⚙️ settings button in the level editor. The settings are saved to `settingsData.json`.

By default, an object's pivot snaps to the grid lines. For tile-based games, set `"editorObjectSnapToPivot": false` at the top level of `settingsData.json`: objects then fill the grid cell under the pointer instead. The RPG [does this](https://github.com/bare-engine/bare-rpg/blob/main/public/data/settingsData.json#L190).

## Categories

The editor's sidebar groups your prefabs into categories. Set them up with `categories` in `settingsData.json`:

```json
"categories": {
  "characters": {
    "entries": ["player"],
    "expanded": true
  },
  "backgrounds": {
    "entries": ["backgrounds/blueLand"]
  }
}
```

| Property | Description |
| --- | --- |
| `entries` | The prefabs in this category. See below for the forms it can take. |
| `extends` | A prefab every entry extends, unless the entry already has its own `extends`. |
| `expanded` | Open the category when the editor starts. |
| `image` | The image shown for the category. Defaults to the first entry. |
| `showLabels` | Show names under the entries. On by default. |

An entry doesn't have to be a prefab yet: the editor creates a prefab for any name that doesn't exist. `entries` can be:

- **A list of names**, like `["player", "enemy"]`.
- **A path**, like `"backgrounds/blueLand"`. This creates a `blueLand` prefab with `imagePath` `backgrounds`.
- **A numbered name**, like `"tile_1#12"`, for `tile_1` to `tile_12`. If a prefab named `tile_` exists, they all extend it.
- **A folder**, like `"level_[editorImages]"`, for a prefab for every image in `public/images/editorImages`.

Prefabs that aren't in any category are listed under **uncategorized prefabs**, or **prefabs** when you have no categories. Settings on an `uncategorized` category, like `expanded`, apply to that group. All loaded images are listed under **images**.

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [categories](https://github.com/bare-engine/bare-platformer/blob/main/public/data/settingsData.json#L3-L15).

## Components in the editor

By default, your components don't run while you're editing, so enemies don't walk off while you place them. To make a component run in the editor too, use `@Run`:

```ts
import { Component, GameMode, Run } from 'bare-engine';

@Run(GameMode.Edit, GameMode.Play)
export class LabelComponent extends Component
{
    // shows in the editor and in the game
}
```

`@Run(GameMode.Edit)` makes a component that only exists in the editor, for example a helper that draws a range indicator. See [Making your own tools](#making-your-own-tools) for a full example.

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [`LevelConnectorComponent`](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/editorComponents/src/editorComponents/levelConnectorComponent.ts) only exists in the editor. It shows which level each edge of a level leads to, and lets you click through.

## Making your own tools

`bare.editor` returns the editor scene while it's open, and `bare.levelEditorOpen` tells you if it is. `BareEvent.editor_opened` and `BareEvent.editor_closed` fire when it opens and closes.

Together with `@Run(GameMode.Edit)` components, you can build editors for your own data on top of the level editor. An editor component is a normal component: it can draw, react to the pointer, read other objects and `@Save` its results into the level.

### Example: the RPG's map editor

The [RPG](https://github.com/bare-engine/bare-rpg) has a second editor for its world map: which level is next to which. It reuses the level editor, with a different level and different prefabs.

1. **Its own settings and level.** [`mapData.json`](https://github.com/bare-engine/bare-rpg/blob/main/public/data/mapData.json) is a separate `settingsData.json` for the map, and [`levels/map.json`](https://github.com/bare-engine/bare-rpg/blob/main/public/data/levels/map.json) is the map itself.
2. **A prefab for every level.** The map's [category](https://github.com/bare-engine/bare-rpg/blob/main/public/data/mapData.json#L3-L9) uses `"level_[editorImages]"`, so every image in `editorImages` becomes a placeable level. Each one extends a `level` prefab with `"texture": "NAME"`, so it shows its own image.
3. **Opening it.** [`MapHandler`](https://github.com/bare-engine/bare-rpg/blob/main/src/handlers/mapHandler.ts#L21-L90) processes `mapData.json` with its own `SettingsHandler`, and adds a **Map Editor** button and a [debug action](https://github.com/bare-engine/bare-rpg/blob/main/src/handlers/mapHandler.ts#L89) that open the editor with that level and settings:

   ```ts
   await bare.scene.Add(EditorScene, {
       levelPathOrData: "data/levels/map.json",
       settingsHandler: this.mapSettingsHandler,
   });
   ```

4. **An editor component.** Every level on the map has a [`LevelConnectorComponent`](https://github.com/bare-engine/bare-rpg/blob/main/src/components/levelConnectorComponent.ts) with `@Run(GameMode.Edit)`. When you drag levels next to each other, it finds its neighbours, draws a line to them, and saves them in `@Save` fields `top`, `right`, `bottom` and `left`. Hovering a level shows its name, and clicking it opens that level in the editor.
5. **Using the result.** The game [reads the saved map](https://github.com/bare-engine/bare-rpg/blob/main/src/handlers/mapHandler.ts#L93-L113) to know where each exit leads, and [updates it](https://github.com/bare-engine/bare-rpg/blob/main/src/handlers/mapHandler.ts#L35-L42) on `BareEvent.level_savedToDisk` when you save the map.
6. **Previews.** Whenever a level is saved, the RPG's [`SnapshotHandler`](https://github.com/bare-engine/bare-rpg/blob/main/src/handlers/snapshotHandler.ts) renders it to an image in `editorImages`, so the map always shows what the levels look like.

## Level editor for players

::: info Coming soon
Letting players use the level editor in your released game, for example to build and share their own levels, will be possible in a future version.
:::
