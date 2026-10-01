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

**Examples:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [`PlayerComponent`](https://github.com/bare-engine/bare-platformer/blob/main/src/components/playerComponent.ts) and [`CollectableComponent`](https://github.com/bare-engine/bare-platformer/blob/main/src/components/collectableComponent.ts), and the [Showcase](https://github.com/bare-engine/bare-showcase)'s [components demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/components/src/components/waveComponent.ts).

## Attaching components

In code:

```ts
const spin = obj.AddComponent(SpinComponent);
spin.speed = 180;
```

In a prefab, using the name without `Component`, starting lowercase:

```json
{
  "name": "fan",
  "texture": "fan",
  "components": {
    "spin": {
      "speed": 180
    }
  }
}
```

## Lifecycle

All methods are optional.

An active component attached to an already started object can run `OnAwake`, `OnAdded`, and `OnStart` before `AddComponent` returns. See [Lifecycle & Cleanup](./lifecycle) for initialization and teardown patterns.

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

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer) [counts its coins](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L59) with `bare.component.GetAllByType(CollectableComponent)`.

### Calling a method on all components

`CallMethodOnComponentsOfObject` calls a method on every component of an object that has it. This lets components react to things without knowing about each other, for example getting hit:

```ts
bare.component.CallMethodOnComponentsOfObject('OnHit', enemy, damage);
```

Describe the method once so TypeScript knows about it:

```ts
declare module 'bare-engine'
{
    interface Component
    {
        OnHit?(damage: number): void;
    }
}
```

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg) [declares `OnHit` and `OnDie`](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L11-L20). Its [`AliveComponent`](https://github.com/bare-engine/bare-rpg/blob/main/src/components/aliveComponent.ts#L44-L49) loses health on a hit and calls `OnDie` on all components, while its [`HitComponent`](https://github.com/bare-engine/bare-rpg/blob/main/src/components/hitComponent.ts) flashes and knocks the object back.

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

Inspector decorators are removed in production builds, so they don't add to your game's size. See [Inspector Decorators](../reference/inspector-decorators) for the full list.

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [player fields](https://github.com/bare-engine/bare-platformer/blob/main/src/components/playerComponent.ts#L17-L30) use `Limit`, `Label` and `Locked`.

## Built-in components

| Component | Description |
| --- | --- |
| `AnimationComponent` | Plays frame animations. See [Animations](./animations). |
| `ParticleComponent` | Attaches a particle emitter to the object. See [Particles](./particles). |
| `TextComponent` | Renders text. See [Text & UI](./text-and-ui). |
| `CollisionEventComponent` | Sends an event when the object collides with a named object. No code needed. |
