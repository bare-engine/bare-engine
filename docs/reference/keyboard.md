# Keyboard

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

## Directions

Direction helpers check the arrow keys and the WASD key positions. They go by where a key is, not its letter, so on an AZERTY keyboard the same keys are ZQSD, without a setting. Z and Q on a QWERTY keyboard stay free for other actions:

| Held | Pressed this frame | Released this frame |
| --- | --- | --- |
| `IsUpDown()` | `IsUpPressed()` | `IsUpReleased()` |
| `IsDownDown()` | `IsDownPressed()` | `IsDownReleased()` |
| `IsLeftDown()` | `IsLeftPressed()` | `IsLeftReleased()` |
| `IsRightDown()` | `IsRightPressed()` | `IsRightReleased()` |
| `IsAnyDirectionKeyDown()` | `IsAnyDirectionPressed()` | `IsAnyDirectionReleased()` |

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer) [walks left and right](https://github.com/bare-engine/bare-platformer/blob/main/src/components/playerComponent.ts#L40-L62).
