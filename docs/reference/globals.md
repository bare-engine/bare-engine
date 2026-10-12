# Globals

Besides [`bare`](./bare), a few helpers are available everywhere without an import.

## Waiting

```ts
await wait(0.5);          // wait half a second of game time
await waitFrame();        // wait one game frame
await waitFrame(3);       // wait three game frames
await waitRealTime(0.5);  // wait half a second, even while the game is paused
```

| Function | Description |
| --- | --- |
| `wait(seconds, persistent?)` | Resolves after a number of seconds of game time: it follows [`bare.timeScale`](./bare#game-speed), and waits while the game is paused or frozen because the tab lost focus. Before the game loop runs, in `OnInit` or the first scene's `OnAwake` and `OnStart`, it counts real time instead. |
| `waitRealTime(seconds, persistent?)` | Resolves after a number of seconds of real time, also while the game is paused or `timeScale` is 0. For a pause menu, for example. |
| `waitFrame(frames?, persistent?)` | Resolves after a number of game frames (fixed updates), so movement and collisions have run in between. Default 1. |
| `cancelWaits()` | Cancels every pending wait that isn't persistent. |

A cancelled wait never resolves, so the code after its `await` doesn't run on a scene that's gone. A `finally` after it doesn't run either. Nothing keeps the cancelled wait or its function in memory.

## Logging and checks

| Function | Description |
| --- | --- |
| `trace(...values)` | Like `console.log`, but only on the dev server, so it stays quiet in your released game. |
| `assert(condition, message?)` | Throws an error with `message` when `condition` is false. |

## Values

| Global | Description |
| --- | --- |
| `bScene` | The current scene, rewritten to `this` or `this.scene` like the [scene modules](./bare#scene-modules). |
| `rapid` | The renderer. See [below](#the-renderer). |
| `isDev` | Running from the Vite dev server (`__DEV__`), not a production build. |

## The renderer

Bare renders with Rapid, a fast WebGL renderer, available as the global `rapid`. Its classes are exported from `bare-engine`: `Texture`, `RenderTexture`, `TextTexture`, `ParticleEmitter`, and more. Use them when the engine's own API isn't enough, for example `rapid.setTextureFilter(TextureFilterMode.NEAREST)`.

See the [Rapid.js documentation](https://nightre.github.io/Rapid.js/docs.html#overview) for everything it can do.
