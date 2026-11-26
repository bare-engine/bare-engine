# Globals

Besides [`bare`](./bare), a few helpers are available everywhere without an import.

## Waiting

Waits belong to a scene: use `this.Wait`, `this.WaitFrame` and `this.WaitRealTime` inside a scene, a component or a GameObject. See [Scene waits](../guide/scenes#waiting), [Component waits](../guide/components#waiting) and [GameObject waits](../guide/game-objects#waiting). The global `wait`, `waitFrame`, `waitRealTime` and `cancelWaits` helpers have been removed.

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
