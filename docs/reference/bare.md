# The bare Object

`bare` is the global entry point to the engine. It's available everywhere in your code without an import, and it gives you three kinds of things: **global modules**, **scene modules** and **general properties**.

## Global modules

Shared across the whole game.

| Module | Description |
| --- | --- |
| `bare.scene` | Add, remove, order and find scenes. See [Scene Manager](./scene-manager). |
| `bare.keyboard` | Keyboard input. See [Keyboard](./keyboard). |
| `bare.sound` | Sound effects and music. See [Sound](./sound). |
| `bare.asset` | Loads and holds textures, atlases and animations. See [Assets](./assets). |
| `bare.storage` | Persistent save data. See [Save Data](./save-data). |
| `bare.pool` | Object pools by class name, to recycle GameObjects. |
| `bare.uiScene` | A built-in, always-on-top UI scene, created on first use. |
| `bare.globalEvents` | A game-wide event bus. |
| `bare.editor` | The level editor scene, if it's open. |
| `bare.util` | Math, random and device helpers. See [Math & Utilities](./math#util). |

## Scene modules

These belong to a scene. When you write `bare.tween`, `bare.object` and so on, the build rewrites it to `this.scene.tween`, so you always get the module of the scene your code runs in.

| Module | Description |
| --- | --- |
| `bare.object` | Find and order GameObjects. See [Objects](./objects). |
| `bare.component` | Find, enable and disable [components](../guide/components). |
| `bare.level` | Load and save levels. See [Level](./level). |
| `bare.camera` | The scene camera. See [Camera](./camera). |
| `bare.mouse` | Mouse and touch input. See [Mouse & Touch](./mouse). |
| `bare.tween` | Tweens and timers. See [Tweens](./tweens). |
| `bare.events` | The scene's event bus. See [Events](../guide/events). |
| `bare.hitbox` | Pointer hit detection on GameObjects. See [Hitbox](./hitbox). |
| `bare.particle` | Particle emitters. See [Particles](../guide/particles). |
| `bare.arcade` | Simple physics, imported from `bare-engine/arcade`. See [Physics](./physics). |
| `bare.sopiro` | Realistic physics, imported from `bare-engine/sopiro`. See [Physics](./physics). |

A scene module only exists once your code uses it. If you never reference `bare.tween`, the tween code isn't in your build.

::: warning Which scene?
`bare.level.Load('level1')` becomes `this.scene.level.Load('level1')`. So the call needs to be inside a scene, or inside a class with a `scene` property (GameObjects and components have one). If Bare can't work out the scene, you get a warning.

It also needs `this` to be that object, so it doesn't work in a `static` method or inside a `function () {}` callback; use an arrow function there. The build stops with an error when it finds one. See [Troubleshooting](../guide/troubleshooting#bare-x-is-rewritten-to-this-scene-x-but-here-this-isn-t-the-object).

To reach another scene's module, get the scene first:

```ts
bare.scene.Get(Game).level.Load('level1');
```
:::

`bScene` is the current scene, rewritten the same way. See [Globals](./globals#values).

## General properties

| Property | Description |
| --- | --- |
| `bare.deltaTime` | Seconds since the last frame, capped by `maxDeltaTime`, times `bare.timeScale`. |
| `bare.unscaledDeltaTime` | The same, without `timeScale`. |
| `bare.timeScale` | Game speed, default `1`. `2` runs the game twice as fast, `0.5` at half speed, `0` freezes it while it keeps rendering. See [Game speed](#game-speed). |
| `bare.gameTime` | Milliseconds of game time. Follows `timeScale` and stands still while the game is paused. |
| `bare.count` | Frames rendered so far. |
| `bare.time` | Milliseconds at the start of the current frame, from `performance.now()`. |
| `bare.width` / `bare.height` | The game's render size in game units. |
| `bare.paused` | Whether the game is paused. |
| `bare.hasFocus` | Whether the game has focus. Changes are sent as the `game_focusChange` event. |
| `bare.mobile` | Read-only. Running on a phone or tablet (a touch device). |
| `bare.debug` | Whether debug drawing is on. See [Debugging](../guide/debugging). |
| `bare.gameSpeed` | Read-only. The current frame rate relative to 60 fps: `1` at 60 fps, `0.5` at 30 fps. Updated every frame. |
| `bare.levelEditorOpen` | Whether the [level editor](../guide/level-editor) is open. |
| `bare.defaultFont` | Font family used by text that doesn't set `fontFamily`. See [Fonts](../guide/text-and-ui#fonts). |
| `bare.fixedTimestep` | Seconds per fixed update (default `1/60`). |
| `bare.fixedStepsBehind` | Read-only. True while fixed updates cost more time than they simulate. The game then runs one fixed update per frame and slows down, instead of falling further behind. |
| `bare.fixedAlpha` | Read-only. How far the game is between the last fixed update and the next, from `0` to `1`. To draw something that moves in `OnFixedUpdate` smoothly, draw it between its previous and current position: `prev + (pos - prev) * bare.fixedAlpha`. |

## Methods

| Method | Description |
| --- | --- |
| `bare.Restart(options?)` | Clear all scenes and restart, optionally with `{ sceneClass, bareOptions, clearSaveData }`. |
| `bare.TogglePause()` | Pause or unpause the game. Returns nothing; read `bare.paused`. |
| `bare.TogglePerfOverlay()` | Show or hide the [performance panel](../guide/debugging#performance). Development only. |
| `bare.SendEvent(type, ...args)` | Send an event to `bare.globalEvents` and to every active scene's `bare.events`. |
| `bare.AddClass(SomeClass)` | Register a class: a GameObject class gets an object pool so it can be created by name, and a controller is switched on for all scenes. Classes named in `settingsData.json` or in your code are registered automatically, so you rarely need this. |
| `bare.RegisterGameObjectPool(cls, size?)` | Create an object pool for a GameObject class, or fill its existing pool up to `size` objects. |
| `bare.SetBackgroundColor(color)` | Set the canvas background color, as a `Color` or hex string. |
| `bare.SetBackgroundColorHTML(color)` | Color the page around the canvas, eg the bars of a fitted resolution, as a `Color` or hex string. A transparent color clears it. |
| `bare.SetResolution(resolution?)` | Change the [resolution](./configuration#resolution) while the game runs, for example to swap between a landscape and a portrait size when the screen turns. Without an argument, the game fills the window. Every scene's `OnResize` runs after. |
| `bare.SetDebugKey`, `bare.DisableDebugKey`, … | Change the [debug keys](../guide/debugging#changing-keys-while-the-game-runs) while the game runs. Development only. |
| `bare.DisableRightClick()` | Stop right-click from [selecting objects](../guide/debugging#selecting-objects-in-the-game), for games that use the right mouse button. Development only. |
| `bare.LoadFont(name, url?)` | Load a font from `public/fonts/`. The first font loaded becomes `bare.defaultFont`. |
| `bare.SetCursor(css)` | Set the mouse cursor. |
| `bare.drawRect`, `bare.drawCircle`, `bare.drawLine`, … | Immediate drawing, for use in `OnRender`. |

## Game speed

`bare.timeScale` speeds the whole game up or slows it down, for a fast-forward button or a slow-motion effect:

```ts
bare.timeScale = 2;     // fast forward
bare.timeScale = 0.25;  // slow motion
bare.timeScale = 1;     // normal
```

It scales `deltaTime` in `OnUpdate`, and runs more or fewer fixed updates per second, so `OnFixedUpdate` and physics keep their step size and stay stable. [Tweens](./tweens), particles, camera shake, `FlashShader` and [scene waits](../guide/scenes#waiting) follow it too.

`timeScale = 0` also stops tweens and `Scene.Wait()`, so animate a pause menu with `bare.unscaledDeltaTime` and `Scene.WaitRealTime()`, or pause with `bare.TogglePause()` instead. `bare.Restart()` sets it back to `1`.
