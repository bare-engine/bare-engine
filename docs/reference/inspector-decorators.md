# Inspector Decorators

Decorators mark fields and methods for the [Chrome extension](../guide/chrome-extension) and for saving. Use them in [components](../guide/components) and [custom GameObjects](../guide/custom-game-objects).

```ts
import { Component, Inspector, InspectorButton, InspectorField } from 'bare-engine';

export class TurretComponent extends Component
{
    @InspectorField
    @Inspector.Limit(0, 10)
    @Inspector.Description('Shots per second')
    fireRate = 2;

    @InspectorField
    @Inspector.Dropdown(['bullet', 'rocket', 'laser'])
    ammo = 'bullet';

    @InspectorButton
    Fire() { ... }
}
```

Every decorator is available through `Inspector`, which is handy for autocomplete: `@Inspector.Limit`, `@Inspector.Label`, and so on. Each can also be imported on its own, like `@Limit`. `@InspectorField`, `@InspectorButton`, `@InspectorClass` and `@InspectorBaseClass` are the same as `@Inspector.Field`, `@Inspector.Button`, `@Inspector.Class` and `@Inspector.BaseClass`.

## Fields

| Decorator | Description |
| --- | --- |
| `@InspectorField` | Show the field in the inspector, and allow setting it from prefabs and levels. |
| `@Inspector.Label('Name')` | Show a different name. |
| `@Inspector.Description('…')` | Add a tooltip. |
| `@Inspector.Locked` | Show the value, but don't allow editing. |
| `@Inspector.Limit(min, max)` | Keep a number within bounds. |
| `@Inspector.Int` | Whole numbers only. |
| `@Inspector.Decimal(places)` | Show this many decimals. |
| `@Inspector.Percentage` | A value from 0 to 1. |
| `@Inspector.Dropdown(values)` | Pick from a list. `values` can be an array or a function returning one. |
| `@Inspector.Enum(MyEnum)` | Pick from a TypeScript enum's members. |

A field can also be a getter and setter pair, to show a computed value or react to edits:

<<< ../../features/fixtures/src/docExamples/inspectorState.ts

**Examples:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [player fields](https://github.com/bare-engine/bare-platformer/blob/main/src/components/playerComponent.ts#L17-L30) (`Limit`, `Label`, `Locked` and a getter/setter), and the [Shmup](https://github.com/bare-engine/bare-shmup)'s [shoot settings](https://github.com/bare-engine/bare-shmup/blob/main/src/components/shootComponent.ts#L8-L18) (`Limit`, `Decimal`).

## Buttons

| Decorator | Description |
| --- | --- |
| `@InspectorButton` | Show a button that calls the method. |
| `@InspectorButton('Label')` | Same, with a custom label. |

Handy for debugging: a `Fire()` or `Die()` button you can press while the game runs.

**Examples:** the [Shmup](https://github.com/bare-engine/bare-shmup)'s [**Shoot** button](https://github.com/bare-engine/bare-shmup/blob/main/src/components/shootComponent.ts#L30-L33), and the [RPG](https://github.com/bare-engine/bare-rpg) weapon's [**Slash** button](https://github.com/bare-engine/bare-rpg/blob/main/src/objects/weapon.ts#L16-L17).

## Classes

| Decorator | Description |
| --- | --- |
| `@InspectorClass` | Show another object's inspector fields as a group inside this one. |
| `@InspectorBaseClass` | Register a GameObject class so it can be used as a prefab `baseClass`. See [Custom GameObjects](../guide/custom-game-objects). |

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg)'s [`Weapon`](https://github.com/bare-engine/bare-rpg/blob/main/src/objects/weapon.ts#L4-L5) is registered this way.

**Example:** the [Shmup](https://github.com/bare-engine/bare-shmup)'s scene [shows a `Watcher`](https://github.com/bare-engine/bare-shmup/blob/main/src/game.ts#L17-L18), whose [getters](https://github.com/bare-engine/bare-shmup/blob/main/src/game.ts#L126-L136) count enemies and bullets.

## Saving and run modes

These two aren't just for the inspector, so they're kept in production builds:

| Decorator | Description |
| --- | --- |
| `@Save` | Save the field into levels. Inspector fields aren't saved without it. See [What gets saved](./save-data#what-gets-saved). |
| `@Run(...modes)` | Choose whether a component runs while playing (`GameMode.Play`), in the [level editor](../guide/level-editor#components-in-the-editor) (`GameMode.Edit`), or both. |

All other decorators are removed from production builds, unless you turn off [`stripDecorators`](./package-json#stripdecorators).

**Examples:** the [RPG](https://github.com/bare-engine/bare-rpg)'s [`AliveComponent`](https://github.com/bare-engine/bare-rpg/blob/main/src/components/aliveComponent.ts#L5-L12) saves its health with `@Save`, and the [Showcase](https://github.com/bare-engine/bare-showcase)'s [level connector](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/editorComponents/src/editorComponents/levelConnectorComponent.ts#L7-L13) uses `@Run(GameMode.Edit)` and `@Save`.
