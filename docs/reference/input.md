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

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer) [jumps on up or space](https://github.com/bare-engine/bare-platformer/blob/main/src/components/playerComponent.ts#L65-L69).

### Directions

Direction helpers check the arrow keys, WASD, and ZQSD for AZERTY keyboards:

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
if (bare.mouse.IsDown()) { /* held */ }
```

| Member | Description |
| --- | --- |
| `world.position` / `screen.position` | Current pointer position. |
| `world.positionOnDown` | Where the pointer went down. |
| `IsDown()` / `IsRightDown()` / `IsMiddleDown()` | Button is held. |
| `IsPressed()` | Left button went down this frame. |
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
