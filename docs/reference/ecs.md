# Entity Component System

Besides regular [components](../guide/components), Bare includes [miniplex](https://github.com/hmans/miniplex), a small Entity Component System. GameObjects are the entities and plain fields are the components. Systems are loops over queries.

This is mostly a way to organize code: logic lives in systems that work on every object with certain fields.

<<< ../../features/fixtures/src/docExamples/ecs.ts

To run this as your game, put it in `src/game.ts`, import `StartBare` from `bare-engine`, and add `StartBare(EcsGame)` at the end. This example demonstrates query membership; its empty enemy has no visible sprite.

`OnRemoved` removes the enemy from all queries, and `OnClear` releases remaining world entries. See [pooled objects](../guide/lifecycle#pooled-objects) for why fields are reset in `OnAwake`.

`world.removeComponent(obj, 'poisoned')` removes a field, and the object leaves every query that needs it. `query.onEntityAdded.subscribe(...)` runs code when an object starts matching.

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [ECS demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/ecs/src/DemoECS.ts).
