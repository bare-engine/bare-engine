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
| `debugKeys` | see below | Keyboard shortcuts during development. |

### Resolution

| Field | Description |
| --- | --- |
| `width`, `height` | Fixed game size in game units. |
| `scale` | A fixed CSS scale, or `CanvasScale.Fit` to fit the window. |
| `position` | `CanvasPosition.Center` or `CanvasPosition.TopLeft`. |
| `integerScale` | Only scale by whole numbers, for crisp pixel art. |
| `pixelScale` | Fill the window, but render at a lower resolution so everything appears `pixelScale` times bigger. Overrides `width`, `height` and `scale`. |

### Debug keys

During development these shortcuts are on by default:

| Key | Action |
| --- | --- |
| **E** | Toggle debug mode (`window.debug`). |
| **P** | Pause. |
| **R** | Restart the game. |
| **L** | Restart the level. |
| **C** | Restart with cleared save data. |

They're removed from production builds.

## package.json

Build settings such as `gameId`, `firstLevelLoad` and `stripGeneratedAssets` go under `bareEngine` in your project's `package.json`. See [package.json Options](./package-json) for the full list.
