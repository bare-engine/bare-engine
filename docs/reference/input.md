# Input

## Keyboard

`bare.keyboard` reads keys. Key names are the browser's key name with a lowercase first letter, for example `'a'`, `'space'`, `'enter'`, `'shift'`, `'arrowUp'`.

```ts
if (bare.keyboard.IsKeyDown('a')) { /* held */ }
if (bare.keyboard.IsKeyPressed('space')) { /* pressed this frame */ }
if (bare.keyboard.IsKeyReleased('space')) { /* released this frame */ }
```

| Method | Description |
| --- | --- |
| `IsKeyDown(key)` | Key is held. |
| `IsKeyPressed(key)` | Key went down this frame. |
| `IsKeyReleased(key)` | Key went up this frame. |
| `IsKeyUp(key)` | Key is not held. |
| `IsAnyKeyDown()` | Any key is held. |
| `GetKeysDown()` / `GetKeysPressed()` | Lists of keys. |
| `ClearAll()` | Reset all key state. |
| `IsCodeDown(code)` / `IsCodePressed(code)` / `IsCodeReleased(code)` | The same, by key position instead of letter: [`event.code`](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values) names like `'KeyW'` or `'Space'`. `'KeyW'` is the key labeled W on QWERTY and Z on AZERTY. |

::: warning Read input in OnUpdate, not OnFixedUpdate
`IsKeyPressed`, `IsKeyReleased`, `bare.mouse.IsPressed` and `bare.mouse.IsReleased` are per frame, and a frame runs zero, one or more fixed steps. In `OnFixedUpdate` they can miss a press or report it twice. Check them in `OnUpdate`, remember the result, and use it in the next `OnFixedUpdate`:

```ts
private jumpQueued = false;

override OnUpdate()
{
    if (bare.keyboard.IsKeyPressed('space'))
        this.jumpQueued = true;
}

override OnFixedUpdate()
{
    if (this.jumpQueued)
    {
        this.jumpQueued = false;
        this.Jump();
    }
}
```

Held state (`IsKeyDown`, `IsKeyUp`) is fine to read in `OnFixedUpdate`.
:::

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer) [jumps on up or space](https://github.com/bare-engine/bare-platformer/blob/main/src/components/playerComponent.ts#L65-L69).

### Directions

Direction helpers check the arrow keys and the WASD key positions. They go by where a key is, not its letter, so on an AZERTY keyboard the same keys are ZQSD, without a setting. Z and Q on a QWERTY keyboard stay free for other actions:

| Held | Pressed this frame | Released this frame |
| --- | --- | --- |
| `IsUpDown()` | `IsUpPressed()` | `IsUpReleased()` |
| `IsDownDown()` | `IsDownPressed()` | `IsDownReleased()` |
| `IsLeftDown()` | `IsLeftPressed()` | `IsLeftReleased()` |
| `IsRightDown()` | `IsRightPressed()` | `IsRightReleased()` |
| `IsAnyDirectionKeyDown()` | `IsAnyDirectionPressed()` | `IsAnyDirectionReleased()` |

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer) [walks left and right](https://github.com/bare-engine/bare-platformer/blob/main/src/components/playerComponent.ts#L40-L62).

## Mouse and touch

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

## Pointer events

Click and hover callbacks on GameObjects. The object's texture is used as its hitbox.

```ts
button.OnPointerDown(() => bare.scene.Goto(Game));
button.OnPointerEnter(() => button.SetScale(1.1));
button.OnPointerLeave(() => button.SetScale(1));
```

| Method | Description |
| --- | --- |
| `OnPointerDown(cb)` / `OnPointerUp(cb)` | Pressed or released on the object. |
| `OnPointerEnter(cb)` / `OnPointerLeave(cb)` | Pointer moved over or off the object. |
| `OffPointers()` | Remove all pointer callbacks from the object. |

**Examples:** the [RPG](https://github.com/bare-engine/bare-rpg)'s level connectors [highlight on hover](https://github.com/bare-engine/bare-rpg/blob/main/src/components/levelConnectorComponent.ts#L26-L45), and the [Showcase](https://github.com/bare-engine/bare-showcase)'s [tweens demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/tweens/src/DemoTweens.ts#L28-L38) uses `AssignButton` with separate press and release handlers.

More on `bare.hitbox`:

| Method | Description |
| --- | --- |
| `AssignButton(obj, onPress)` | Make an object behave like a button. |
| `SetCircleHitbox(obj, radius?)` | Use a circle instead of the texture rectangle. The circle is centered on the object's [pivot](../guide/game-objects#pivot), so call `CenterPivot()` to center it on the image. The radius defaults to half the image's smaller side. |
| `SetShowPointerCursor(obj, show)` | Show the hand cursor on hover. |
| `GetCurrentHover()` / `GetCurrentDown()` | The hitbox under the pointer, or being pressed. |
| `SetExclusiveLayer(...layers)` | Only accept pointer input on these layers. |
