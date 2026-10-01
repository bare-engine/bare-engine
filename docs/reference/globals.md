# Globals

Besides [`bare`](./bare), a few helpers are available everywhere without an import.

## Waiting

```ts
await wait(0.5);        // wait half a second
await waitFrame();      // wait one game frame
await waitFrame(3);     // wait three game frames
```

| Function | Description |
| --- | --- |
| `wait(seconds, persistent?)` | Resolves after a number of seconds. |
| `waitFrame(frames?, persistent?)` | Resolves after a number of game frames (fixed updates), so movement and collisions have run in between. Default 1. |
| `cancelWaits()` | Cancels every pending wait that isn't persistent. |

When a scene is cleared, for example on a restart, pending waits are cancelled: the code after them never runs. That keeps old timers from firing in a fresh game. Pass `true` as `persistent` for a wait that should survive it.

**Examples:** the [Platformer](https://github.com/bare-engine/bare-platformer) [waits a moment before winning](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L69), and the [RPG](https://github.com/bare-engine/bare-rpg)'s weapon [keeps its hitbox on for 3 frames](https://github.com/bare-engine/bare-rpg/blob/main/src/objects/weapon.ts#L24-L26).

::: tip wait or Sleep?
A scene's `this.Sleep(seconds)` also waits, but **pauses the scene** while it does. Use it for a short freeze, like after the player dies. Use `wait` when the game should keep running.
:::

## Logging and checks

| Function | Description |
| --- | --- |
| `trace(...values)` | Like `console.log`, but only on `localhost`, so it stays quiet in your released game. |
| `assert(condition, message?)` | Throws an error with `message` when `condition` is false. |

## Values

| Global | Description |
| --- | --- |
| `bScene` | The current scene, rewritten to `this` or `this.scene` like the [scene modules](./bare#scene-modules). |
| `rapid` | The renderer. See [below](#the-renderer). |
| `debug` | Whether debug drawing is on. See [Debugging](../guide/debugging). |
| `isLocalhost` | Running on `localhost`, so during development. |
| `isMobile` | Running on a phone or tablet. |
| `hasFocus` | The game's tab has focus. |

## The renderer

Bare renders with Rapid, a fast WebGL renderer, available as the global `rapid`. Its classes are exported from `bare-engine`: `Texture`, `RenderTexture`, `TextTexture`, `ParticleEmitter`, and more. Use them when the engine's own API isn't enough, for example `rapid.setTextureFilter(TextureFilterMode.NEAREST)`.

See the [Rapid.js documentation](https://nightre.github.io/Rapid.js/docs.html#overview) for everything it can do.
