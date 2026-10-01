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
