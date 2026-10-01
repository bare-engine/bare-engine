# Camera

A camera that can move, zoom, fit and shake.

```ts
bare.camera.SetPosition(player.x, player.y);
bare.camera.SetZoom(2);
bare.camera.StartShake(8, 0.3);
```

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [camera demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/camera/src/DemoCamera.ts) follows the mouse, shakes, tweens the zoom and switches scale modes.

## Following a player

`SetPosition` jumps straight to a point. For a smooth follow, move part of the way every frame:

```ts
OnUpdate(deltaTime: number)
{
    const camera = bare.camera.GetPosition();
    const t = 1 - Math.exp(-5 * deltaTime);   // higher than 5 follows tighter

    bare.camera.SetPosition(
        bare.util.Lerp(camera.x, player.x, t),
        bare.util.Lerp(camera.y, player.y, t),
    );
}
```

Using `deltaTime` in `t` keeps the follow speed the same at any frame rate. Combine it with `SetBoundsToLevel()` so the camera stops at the level's edges.

## Fitting the level

To show a whole level on any screen size:

```ts
import { CameraScaleMode } from 'bare-engine';

OnPostLoadLevel()
{
    bare.camera.SetScaleMode(CameraScaleMode.Contain);
    bare.camera.SetDimensionsToLevel();
}
```

| Scale mode | Description |
| --- | --- |
| `CameraScaleMode.None` | No automatic scaling. |
| `CameraScaleMode.Contain` | Fit all content on screen, with space around it if needed. |
| `CameraScaleMode.Cover` | Fill the screen with content. Some content may be cut off, but you never see past its edges. |

**Examples:** the [Platformer](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L49-L53), and the [Showcase](https://github.com/bare-engine/bare-showcase)'s [camera demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/camera/src/DemoCamera.ts#L33-L48), which switches between `Cover` and `Contain`.

## Methods

| Method | Description |
| --- | --- |
| `SetPosition(x, y)` | Center the camera on a point. |
| `SetPositionTopLeft(x, y)` | Place the camera by its top-left corner. |
| `AddPosition(dx, dy)` / `GetPosition()` | Move or read the position. |
| `SetZoom(zoom)` / `GetZoom()` | Zoom level. |
| `SetDimensions(width, height)` | The area the camera shows. |
| `SetScaleMode(mode)` | How that area is fitted to the screen. |
| `SetBounds(rect)` | Keep the camera inside a rectangle. |
| `SetBoundsToLevel()` / `SetBoundsToScreen()` / `DisableBounds()` | Common bounds. |
| `SetDimensionsToLevel()` / `SetBoundsAndDimensionsToLevel()` | Match the loaded level. |
| `ScreenToWorld(x, y)` / `WorldToScreen(x, y)` | Convert positions. |
| `StartShake(amount?, seconds?, decay?)` | Shake the camera. |
| `StartShakeXY(x, y, seconds?, decay?)` | Shake with separate x and y amounts. |
| `StopShake()` | Stop shaking. |