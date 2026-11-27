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
| `canvasOnlyInput` | `false` | Only take input from the canvas, for games with HTML UI next to it. See [HTML UI next to the canvas](#html-ui-next-to-the-canvas). |
| `gameObjectPoolSize` | `50` | Default size of object pools. |
| `showEditorButton` | automatic | `true`: keep the button visible when a level is loaded, including with the extension connected. `false`: hide it. Omitted: hide it when the extension connects. Development only. |
| `editorButtonPosition` | `{ x: 0, y: 0 }` | Normalized position and pivot, as `{ x: number, y: number }`. `{ x: 1, y: 0 }` anchors it at the top right. Development only; see [Level editor in production](../guide/level-editor#level-editor-in-production). |
| `debugKeys` | **Alt+E**, **Alt+P**, **Alt+R**, **Alt+L**, **Alt+C**, **F2** | Keyboard shortcuts during development. See [Debug keys](#debug-keys). |
| `OnInit` | | Game-wide setup, like save data or sounds. See [OnInit](#oninit). |

### Resolution

See [Resolution & Pixel Art](../guide/resolution) for common setups.

| Field | Description |
| --- | --- |
| `width`, `height` | Fixed game size in game units. With `CanvasScale.Expand`, the smallest game size; leave one out to put no minimum on that side. |
| `scale` | A fixed CSS scale, `CanvasScale.Fit` to fit the window with bars around it, or `CanvasScale.Expand` to fit the window without bars: the game gets bigger on the side the window has room on. See [Scaled to fit, without bars](../guide/resolution#scaled-to-fit-without-bars). |
| `position` | `CanvasPosition.Center` or `CanvasPosition.TopLeft`. Defaults to `Center` with `CanvasScale.Fit`, and `TopLeft` otherwise. `CanvasScale.Expand` fills the window, so it doesn't matter there. |
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

`OnInit` can also pick the first scene, for example from the save it just loaded. Return a scene class to start there instead; return nothing to start on the scene passed to `StartBare`:

```ts
StartBare(Menu, {
    OnInit: () => {
        bare.storage.Load();
        if (SaveData.level > 0)
            return Map;     // a saved game skips the menu
    },
});
```

The scene starts without a payload, so if it needs to know it's the first one, it can check for a missing payload in `OnStart`.

The promise `StartBare` returns resolves only after the first scene's `OnStart`, so code in `.then()` is too late for anything that scene reads. `OnInit` runs again on every `bare.Restart()`, including the debug key **Alt+R** and clearing save data, so keep it safe to repeat.

### Debug keys

The default keys and how to change them are listed under [Debugging](../guide/debugging#debug-keys). They're removed from production builds.

### HTML UI next to the canvas

By default the game takes input from the whole page. That way, touches in the bars around a letterboxed canvas don't scroll or zoom the page. It also means HTML elements on the page don't get their own clicks, scrolling or typing. If the page has HTML UI next to the canvas, like a side panel or a text box, turn on `canvasOnlyInput`:

```ts
StartBare(Game, { canvasOnlyInput: true });
```

With `canvasOnlyInput` on:

- Presses, double clicks, the mouse wheel and the right-click menu are only handled on the canvas. A drag that starts on the canvas keeps sending moves and its release after it leaves the canvas.
- Touches and scrolling outside the canvas behave like on a normal page. On a letterboxed canvas, that includes the bars.
- Keys typed into a text box, dropdown or editable element don't reach the game. Other focused elements, like a button, still pass keys to the game, and keep their own key behavior, like **Space** pressing the button.
- Coming back to the tab doesn't take focus away from the HTML element that had it.
- [`freezeOnUnfocus`](#startbare-options) pauses the game when the tab or window loses focus, not when an HTML element next to the canvas gets focus.

## Scene options

A scene's constructor passes options to `super`:

```ts
import { Scene } from 'bare-engine';
import settingsDataJson from '../public/data/settingsData.json';

export class HUD extends Scene
{
    constructor()
    {
        super({ settingsData: settingsDataJson, UI: true, persistent: true });
    }
}
```

| Option | Default | Description |
| --- | --- | --- |
| `settingsData` | built-in defaults | The scene's [settings](../guide/settings-data): prefabs, layers, animations. |
| `UI` | `false` | Not moved by a camera, drawn in screen space, and kept above non-UI scenes. |
| `resize` | `false` | When the window size changes, move every object so it keeps its relative place on screen. |
| `persistent` | `false` | Keep the scene when `bare.scene.Goto` clears the others. |

Always pass an options object. `super(settingsDataJson)` is a type error; write `super({ settingsData: settingsDataJson })`.

## package.json

Build settings such as `gameId`, `firstLevelLoad` and `stripGeneratedAssets` go under `bareEngine` in your project's `package.json`. See [package.json Options](./package-json) for the full list.
