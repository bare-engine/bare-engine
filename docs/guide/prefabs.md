# Prefabs

A **prefab** is a named data object that describes a GameObject. You define prefabs in [`settingsData.json`](./settings-data) and turn them into GameObjects by name.

```json
{
  "prefabs": [
    {
      "name": "ball",
      "texture": "ball",
      "scale": {
        "x": 2,
        "y": 2
      }
    }
  ]
}
```

```ts
this.AddGameObject('ball');
```

The [browser extension](https://chromewebstore.google.com/detail/bare-engine/dbohigkcdpdnchgaffmofeoffnpkmphb) ([Firefox](https://addons.mozilla.org/en-GB/firefox/addon/bare-engine/)) lets you view and edit prefabs, so you rarely need to edit the JSON by hand.

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [`settingsData.json`](https://github.com/bare-engine/bare-platformer/blob/main/public/data/settingsData.json) defines the player, blocks, coins and flag as prefabs.

## Entities

The same kind of data object, when it isn't defined in `settingsData.json`, is called an **entity**. You can pass one straight to `AddGameObject`, and levels are made of them:

```ts
this.AddGameObject({ texture: 'ball', x: 10 });
// a prefab with overrides
this.AddGameObject({
    name: 'bigBall',
    extends: 'ball',
    scale: { x: 2, y: 2 },
});
```

In other words, prefabs are the definitions in `settingsData.json`, and entities are the data that describes individual objects, often by extending a prefab.

## Extending

A prefab or entity can **extend** another prefab with `extends`. It inherits all properties and can override any of them. Prefabs can extend each other in a chain.

```json
{
  "name": "enemy",
  "texture": "enemy",
  "components": {
    "health": {
      "max": 3
    }
  }
},
{
  "name": "bossEnemy",
  "extends": "enemy",
  "scale": {
    "x": 3,
    "y": 3
  },
  "components": {
    "health": {
      "max": 10
    }
  }
}
```

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [prefabs demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/prefabs/src/DemoPrefabs.ts#L18-L61) builds a chain of prefabs that extend each other.

## Base prefabs

Base prefabs are defined under `basePrefabs`. They hold the same properties, but they are building blocks for other prefabs rather than things you add directly.

```json
{
  "basePrefabs": [
    {
      "name": "block",
      "baseClass": "ArcadeObject",
      "hitbox": "FULL",
      "static": true
    }
  ],
  "prefabs": [
    {
      "name": "grassLeft",
      "extends": "block"
    },
    {
      "name": "grassMid",
      "extends": "block"
    }
  ]
}
```

`ANY` is a built-in base prefab that every prefab inherits from. Properties you give `ANY` apply to all prefabs, for example a default pivot:

```json
{
  "name": "ANY",
  "pivot": {
    "x": 0.5,
    "y": 0.5
  }
}
```

To leave a prefab out of that, let it extend `NONE`, the other built-in base prefab. It ends the chain, so nothing from `ANY` is applied:

```json
{
  "name": "background",
  "extends": "NONE",
  "texture": "sky"
}
```

Every prefab and entity without an `extends` extends `ANY`, including base prefabs, so `NONE` is the only way out.

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [base prefabs](https://github.com/bare-engine/bare-platformer/blob/main/public/data/settingsData.json#L16-L42) `block` and `collectable` are extended by every block and coin.

## Properties

Prefabs and entities can have these properties. Most can also be a [preset](#presets) name, like `"pivot": "CENTER"`.

### Identity

| Property | Description |
| --- | --- |
| `name` | The name. Find the object with `bare.object.GetByName()`. |
| `extends` | The prefab this one inherits from. Defaults to `ANY`. |
| `baseClass` | GameObject class to create, for example `ArcadeObject`. Mark your own classes `@InspectorBaseClass`, or register them with `bare.AddClass()`. See [Custom GameObjects](./custom-game-objects). `ArcadeObject` is registered by `ArcadePhysicsController`. |
| `tags` | A list of strings, to group and find objects. |
| `customData` | Your own named values, for your game code. |

### Transform

| Property | Description |
| --- | --- |
| `position`, or `x` and `y` | Position. For children, relative to the parent. Usually set per object, in a level or in code, not in a prefab. |
| `scale` | Scale as `{ x, y }`. |
| `rotation` | Rotation in degrees. |
| `flipped` | Flip horizontally. |
| `pivot` | Pivot point. `{ x: 0, y: 0 }` is the top left; values above 0 and up to 1 are a fraction of the image size, larger values are pixels. On the GameObject it reads back in pixels. See [Pivot](./game-objects#pivot). |

### Inner transform

An extra transform for the visual content only, on top of the object's own transform. Useful for a bounce or wobble that shouldn't move the object itself.

| Property | Description |
| --- | --- |
| `innerPosition` | Offset, in the object's units before its `scale`. |
| `innerScale` | Scale. |
| `innerRotation` | Rotation in degrees. |
| `innerPivot` | Pivot for the inner transform. Defaults to `pivot`. |
| `innerFlipped` | An extra horizontal flip. |
| `childrenInheritInnerTransform` | Children follow the inner transform too. On by default. |

### Appearance

| Property | Description |
| --- | --- |
| `texture` | Image name. `"NAME"` uses the object's name, handy in `ANY`. |
| `imagePath` | Folder for the image, relative to `public/images/`. |
| `color` | Tint. White keeps the original colors. |
| `alpha` | Opacity, from 0 to 1. |
| `visible` | Whether it's drawn. |

### Structure

| Property | Description |
| --- | --- |
| `components` | [Components](#components-in-prefabs) to attach, with their field values. |
| `children` | Child entities. |
| `componentsRemoved` | Names of inherited components to leave out. |
| `propertiesRemoved` | Names of inherited properties to leave out. |

### Behavior

| Property | Description |
| --- | --- |
| `tapHitbox` | Area for pointer input, as `{ x1, y1, x2, y2 }`. |
| `persistent` | Keep the object when the level is cleared. Persistent objects aren't saved with the level. |
| `save` | Include the object when saving the level. |
| `interactableInEditor` | Whether the object can be selected in the level editor. |

### Class-specific properties

A `baseClass` adds its own properties, such as `velocity`, `static` and `hitbox` for an `ArcadeObject`. See [Physics](../reference/physics#arcadeobject) and [Text & UI](./text-and-ui).

Any field marked `@SerializeField` on a GameObject class can be set from a prefab.

## Components in prefabs

The `components` map uses the component name without the `Component` suffix, starting lowercase. Values set the component's fields:

```json
"components": {
  "player": {
    "moveSpeed": 600
  },
  "animation": {}
}
```

This attaches a `PlayerComponent` with `moveSpeed = 600` and an `AnimationComponent`.

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [player prefab](https://github.com/bare-engine/bare-platformer/blob/main/public/data/settingsData.json#L44-L62) attaches an animation and a player component.

## Presets

`presets` holds reusable values. Use a preset's name as the value of a property, and it's replaced by the preset.

A preset says which property it's for: its keys are property names. The preset below only fills in a `particle` value:

```json
"presets": {
  "PARTICLE_EFFECT": {
    "particle": {
      "life": 1,
      "emitRate": 5
    }
  }
},
"basePrefabs": [
  {
    "name": "collectable",
    "components": {
      "particle": "PARTICLE_EFFECT"
    }
  }
]
```

Presets can go anywhere in your settings, including inside other presets.

To make a preset that works for any property, use the key `ANY`:

```json
"presets": {
  "HALF": {
    "ANY": {
      "x": 0.5,
      "y": 0.5
    }
  }
}
```

### Built-in presets

| Preset | Value |
| --- | --- |
| `CENTER` | `{ "x": 0.5, "y": 0.5 }` for any property, for example `"pivot": "CENTER"`. |
| `FULL` | A `hitbox` covering the whole image, for `"hitbox": "FULL"`. |

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s coins use the [`PARTICLE_EFFECT` preset](https://github.com/bare-engine/bare-platformer/blob/main/public/data/settingsData.json#L129-L170) for their sparkle.

## Typed access

The generated `Data` object gives you autocomplete for prefab names:

```ts
import { Data } from './generated/assets';

this.AddGameObject(Data.Prefab.PLAYER);
```

See [Generated names](./settings-data#generated-names) for the rest of `Data`.
