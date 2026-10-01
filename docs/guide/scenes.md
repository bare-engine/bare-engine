# Scenes

Scenes organize the parts of your game: gameplay, UI, menus. Your game starts from one scene, passed to `StartBare`, and you can run several scenes on top of each other.

```ts
import { Scene, StartBare } from 'bare-engine';
import settingsData from '../public/data/settingsData.json';

export class Game extends Scene
{
    constructor()
    {
        super(settingsData);
    }

    OnStart()
    {
        this.AddGameObject('player');
    }
}

StartBare(Game);
```

## Lifecycle

Override these methods on your scene. All are optional.

| Method | When it runs |
| --- | --- |
| `OnAwake(payload?)` | Once, when the scene is created. Register classes here. |
| `OnStart(payload?)` | After awake, and again on every restart. Add your objects here. |
| `OnFixedUpdate(fixedDeltaTime)` | At a fixed rate (60 per second by default). Good for gameplay logic. |
| `OnUpdate(deltaTime)` | Every frame. |
| `OnPreRender()` / `OnRender()` / `OnPostRender()` | Around rendering, for custom drawing. |
| `OnPreLoadLevel(level)` / `OnPostLoadLevel(level)` | Before and after a [level](./levels-and-layers) loads. |
| `OnResize(prevW, prevH, newW, newH)` | When the canvas size changes. |
| `OnRestart()` / `OnClear()` | On restart and when the scene is cleared. |

::: tip
`AddGameObject` only works once the scene has awoken, so call it from `OnAwake` or `OnStart`, not the constructor.
:::

## Controllers are added on demand

Each scene holds controllers: objects, tweens, mouse, camera, and so on. By default only the object controller is active. As soon as your code references another one, for example `bare.tween`, the build includes it and every scene runs it. Controllers you never use don't end up in your game at all. See [The bare Object](../reference/bare).

## Multiple scenes

Use `bare.scene` to manage scenes:

```ts
const ui = await bare.scene.Add(UIScene);   // run on top of the current scenes
await bare.scene.Goto(MenuScene);           // replace the current scenes
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

## Useful scene methods

| Method | Description |
| --- | --- |
| `AddGameObject(input, parent?)` | Add a [GameObject](./game-objects). |
| `RemoveGameObject(obj)` | Remove a GameObject. |
| `LoadLevel(name)` | Load a level into this scene. |
| `AddLayer(name)` | Add a layer at runtime. |
| `ScreenToWorld(x, y)` / `WorldToScreen(x, y)` | Convert between screen and world positions. |
| `Sleep(seconds)` | `await this.Sleep(1)` to wait. |
| `Restart(full?)` | Restart the scene. |
