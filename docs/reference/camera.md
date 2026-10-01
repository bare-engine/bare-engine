# Camera

Every scene has a camera, `bare.camera`.

```ts
bare.camera.SetPosition(player.x, player.y);
bare.camera.SetZoom(2);
bare.camera.StartShake(8, 0.3);
```

## Fitting the level

To show a whole level on any screen size:

```ts
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
