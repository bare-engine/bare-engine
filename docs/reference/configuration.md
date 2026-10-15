# Configuration

## StartBare options

`StartBare(sceneClass, options?)` starts the engine, and resolves with the first scene once it has started. Options go in the second argument:

```ts
import { Color, StartBare } from 'bare-engine';

StartBare(Game, {
    backgroundColor: new Color(30, 30, 40, 255),
    resolution: { width: 1280, height: 720 },
});
```

| Option | Default | Description |
| --- | --- | --- |
| `backgroundColor` | renderer startup color | Canvas background color, as a `Color` or hex string. Set it explicitly for a predictable appearance. It doesn't color the page around the canvas; use [`bare.SetBackgroundColorHTML`](./bare#methods) for that. |
| `resolution` | full window | Render size, see below. |
| `antiAlias` | `true` | Smooth edges. |
| `textureFilter` | `LINEAR` | Use `NEAREST` for pixel art. |
| `roundPixels` | `false` | Snap rendering to whole pixels. |
| `premultipliedAlpha` | `true` | WebGL context alpha representation, passed to the renderer on startup. |
| `scaleMode` | `CanvasScaleMode.CanvasItem` | How a scaled canvas is rendered. `CanvasItem` renders at the final screen resolution, so lines and rotated sprites look smoother. `Viewport` renders at the game size and lets the browser stretch the result. |
| `fixedTimestep` | `1/60` | Seconds per fixed update. |
| `freezeOnUnfocus` | `true` | Pause when the tab loses focus. |
| `multiTouch` | `false` | Accept more than one touch at once. |
| `gameObjectPoolSize` | `50` | Default size of object pools. |
| `showEditorButton` | automatic | `true`: keep the button visible when a level is loaded, including with the extension connected. `false`: hide it. Omitted: hide it when the extension connects. Development only. |
| `editorButtonPosition` | `{ x: 0, y: 0 }` | Normalized position and pivot, as `{ x: number, y: number }`. `{ x: 1, y: 0 }` anchors it at the top right. Development only; see [Level editor in production](../guide/level-editor#level-editor-in-production). |
| `debugKeys` | **Alt+E**, **Alt+P**, **Alt+R**, **Alt+L**, **Alt+C**, **F2** | Keyboard shortcuts during development. See [Debug keys](#debug-keys). |
| `OnInit` | | Game-wide setup, like save data or sounds. See [OnInit](#oninit). |

### Resolution

See [Resolution & Pixel Art](../guide/resolution) for common setups.

| Field | Description |
| --- | --- |
| `width`, `height` | Fixed game size in game units. |
| `scale` | A fixed CSS scale, or `CanvasScale.Fit` to fit the window. |
| `position` | `CanvasPosition.Center` or `CanvasPosition.TopLeft`. Defaults to `Center` with `CanvasScale.Fit`, and `TopLeft` otherwise. |
| `integerScale` | Only scale by whole numbers, for crisp pixel art. |
| `pixelScale` | Fill the window, but render at a lower resolution so everything appears `pixelScale` times bigger. Overrides `width`, `height` and `scale`. |

### OnInit

Runs once `bare` exists, before the first scene is created, so it's the place for setup the whole game needs. If it returns a promise, Bare waits for it:

```ts
StartBare(Menu, {
    OnInit: async () => {
        bare.storage.SetDefaults({ highScore: 0 });
        bare.storage.Load();
        await bare.LoadFont('pixel');
    },
});
```

The promise `StartBare` returns resolves only after the first scene's `OnStart`, so code in `.then()` is too late for anything that scene reads. `OnInit` runs again on every `bare.Restart()`, including the debug key **Alt+R** and clearing save data, so keep it safe to repeat.

### Debug keys

The default keys and how to change them are listed under [Debugging](../guide/debugging#debug-keys). They're removed from production builds.

## Scene options

A scene's constructor passes options to `super`:

```ts
import { Scene } from 'bare-engine';
import settingsData from '../public/data/settingsData.json';

export class HUD extends Scene
{
    constructor()
    {
        super({ settingsData, UI: true, persistent: true });
    }
}
```

| Option | Default | Description |
| --- | --- | --- |
| `settingsData` | built-in defaults | The scene's [settings](../guide/settings-data): prefabs, layers, animations. |
| `UI` | `false` | Not moved by a camera, drawn in screen space, and kept above non-UI scenes. |
| `resize` | `false` | When the window size changes, move every object so it keeps its relative place on screen. |
| `persistent` | `false` | Keep the scene when `bare.scene.Goto` clears the others. |

Always pass an options object. `super(settingsData)` is a type error; write `super({ settingsData })`.

## package.json

Build settings such as `gameId`, `firstLevelLoad` and `stripGeneratedAssets` go under `bareEngine` in your project's `package.json`. See [package.json Options](./package-json) for the full list.
