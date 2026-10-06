# package.json Options

Build settings for your game go in a `bareEngine` object in your project's `package.json`. Every option is optional.

```json
{
  "name": "my-game",
  "bareEngine": {
    "gameId": "myGame",
    "name": "My Game",
    "firstLevelLoad": "level1",
    "stripGeneratedAssets": false,
    "index": {
      "backgroundColor": "rgb(20, 20, 30)",
      "textColor": "rgb(255, 255, 255)"
    },
    "texturePackImages": {
      "stripUnused": true,
      "webpQuality": 90
    }
  }
}
```

Restart the dev server after changing these.

**Examples:** the [RPG](https://github.com/bare-engine/bare-rpg)'s [`package.json`](https://github.com/bare-engine/bare-rpg/blob/main/package.json#L30-L45) uses `firstLevelLoad`, `texturePackImages` and `index`. The [Showcase](https://github.com/bare-engine/bare-showcase)'s [`package.json`](https://github.com/bare-engine/bare-showcase/blob/main/package.json#L30-L37) uses `preloadCurrentLevel` and `imageGlobs`.

## Overview

| Option | Default | Description |
| --- | --- | --- |
| [`gameId`](#gameid) | generated | Unique id, used as the save data key. |
| [`name`](#name) | `package.json` name | Page and terminal title. |
| [`index`](#index) | | Loading page title and colors. |
| [`firstLevelLoad`](#firstlevelload) | | Level to fetch while the page loads. |
| [`preloadCurrentLevel`](#preloadcurrentlevel) | `true` | Fetch the player's saved level while the page loads. |
| [`stripGeneratedAssets`](#stripgeneratedassets) | `true` | Empty the asset lists in production. |
| [`stripDecorators`](#stripdecorators) | `true` | Remove inspector decorators in production. |
| [`stripUnusedMethods`](#stripunusedmethods) | on | Remove methods that are never called in production. |
| [`autoRegisterClasses`](#autoregisterclasses) | `true` | Register your components automatically. |
| [`texturePackImages`](#texturepackimages) | | How the texture atlas is built. |
| [`imageGlobs`](#imageglobs) | | Extra image folders for `Asset.Image`. |

## gameId

A unique id for your game. Save data is stored in `localStorage` under this key, so games on the same domain don't overwrite each other's saves.

If it's missing, the dev server generates one and writes it to your `package.json`. Commit that change, because changing the id later means players lose their saves.

```json
"gameId": "myGame"
```

## name

The title of the browser tab and the dev server's terminal window. Falls back to the `name` field of `package.json`, then to "Bare Game".

```json
"name": "My Game"
```

## index

Settings for the generated `index.html`, which shows a loading text while your game starts.

| Field | Default | Description |
| --- | --- | --- |
| `title` | `name` | Browser tab title. Overrides `name`. |
| `backgroundColor` | `"rgb(255, 255, 255)"` | Page background while loading. |
| `textColor` | `"rgb(0, 0, 0)"` | Loading text color. |
| `showLoading` | `true` | Set to `false` to hide the loading text. |

```json
"index": {
  "title": "My Game",
  "backgroundColor": "#000",
  "textColor": "#fff",
  "showLoading": false
}
```

## firstLevelLoad

The name of the level your game loads first, without `.json`. The page starts fetching it right away, in parallel with your code, so the level is ready sooner.

```json
"firstLevelLoad": "level1"
```

## preloadCurrentLevel

When `true` (the default), the page also fetches the level the player was last on, read from their save data. If there is no saved level, `firstLevelLoad` is used. Set to `false` to turn off all level preloading.

```json
"preloadCurrentLevel": false
```

## stripGeneratedAssets

In production builds, the lists in `src/generated/assets.ts` are emptied to save space: `Asset.Images`, `Asset.Sounds`, `Asset.Fonts`, `Asset.Levels`, `Data.Prefabs`, `Data.BasePrefabs`, `Data.Animations` and `Data.Layers`. Single values like `Asset.Image.PLAYER` always work.

Set to `false` if your game loops over one of these lists, for example to preload every sound:

```json
"stripGeneratedAssets": false
```

## stripDecorators

Inspector decorators like `@InspectorField` are only needed by the editor and the Chrome extension, so production builds remove them. `@SerializeField` and `@Run` are kept, since saving and running need them. Set to `false` to keep them all.

```json
"stripDecorators": false
```

## stripUnusedMethods

Production builds remove class methods that are never referenced anywhere, to make the bundle smaller. Set to `false` to turn this off:

```json
"stripUnusedMethods": false
```

A method that's only called by a name built at runtime (`obj[name]()`) looks unused and gets removed. Keep it with `keep`:

```json
"stripUnusedMethods": {
  "keep": ["OnSpecialEvent"]
}
```

Methods whose name appears as a string anywhere in your code are kept automatically.

## autoRegisterClasses

Components exported from files in `src/` are registered with the engine automatically, as are components named in `settingsData.json` and exported GameObject classes marked `@InspectorBaseClass`. Set to `false` to register them yourself with `bare.AddClass(MyComponent)`.

```json
"autoRegisterClasses": false
```

## texturePackImages

Options for packing `texturePackImages/` into a texture atlas.

| Field | Default | Description |
| --- | --- | --- |
| `stripUnused` | `false` | In production, leave out images that nothing refers to. |
| `alwaysInclude` | `[]` | Images to keep when `stripUnused` is on. `*` wildcards work. |
| `webpQuality` | lossless | Atlas quality from 0 to 100. Leave out for lossless. |
| `nameStyle` | `"relative"` | `"relative"` names images by their path (`ui/coin`). `"short"` uses only the file name (`coin`). |
| `flattenNames` | `false` | Same as `"nameStyle": "short"`. |

```json
"texturePackImages": {
  "stripUnused": true,
  "alwaysInclude": ["ui/*", "logo"],
  "webpQuality": 85
}
```

With `stripUnused`, an image counts as used when it's named by any of these:

- a prefab `name`, a `"texture"` field, or an animation's `"frames"` in `settingsData.json`
- an entity's `name`, `extends` or `texture` in a level file, including children
- a string in your code in `src/`, like `this.AddGameObject('logo')`, or `Asset.Image.LOGO`

::: warning
Image names built while the game runs, like `'walk' + i`, can't be found. Add those images to `alwaysInclude`, for example `"walk*"`, or they'll be missing from the production build. Using `alwaysInclude` without `stripUnused` is an error.
:::

## imageGlobs

Extra folders, relative to `public/`, whose images are added to `Asset.Image`. Normal projects keep all images in `public/images/` and don't need this; it exists for projects like the Showcase that keep images in separate folders per demo.

```json
"imageGlobs": ["demos/**/images/**"]
```
