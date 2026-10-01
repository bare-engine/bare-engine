# Entity Component System

Besides regular [components](../guide/components), Bare includes [miniplex](https://github.com/hmans/miniplex), a small Entity Component System. GameObjects are the entities and plain fields are the components. Systems are loops over queries.

This is mostly a way to organize code: logic lives in systems that work on every object with certain fields.

```ts
import { GameObject, World, type With } from 'bare-engine';

type Obj = GameObject & { health?: number; poisoned?: true };

const world = new World<Obj>();
const poisoned = world.with('health', 'poisoned');

world.add(enemy);
world.addComponent(enemy, 'health', 10);
world.addComponent(enemy, 'poisoned', true);

// a system, run every frame
OnUpdate(deltaTime: number)
{
    for (const obj of poisoned)
        obj.health -= deltaTime;
}
```

`world.removeComponent(obj, 'poisoned')` removes a field, and the object leaves every query that needs it. `query.onEntityAdded.subscribe(...)` runs code when an object starts matching.

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [ECS demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/ecs/src/DemoECS.ts).
