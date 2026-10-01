# Configuration

## StartBare options

Pass options as the second argument to `StartBare`:

```ts
import { Color, StartBare } from 'bare-engine';

StartBare(Game, {
    backgroundColor: new Color(30, 30, 40, 255),
    resolution: { width: 1280, height: 720 },
});
```

| Option | Default | Description |
| --- | --- | --- |
| `backgroundColor` | | Canvas background color. |
| `resolution` | full window | Render size, see below. |
| `antiAlias` | `true` | Smooth edges. |
| `textureFilter` | `LINEAR` | Use `NEAREST` for pixel art. |
| `roundPixels` | | Snap rendering to whole pixels. |
| `fixedTimestep` | `1/60` | Seconds per fixed update. |
| `freezeOnUnfocus` | `true` | Pause when the tab loses focus. |
| `multiTouch` | `false` | Accept more than one touch at once. |
| `gameObjectPoolSize` | `50` | Default size of object pools. |
| `showEditorButton` | | Show the level editor button. |
| `debugKeys` | **E**, **P**, **R**, **L**, **C** | Keyboard shortcuts during development. See [Debug keys](#debug-keys). |

**Examples:** the [RPG](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L166-L173), [Shmup](https://github.com/bare-engine/bare-shmup/blob/main/src/game.ts#L138-L143), [Platformer](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L105) and [Resolution Demo](https://github.com/bare-engine/bare-resolution-demo/blob/main/src/game.ts#L66-L76) all pass different options.

### Resolution

See [Resolution & Pixel Art](../guide/resolution) for common setups.

| Field | Description |
| --- | --- |
| `width`, `height` | Fixed game size in game units. |
| `scale` | A fixed CSS scale, or `CanvasScale.Fit` to fit the window. |
| `position` | `CanvasPosition.Center` or `CanvasPosition.TopLeft`. |
| `integerScale` | Only scale by whole numbers, for crisp pixel art. |
| `pixelScale` | Fill the window, but render at a lower resolution so everything appears `pixelScale` times bigger. Overrides `width`, `height` and `scale`. |

### Debug keys

The default keys and how to change them are listed under [Debugging](../guide/debugging#debug-keys). They're removed from production builds.

## package.json

Build settings such as `gameId`, `firstLevelLoad` and `stripGeneratedAssets` go under `bareEngine` in your project's `package.json`. See [package.json Options](./package-json) for the full list.
