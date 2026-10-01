# The bare Object

`bare` is the global entry point to the engine. It's available everywhere in your code without an import, and it gives you three kinds of things: **global modules**, **scene modules** and **general properties**.

## Global modules

Shared across the whole game.

| Module | Description |
| --- | --- |
| `bare.keyboard` | Keyboard input. See [Input](./input). |
| `bare.sound` | Sound effects and music. See [Sound](./sound). |
| `bare.scene` | Add, remove, order and find scenes. See [Scene Manager](./scene-manager). |
| `bare.asset` | Loads and holds textures, atlases and animations. |
| `bare.storage` | Persistent save data. See [Save Data](./save-data). |
| `bare.pool` | Object pools by class name, to recycle GameObjects. |
| `bare.uiScene` | A built-in, always-on-top UI scene, created on first use. |
| `bare.globalEvents` | A game-wide event bus. |
| `bare.editor` | The level editor scene, if it's open. |

## Scene modules

These belong to a scene. When you write `bare.tween`, `bare.object` and so on, the build rewrites it to `this.scene.tween`, so you always get the module of the scene your code runs in.

| Module | Description |
| --- | --- |
| `bare.object` | Find and order GameObjects. See [Objects](./objects). |
| `bare.component` | Find, enable and disable [components](../guide/components). |
| `bare.events` | The scene's event bus. See [Events](../guide/events). |
| `bare.mouse` | Mouse and touch input. See [Input](./input). |
| `bare.hitbox` | Pointer hit detection on GameObjects. See [Input](./input#pointer-events). |
| `bare.tween` | Tweens and timers. See [Tweens](./tweens). |
| `bare.particle` | Particle emitters. See [Particles](../guide/particles). |
| `bare.camera` | The scene camera. See [Camera](./camera). |
| `bare.level` | Load and save levels. See [Level](./level). |
| `bare.arcade` | Simple physics, imported from `bare-engine/arcade`. See [Physics](./physics). |
| `bare.sopiro` | Realistic physics (experimental), imported from `bare-engine/sopiro`. See [Physics](./physics). |

A scene module only exists once your code uses it. If you never reference `bare.tween`, the tween code isn't in your build.

::: warning Which scene?
`bare.level.Load('level1')` becomes `this.scene.level.Load('level1')`. So the call needs to be inside a scene, or inside a class with a `scene` property (GameObjects and components have one). If Bare can't work out the scene, you get a warning.

To reach another scene's module, get the scene first:

```ts
bare.scene.Get(Game).level.Load('level1');
```
:::

## General properties

| Property | Description |
| --- | --- |
| `bare.deltaTime` | Seconds since the last frame, capped by `maxDeltaTime`. |
| `bare.count` | Frames rendered so far. |
| `bare.width` / `bare.height` | The game's render size in game units. |
| `bare.paused` | Whether the game is paused. `bare.TogglePause()` toggles it. |
| `bare.gameSpeed` | Time multiplier. |
| `bare.fixedTimestep` | Seconds per fixed update (default `1/60`). |

## Methods

| Method | Description |
| --- | --- |
| `bare.Restart(options?)` | Clear all scenes and restart, optionally with `{ sceneClass, bareOptions, clearSaveData }`. |
| `bare.SendEvent(type, ...args)` | Send an event to `bare.globalEvents` and to every active scene's `bare.events`. |
| `bare.AddClass(SomeClass)` | Register a class. A controller (like `ArcadePhysicsController`) is switched on for all scenes; a GameObject class gets an object pool so it can be created by name. |
| `bare.RegisterGameObjectPool(cls, size?)` | Create an object pool for a GameObject class yourself. |
| `bare.SetBackgroundColor(color)` | Set the canvas background color. |
| `bare.LoadFont(name, url?)` | Load a font from `public/fonts/`. |
| `bare.SetCursor(css)` | Set the mouse cursor. |
| `bare.drawRect`, `bare.drawCircle`, `bare.drawLine`, … | Immediate drawing, for use in `OnRender`. |
