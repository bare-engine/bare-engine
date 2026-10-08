# Entity Component System

Besides regular [components](../guide/components), Bare includes [miniplex](https://github.com/hmans/miniplex), a small Entity Component System. GameObjects are the entities and plain fields are the components. Systems are loops over queries.

This is mostly a way to organize code: logic lives in systems that work on every object with certain fields.

<!-- example: ../../features/fixtures/src/docExamples/ecs.ts -->
```ts
import { GameObject, Scene, World } from 'bare-engine';

export class Enemy extends GameObject
{
    health = 10;
    poisoned: true | undefined;

    override OnAwake()
    {
        // Reset custom fields when this object is reused from its pool.
        this.health = 10;
        delete this.poisoned;
    }

    override OnRemoved()
    {
        (this.scene as EcsGame).world.remove(this);
    }
}

export class EcsGame extends Scene
{
    readonly world = new World<Enemy>();
    readonly poisoned = this.world.with('health', 'poisoned');

    override OnAwake()
    {
        bare.AddClass(Enemy);
    }

    override OnStart()
    {
        const enemy = this.AddGameObject<Enemy>(Enemy);
        this.world.add(enemy);
        this.world.addComponent(enemy, 'poisoned', true);
    }

    override OnUpdate(deltaTime: number)
    {
        for (const enemy of this.poisoned)
            enemy.health -= deltaTime;
    }

    override OnClear()
    {
        // Also release any entities that weren't attached to the scene.
        for (const enemy of [...this.world])
            this.world.remove(enemy);
    }
}
```

To run this as your game, put it in `src/game.ts`, import `StartBare` from `bare-engine`, and add `StartBare(EcsGame)` at the end. This example demonstrates query membership; its empty enemy has no visible sprite.

`OnRemoved` removes the enemy from all queries, and `OnClear` releases remaining world entries. See [pooled objects](../guide/lifecycle#pooled-objects) for why fields are reset in `OnAwake`.

`world.removeComponent(obj, 'poisoned')` removes a field, and the object leaves every query that needs it. `query.onEntityAdded.subscribe(...)` runs code when an object starts matching.

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [ECS demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/ecs/src/DemoECS.ts).
