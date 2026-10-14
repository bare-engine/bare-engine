# Scenes

Scenes organize the parts of your game: gameplay, UI, menus. Your game starts from one scene, passed to `StartBare`, and you can [run several scenes](#multiple-scenes) on top of each other.

```ts
import { Scene, StartBare } from 'bare-engine';
import settingsData from '../public/data/settingsData.json';

export class Game extends Scene
{
    constructor()
    {
        super({ settingsData });
    }

    override OnStart()
    {
        this.AddGameObject('player');
    }
}

StartBare(Game);
```

Passing [`settingsData`](./settings-data) gives the scene (and extension) your prefabs and other game data. Other options, like `UI` and `persistent`, are listed under [Scene options](../reference/configuration#scene-options).

## Lifecycle

Override these methods on your scene. All are optional. Mark each one `override`, as in `override OnStart()`, and give your own members names the engine doesn't use; see [Troubleshooting](./troubleshooting#this-member-must-have-an-override-modifier).

| Method | When it runs |
| --- | --- |
| `OnAwake(payload?)` | Once, when the scene is created. Register classes here. |
| `OnStart(payload?)` | After awake, and again on every restart. Add your objects here. |
| `OnFixedUpdate(fixedDeltaTime)` | At a fixed rate (60 per second by default). For physics and logic that must run at a steady rate. Something moved here can stutter under a following camera; see [Smooth movement](../reference/camera#smooth-movement). |
| `OnPreUpdate(deltaTime)` | Every frame, after the fixed updates and mouse input, before objects and components update. Set values here that components read in their `OnUpdate`. |
| `OnUpdate(deltaTime)` | Every frame, after objects and components. |
| `OnPreRender()` / `OnRender()` / `OnPostRender()` | Around rendering, for custom drawing. |
| `OnPreLoadLevel(level)` / `OnPostLoadLevel(level)` | Before and after a [level](./levels-and-layers) loads. |
| `OnResize(prevW, prevH, newW, newH)` | When the canvas size changes. |
| `OnRestart()` / `OnClear()` | On restart and when the scene is cleared. |

::: tip
`AddGameObject` only works once the scene has awoken, so call it from `OnAwake` or `OnStart`, not the constructor.
:::

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [`game.ts`](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L25-L83) registers its classes and adds a UI scene in `OnAwake`, loads the level in `OnStart`, and sets up the camera and events in `OnPostLoadLevel`.

## Managers

In Unity you'd often make an empty GameObject with a single manager script on it. In Bare, a manager is just a class that your scene holds. Mark it with `@InspectorClass` and its inspector fields and buttons show up in the [Chrome extension](https://chromewebstore.google.com/detail/bare-engine/dbohigkcdpdnchgaffmofeoffnpkmphb) ([Firefox](https://addons.mozilla.org/en-GB/firefox/addon/bare-engine/)), grouped under the scene:

```ts
import { InspectorButton, InspectorClass, InspectorField, Scene } from 'bare-engine';

class WaveManager
{
    @InspectorField
    wave: number = 1;

    @InspectorButton
    NextWave()
    {
        this.wave++;
    }
}

export class Game extends Scene
{
    @InspectorClass
    waves = new WaveManager();
}
```

Hold as many managers as you need. There's no object to place in a level, nothing that can be removed by accident, and you reach it with `this.waves` from the scene. A manager doesn't get `OnUpdate` calls by itself; call it from the scene where needed.

**Example:** the [Shmup](https://github.com/bare-engine/bare-shmup)'s scene [holds a `Watcher`](https://github.com/bare-engine/bare-shmup/blob/main/src/game.ts#L17-L18) whose [getters](https://github.com/bare-engine/bare-shmup/blob/main/src/game.ts#L126-L136) show live enemy and bullet counts.

## Controllers are added on demand

Each scene holds controllers: objects, tweens, mouse, camera, and so on. By default only the object controller is active. As soon as your code references another one, for example `bare.tween`, the build includes it and every scene runs it. Controllers you never use don't end up in your game at all. See [The bare Object](../reference/bare).

## Multiple scenes

Use `bare.scene` to manage scenes:

```ts
const ui = await bare.scene.Add(UIScene);   // run on top of the current scenes
await bare.scene.Goto(MenuScene);           // replace nonpersistent scenes
bare.scene.Remove(ui);
bare.scene.MoveToFront(ui);
const game = bare.scene.Get(Game);
```

You can also pass a payload, which arrives in the new scene's `OnAwake` and `OnStart`:

```ts
await bare.scene.Goto(LevelScene, { levelName: 'level2' });
```

`bare.uiScene` is a built-in, always-on-top scene that is created the first time you use it:

```ts
bare.uiScene.AddGameObject(joystick);
```

See [Scene Manager](../reference/scene-manager) for all methods.

For startup order, restart differences, and ownership of subscriptions and textures, see [Lifecycle & Cleanup](./lifecycle).

**Examples:** the [Platformer](https://github.com/bare-engine/bare-platformer) [adds its UI scene](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L36) on top of the game, the [RPG](https://github.com/bare-engine/bare-rpg) [goes to a game over scene](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L58-L61) when the player dies, and the RPG [puts its joystick on `bare.uiScene`](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L40-L44).

## Waiting

All waits belong to a scene. In a scene use `this.Wait`; in a component use `this.scene.Wait`.

| Method | Behavior |
| --- | --- |
| `Wait(seconds, persistent = false)` | Counts this scene's game time. Stops while the scene is paused or disabled, while the game is paused or unfocused, and at `bare.timeScale = 0`. Follows `timeScale` otherwise. |
| `WaitFrame(frames = 1, persistent = false)` | Counts this scene's fixed updates. Continuations run after the fixed step's physics and hooks. Frames are rounded up, with a minimum of one. |
| `WaitRealTime(seconds, persistent = false)` | Counts real time, including while the scene/game is paused, disabled, unfocused or starting. |
| `CancelWaits(includingPersistent = false)` | Cancels this scene's waits, optionally including persistent ones. |

The three wait methods return `Promise<boolean>`: `true` when completed, `false` when cancelled. Cancellation resumes the awaiting function and runs `finally` blocks. Check the result before continuing gameplay work:

```ts
if (!await this.scene.Wait(0.3))
    return;

this.OpenGate();
```

Here the component defines `OpenGate`. Wait durations must be finite and nonnegative; invalid values throw `RangeError`.

Loading a level or partially restarting a scene cancels its nonpersistent waits. Waits marked persistent survive those operations. Removing a scene, or calling `Clear(true)`, cancels all its waits, including persistent real-time timers. Other scenes' waits are unaffected.

`Wait` and `WaitFrame` only advance once the scene starts updating. Do not await them inside that scene's constructor, `OnAwake` or `OnStart`: startup would wait for updates that cannot begin yet. Use `WaitRealTime` during startup. No scene exists during `StartBare`'s `OnInit`; asynchronous initialization there can await its own resources or a browser timer.

The global `wait`, `waitFrame`, `waitRealTime` and `cancelWaits` helpers have been removed. Replace them with the corresponding scene methods, and check cancellation results.

## Useful scene methods

| Method | Description |
| --- | --- |
| `AddGameObject(input, parent?)` | Add a [GameObject](./game-objects). |
| `RemoveGameObject(obj)` | Remove a GameObject. |
| `LoadLevel(name)` | Load a level into this scene. |
| `AddLayer(name)` | Add a layer at runtime. |
| `ScreenToWorld(x, y)` / `WorldToScreen(x, y)` | Convert between screen and world positions. |
| `Sleep(seconds)` | Pause the scene for real-time seconds, then restore its previous pause state. Returns `true` on completion or `false` on cancellation. To wait without pausing, use [`Wait`](#waiting). |
| `Restart(full?)` | Restart the scene. |
