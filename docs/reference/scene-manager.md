# Scene Manager

`bare.scene` manages the running [scenes](../guide/scenes). Scenes are drawn in order, so later scenes draw on top.

```ts
const ui = await bare.scene.Add(UIScene);
await bare.scene.Goto(Game, { level: 2 });   // the payload goes to OnAwake/OnStart
```

| Method | Description |
| --- | --- |
| `Add(sceneOrClass, payload?)` | Add a scene on top of the others. |
| `Goto(sceneClass, payload?)` | Remove the current scenes and start this one. |
| `Remove(sceneOrClass)` | Remove a scene. |
| `Get(sceneClass)` / `Has(sceneClass)` | Find a running scene. |
| `GetAll()` | All running scenes. |
| `GetMainScene()` | The first scene. |
| `GetLevelScene()` | The scene that has a level loaded. |
| `MoveUp` / `MoveDown` / `MoveToFront` / `MoveToBack` | Change draw order. |
| `MoveGameObjectTo(obj, scene)` | Move a GameObject to another scene. |
| `DisableAll()` / `EnableAll()` | Pause or resume all scenes. |
| `SendEvent(type, ...args)` | Send an event to every scene. |
| `Clear(includePersistent?)` | Remove all scenes. |
| `Restart()` | Restart all scenes. |
