# Mouse & Touch

`bare.mouse` handles both mouse and touch.

```ts
const p = bare.mouse.world.position;   // in world space, follows the camera
const s = bare.mouse.screen.position;  // in screen space

if (bare.mouse.IsPressed()) { /* pressed this frame */ }
if (bare.mouse.IsReleased()) { /* released this frame */ }
if (bare.mouse.IsDown()) { /* held */ }
```

| Member | Description |
| --- | --- |
| `world.position` / `screen.position` | Current pointer position. The world position stays under the pointer when the camera moves. |
| `world.positionOnDown` / `screen.positionOnDown` | Where the pointer went down. For a drag while the camera zooms or moves, like aiming a slingshot, use the screen positions. |
| `IsDown()` / `IsRightDown()` / `IsMiddleDown()` | Button is held. |
| `IsPressed()` | Left button went down this frame. |
| `IsReleased()` | The last pointer went up this frame. |
| `IsMoving()` | The pointer moved this frame. |

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg)'s [touch joystick](https://github.com/bare-engine/bare-rpg/blob/main/src/ui/joystick.ts) follows the pointer.

`IsPressed` and `IsReleased` are per frame, so read them in `OnUpdate`, not `OnFixedUpdate`. See the warning on [Keyboard](./keyboard).
