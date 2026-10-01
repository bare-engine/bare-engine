# Scene Manager

`bare.scene` manages the running [scenes](../guide/scenes). Scenes are drawn in order, so later scenes draw on top.

```ts
const ui = await bare.scene.Add(UIScene);
await bare.scene.Goto(Game, { level: 2 });   // the payload goes to OnAwake/OnStart
```

| Method | Behavior |
| --- | --- |
| `Add(sceneOrClass, payload?)` | Accepts a scene instance or class. Awaits its startup. Non-UI scenes are inserted below UI scenes. An existing scene of the same class is replaced. |
| `Goto(sceneClass, payload?)` | Clears **nonpersistent** scenes, then adds the requested class. Persistent scenes survive unless replaced by the same class. |
| `Remove(sceneOrClass)` | Removes that scene, including a persistent scene when explicitly targeted. |
| `Get(sceneClass)` | Finds a running instance. Check before using when its presence is uncertain. |
| `Has(sceneClass)` | Whether an instance is running. |
| `GetAll(includeIgnored = false)` | Returns scenes, excluding internal scenes marked `secret` unless requested. |
| `GetMainScene()` | The first scene in draw order. |
| `GetLevelScene(checkEnabled = true)` | Prefers an enabled level scene, then falls back to any level scene. |
| `MoveUp(sceneOrClass)` / `MoveDown(sceneOrClass)` / `MoveToFront(sceneOrClass)` / `MoveToBack(sceneOrClass)` | Changes draw order. |
| `MoveGameObjectTo(obj, scene)` | Moves a `GameObject` to the destination `Scene`. |
| `DisableAll()` / `EnableAll()` | Disables/enables scenes. Disabled scenes are neither updated nor rendered. |
| `SendEvent(type, ...args)` | Sends the typed event payload to started scenes. |
| `Clear(includePersistent = false)` | Removes nonpersistent scenes; pass `true` to remove persistent scenes too. |
| `Restart()` | Restarts nonpersistent scenes, keeping persistent objects. Runs each scene's `OnRestart`, then `OnStart`; await it to know when all are started. |

To restart a single scene, use `await scene.Restart()`. Both keep persistent objects; `scene.Restart(true)` clears them too. See [Lifecycle & Cleanup](../guide/lifecycle).

**Examples:** the [Platformer](https://github.com/bare-engine/bare-platformer) [adds its UI scene](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L36), and the [RPG](https://github.com/bare-engine/bare-rpg) [goes to its game over scene](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L58-L61).
