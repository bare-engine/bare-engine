# Camera

A camera that can move, zoom, fit and shake.

```ts
bare.camera.SetPosition(player.x, player.y);
bare.camera.SetZoom(2);
bare.camera.StartShake(8, 0.3);
```

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [camera demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/camera/src/DemoCamera.ts) follows the mouse, shakes, tweens the zoom and switches scale modes.

## Following a player

`SetPosition` jumps straight to a point. `Follow` moves the camera toward an object every frame:

```ts
override OnPostLoadLevel()
{
    bare.camera.SetPosition(player.x, player.y);   // start on the player
    bare.camera.Follow(player, 5);                 // higher than 5 follows tighter
}
```

Leave out the speed to stay locked on. The speed is per second, so the follow feels the same at any frame rate. Loading a level sets the camera's bounds to the level, so it stops at the level's edges. `StopFollow()` lets go again.

For a follow with your own rules, like staying ahead of a runner, move part of the way in `OnUpdate`:

```ts
const camera = bare.camera.GetPosition();
const t = 1 - Math.exp(-5 * deltaTime);
bare.camera.SetPosition(bare.util.Lerp(camera.x, player.x + 200, t), camera.y);
```

### Smooth movement

The camera moves every frame, but an object moved in `OnFixedUpdate`, or by [physics](./physics), only moves on frames that run a fixed step. On a screen faster than 60 Hz some frames run none, so the object stands still while the camera glides on, and it stutters.

For an object the camera follows, move it in `OnUpdate`, multiplied by `deltaTime`:

```ts
override OnUpdate(deltaTime: number)
{
    this.go.x += this.speed * deltaTime;
}
```

If it has to stay in `OnFixedUpdate`, draw it between its last two fixed positions with [`bare.fixedAlpha`](./bare#general-properties).

## Fitting the level

To show a whole level on any screen size:

```ts
import { CameraScaleMode } from 'bare-engine';

override OnPostLoadLevel()
{
    bare.camera.SetScaleMode(CameraScaleMode.Contain);
    bare.camera.SetDimensionsToLevel();
}
```

| Scale mode | Description |
| --- | --- |
| `CameraScaleMode.None` | No automatic scaling. |
| `CameraScaleMode.Contain` | Fit all content on screen, with space around it if needed. |
| `CameraScaleMode.Cover` | Fill the screen with content. Some content may be cut off, but you never see past its edges. The default. |

Since `Cover` is the default and loading a level sets the bounds to the level's size, a level that's smaller than the screen in either direction is zoomed in until it fills the screen, even with `SetZoom(1)`. `GetZoom()` then returns the raised zoom, not `1`. Use `CameraScaleMode.None` to turn this off.

**Examples:** the [Platformer](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L49-L53), and the [Showcase](https://github.com/bare-engine/bare-showcase)'s [camera demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/camera/src/DemoCamera.ts#L33-L48), which switches between `Cover` and `Contain`.

## Methods

| Method | Description |
| --- | --- |
| `SetPosition(x, y)` | Center the camera on a point, kept inside the bounds if there are any. |
| `AddPosition(dx, dy)` / `GetPosition()` | Move or read the position. `GetPosition` returns the center within the bounds, without shake, and reflects `SetPosition` right away. |
| `Follow(target, speed?)` / `StopFollow()` | Move toward an object (anything with `x` and `y`) every frame. Without a speed it stays locked on. |
| `SetZoom(zoom)` / `GetZoom()` | Zoom level, on top of the scale mode's fit. With bounds and `Cover` or `Contain`, it's kept at or above the zoom that shows the whole bounds, so `SetZoom(GetZoom() + step)` always shows a change. |
| `GetZoomToFit(width, height)` | The zoom that shows an area of that size, like `GetZoomToFit(level.width, level.height)` for the whole level. |
| `GetScale()` | World units to screen pixels: the zoom combined with the fit, as drawn. Divide by it for sizes that should look the same at any zoom. |
| `SetDimensions(width, height)` | The area the camera shows. |
| `SetScaleMode(mode)` | How that area is fitted to the screen. |
| `SetBounds(rect)` | Keep the camera inside a rectangle. A camera has no bounds until you set them, but loading a level sets them to the level's size. |
| `DisableBounds()` | Remove the bounds. |
| `SetDimensionsToLevel()` | Set the dimensions to the loaded level's size. |
| `ScreenToWorld(x, y)` / `WorldToScreen(x, y)` | Convert positions. |
| `StartShake(amount?, seconds?, decay?)` | Shake the camera by `amount` screen pixels. Pass `{ x, y }` for separate amounts, like `StartShake({ x: 0, y: 4 })`. |
| `StopShake()` | Stop shaking. |

Setters return the camera, so you can chain them:

```ts
bare.camera
    .SetZoom(2)
    .Follow(player, 8);
```