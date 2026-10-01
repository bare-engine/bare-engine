# Components

Components add behavior to GameObjects. They work much like in Unity: you write a class with lifecycle methods and attach it to any object or prefab.

```ts
import { Component, InspectorField } from 'bare-engine';

export class SpinComponent extends Component
{
    @InspectorField
    speed = 90;

    OnUpdate(deltaTime: number)
    {
        this.go.rotation += this.speed * deltaTime;
    }
}
```

- The class name must end in `Component`.
- Put it in `src/components/` and export it. Exported components are registered with the engine automatically.
- `this.go` is the GameObject it's attached to, and `this.scene` is its scene.
- Use `Component<ArcadeObject>` to type `this.go` as a specific GameObject class.

## Attaching components

In code:

```ts
const spin = obj.AddComponent(SpinComponent);
spin.speed = 180;
```

In a prefab, using the name without `Component`, starting lowercase:

```json
{ "name": "fan", "texture": "fan", "components": { "spin": { "speed": 180 } } }
```

## Lifecycle

All methods are optional.

| Method | When it runs |
| --- | --- |
| `OnAwake(go)` | When the component is created. |
| `OnAdded(go)` | When it's attached to a GameObject in the scene. |
| `OnStart()` | Once, before its first update. |
| `OnUpdate(dt)` / `OnFixedUpdate(dt)` | Every frame / every fixed step. |
| `OnPreRender()` / `OnRender()` / `OnPostRender()` | Around rendering. |
| `OnEnable()` / `OnDisable()` | When enabled or disabled. |
| `OnRemoved()` | When removed, or when its GameObject is removed. |
| `OnCollisionStart(other)` / `OnCollisionUpdate(other)` / `OnCollisionEnd(other)` | With [physics](../reference/physics). |
| `OnPostLoadLevel()` / `OnPreSaveLevel()` | Around level loading and saving. |

## Finding components

```ts
obj.GetComponent(SpinComponent);
obj.HasComponent(SpinComponent);
obj.RemoveComponent(SpinComponent);

bare.component.GetAllByType(SpinComponent);   // every SpinComponent in the scene
bare.component.Disable(obj, SpinComponent);
bare.component.Enable(obj, SpinComponent);
```

## Inspector fields

Fields marked `@InspectorField` show up in the [Chrome extension](./chrome-extension), where you can edit them live, and can be set from prefabs. More decorators control how they're shown:

```ts
import { Component, Inspector, InspectorField } from 'bare-engine';

export class PlayerComponent extends Component
{
    @InspectorField
    @Inspector.Limit(0, Infinity)
    moveSpeed = 500;

    @InspectorField
    @Inspector.Label('Jump force')
    jump = -1600;
}
```

Inspector decorators are removed in production builds, so they don't add to your game's size.

## Built-in components

| Component | Description |
| --- | --- |
| `AnimationComponent` | Plays frame animations from `settingsData.json`. |
| `ParticleComponent` | Attaches a particle emitter to the object. |
| `TextComponent` | Renders text. |
| `CollisionEventComponent` | Sends an event when the object collides with a named object. No code needed. |
