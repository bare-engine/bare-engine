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

The [ResolutionDemo](https://github.com/bare-engine/bare-resolution-demo) lets you try the options side by side.
