# Entity Component System

Besides regular [components](../guide/components), Bare includes [miniplex](https://github.com/hmans/miniplex), a small Entity Component System. GameObjects are the entities and plain fields are the components. Systems are loops over queries.

This is mostly a way to organize code: logic lives in systems that work on every object with certain fields.

The scene owns its world. Removing an object must also remove it from that world; Bare does not automatically connect a separate `World` to the scene's object controller.

<<< ../../features/fixtures/src/docExamples/ecs.ts

To run this as your game, put it in `src/game.ts`, import `StartBare` from `bare-engine`, and add `StartBare(EcsGame)` at the end. This example demonstrates query membership; its empty enemy has no visible sprite.

`OnAwake` resets custom fields on pooled objects. `OnRemoved` removes the enemy from all queries, and `OnClear` releases remaining world entries. See [Lifecycle & Cleanup](../guide/lifecycle).

`world.removeComponent(obj, 'poisoned')` removes a field, and the object leaves every query that needs it. `query.onEntityAdded.subscribe(...)` runs code when an object starts matching.

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [ECS demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/ecs/src/DemoECS.ts).
