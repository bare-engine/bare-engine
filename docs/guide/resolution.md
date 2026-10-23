# Resolution & Pixel Art

How your game fills the screen is set with the `resolution` option of `StartBare`. These are the common setups.

## Fill the window (default)

Without a `resolution`, the game uses the full window at its real size. `bare.width` and `bare.height` change when the window resizes, so lay things out relative to them.

## Fixed size, scaled to fit

Design for one size and let the engine scale it:

```ts
import { CanvasScale, StartBare } from 'bare-engine';

StartBare(Game, {
    resolution: {
        width: 1280,
        height: 720,
        scale: CanvasScale.Fit,
    },
});
```

`bare.width` is always 1280 and `bare.height` always 720. The canvas is scaled to fit the window, with bars on the sides if the shape doesn't match.

**Example:** the [Resolution Demo](https://github.com/bare-engine/bare-resolution-demo/blob/main/src/game.ts#L66-L76) uses a fixed 320×107 game size.

## Scaled to fit, without bars

`CanvasScale.Expand` scales like `Fit`, but instead of bars, the game gets bigger on the side the window has room to spare, so the canvas fills the window:

```ts
import { CanvasScale, StartBare } from 'bare-engine';

StartBare(Game, {
    resolution: {
        width: 1280,
        height: 720,
        scale: CanvasScale.Expand,
    },
});
```

The whole 1280×720 always shows, as big as with `Fit`. Around it is more room on one side:

| Window | `Fit` | `Expand` |
| --- | --- | --- |
| 1920×1080 | 1280×720 | 1280×720 |
| 2560×1080 | 1280×720, bars left and right | 1707×720 |
| 1024×768 | 1280×720, bars above and below | 1280×960 |

`bare.width` and `bare.height` are at least 1280 and 720, and change when the window resizes. Lay things out relative to them, like a score in the top right corner at `bare.width - 20`.

Leave out `height` to only keep the width: the game is always 1280 wide, and its height follows the window.

### Portrait and landscape

A phone turns, but a game designed for 1280×720 shows tiny on a phone held upright. To switch to a portrait size, call [`bare.SetResolution`](../reference/bare#methods) when the window turns:

```ts
import { CanvasScale, StartBare } from 'bare-engine';

// lying down or standing up, the way the window is
const Resolution = () => innerWidth >= innerHeight
    ? { width: 1280, height: 720, scale: CanvasScale.Expand }
    : { width: 720, height: 1280, scale: CanvasScale.Expand };

StartBare(Game, {
    resolution: Resolution(),
    OnInit: () => window.addEventListener('resize', () => bare.SetResolution(Resolution())),
});
```

Every scene's `OnResize` runs after, once per new size, so move things to fit there. `bare.height > bare.width` tells you it's standing up. Add the listener in `OnInit`, like here: the engine adds its own `resize` listener after that, so it finds the new size already set and doesn't resize to the old resolution first.

## Pixel art

For crisp pixels, turn off smoothing and only scale by whole numbers:

```ts
import { CanvasScale, StartBare, TextureFilterMode } from 'bare-engine';

StartBare(Game, {
    textureFilter: TextureFilterMode.NEAREST,
    roundPixels: true,
    resolution: {
        width: 320,
        height: 180,
        scale: CanvasScale.Fit,
        integerScale: true,
    },
});
```

| Option | Effect |
| --- | --- |
| `textureFilter: NEAREST` | Pixels stay sharp when scaled, instead of blurry. |
| `roundPixels` | Objects are drawn on whole pixels, so they don't shimmer when they move. |
| `integerScale` | Scale by 2×, 3×, … only, so every pixel is the same size. |

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg)'s [`StartBare` options](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L166-L173): a 240×160 pixel art game, scaled to fit and centered.

### Pixel art that fills the window

To fill the whole window without bars, but still have chunky pixels, use `pixelScale`:

```ts
StartBare(Game, {
    textureFilter: TextureFilterMode.NEAREST,
    resolution: { pixelScale: 4 },
});
```

Every game pixel becomes 4×4 screen pixels. The game size follows the window, so `bare.width` changes with it.

**Example:** the [Shmup](https://github.com/bare-engine/bare-shmup)'s [`StartBare` options](https://github.com/bare-engine/bare-shmup/blob/main/src/game.ts#L138-L143) use `pixelScale: 3`.

## Fitting a level

For levels, the [camera](../reference/camera) can fit the level to the screen instead:

```ts
import { CameraScaleMode } from 'bare-engine';

bare.camera.SetScaleMode(CameraScaleMode.Contain);
bare.camera.SetDimensionsToLevel();
```

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L49-L53) does this after loading its level.

The [Resolution Demo](https://github.com/bare-engine/bare-resolution-demo) lets you try the options side by side.
