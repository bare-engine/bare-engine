# Lifecycle & Cleanup

A scene owns its GameObjects and controllers. Your code still owns external resources such as global subscriptions, and render textures it creates.

## Startup order

| Stage | What to do |
| --- | --- |
| Scene constructor | Set scene options and initialize plain fields. Do not call `AddGameObject` yet. |
| Scene `OnAwake(payload)` | Register classes and initialize scene-wide resources. Bare awaits an async override. |
| Scene `OnStart(payload)` | Add objects or await a level load. Bare awaits this before starting the scene's objects and components. Runs again on restart. |
| Object `OnAwake(entity)` | Reset custom fields for this use of the object. See [pooled objects](#pooled-objects). |
| Object/component `OnAdded` | React to attachment. Components receive their GameObject as an argument. |
| Object/component `OnStart` | Initialize behavior for this attachment. A component added to an already started object may start immediately, before `AddComponent` returns. |
| `OnFixedUpdate(dt)` / `OnUpdate(dt)` | Fixed simulation steps / frame updates. Both receive seconds. |
| Object/component `OnRemoved` | Release resources and subscriptions owned by this attachment. |
| Scene `OnClear(includingPersistent)` | Release scene-owned resources after its controllers have been cleared. Also runs during level loads, not just final scene removal. |

Configure component values through a constructor or prefab when they must be available during its startup hooks; setting them after `AddComponent` may be too late.

## Pooled objects

Registered GameObject classes are [pooled](./custom-game-objects#object-pools): `Remove()` returns the object to its pool, and the next `AddGameObject` reuses it without running its constructor again.

- **Reset your own fields in `OnAwake`.** It runs every time the object is reused, so a field set there starts fresh each time:

  ```ts
  OnAwake()
  {
      this.health = 3;
  }
  ```

- **Keep `OnAwake` free of subscriptions and allocations.** The engine also calls it to work out an object's default values, so anything it registers may leak.
- **Release in `OnRemoved`.** Unsubscribe global listeners and remove the object from your own collections (or an ECS world) there; otherwise they keep acting on the object after it's reused.

## Restart, clear, and persistence

| Action | Behavior |
| --- | --- |
| `await scene.Restart(full = false)` | Clears ordinary scene listeners and nonpersistent objects (all objects when `full`), runs `OnRestart`, then `OnStart`. Does not rerun scene `OnAwake`. |
| `await scene.LoadLevel(name)` | Clears scene controllers with `includingPersistent = false`, preserving persistent objects, then loads the level. |
| `await bare.scene.Goto(Game)` | Removes nonpersistent scenes and starts `Game`. Persistent UI scenes survive. |
| `bare.scene.Remove(scene)` | Explicitly removes that scene, even if persistent, and clears its listeners and objects. |
| `bare.scene.Clear(true)` | Removes all scenes, including persistent ones. |

Persistence belongs to each API separately. A persistent scene does not make its timers, listeners, or GameObjects persistent automatically.

Clearing any scene cancels **all** nonpersistent global `wait` and `waitFrame` calls, even those started by another scene. Cancelled waits stay pending. See [Globals](../reference/globals#waiting).

## Global listeners

An object's global listener can outlive the object unless you unsubscribe. Keep a stable callback reference and pair registration with removal:

<<< ../../features/fixtures/src/docExamples/focusComponent.ts

Ordinary scene listeners are cleared on restart; register those in `OnStart` if they must be recreated. Persistent scene listeners can be registered once in `OnAwake`. Avoid adding the same persistent listener on every `OnStart`. See [Events](./events).

## Render textures

Destroy textures that your scene creates when their contents are no longer needed. Allocate and release them in matching hooks:

<<< ../../features/fixtures/src/docExamples/paintScene.ts

This scene recreates its texture on restart. If you also load levels, recreate level-owned resources after each load, since loading calls `OnClear` too. Do not destroy a shared atlas texture merely because one sprite is removed.