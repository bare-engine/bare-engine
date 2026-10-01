# Prefabs

A **prefab** is a named data object that describes a GameObject. You define prefabs in `public/data/settingsData.json` and turn them into GameObjects by name.

```json
{
  "prefabs": [
    { "name": "ball", "texture": "ball", "x": 50, "y": 70 }
  ]
}
```

```ts
this.AddGameObject('ball');
```

The [Chrome extension](./chrome-extension) lets you view and edit prefabs, so you rarely need to edit the JSON by hand.

## Entities

The same kind of data object **without** a name in `settingsData.json` is called an **entity**. You can pass one straight to `AddGameObject`, and levels are made of them:

```ts
this.AddGameObject({ texture: 'ball', x: 10 });
this.AddGameObject({ extends: 'ball', x: 10 });   // a prefab with an override
```

## Extending

A prefab or entity can **extend** another prefab with `extends`. It inherits all properties and can override any of them. Prefabs can extend each other in a chain.

```json
{ "name": "enemy",     "texture": "enemy", "components": { "health": { "max": 3 } } },
{ "name": "bossEnemy", "extends": "enemy", "scale": 3 }
```

## Base prefabs

Base prefabs are defined under `basePrefabs`. They hold the same properties, but they are building blocks for other prefabs rather than things you add directly.

```json
{
  "basePrefabs": [
    { "name": "block", "baseClass": "ArcadeObject", "hitbox": "FULL", "static": true }
  ],
  "prefabs": [
    { "name": "grassLeft", "extends": "block" },
    { "name": "grassMid",  "extends": "block" }
  ]
}
```

`ANY` is a built-in base prefab that every prefab inherits from. Properties you give `ANY` apply to all prefabs, for example a default pivot:

```json
{ "name": "ANY", "pivot": { "x": 0.5, "y": 0.5 } }
```

## Common properties

| Property | Description |
| --- | --- |
| `name` | The prefab name. |
| `extends` | The prefab this one inherits from. |
| `texture` | Image name. |
| `imagePath` | Folder for the image, relative to `public/images/`. |
| `baseClass` | GameObject class to create, for example `ArcadeObject`. |
| `x`, `y` / `position`, `scale`, `rotation`, `pivot`, `alpha` | Transform and appearance (`"pivot": "CENTER"` works too). |
| `components` | Components to attach, with their field values. |
| `tags` | A list of strings. |
| `children` | Child entities. |

Any field marked `@InspectorField` on a GameObject class can be set from a prefab.

## Components in prefabs

The `components` map uses the component name without the `Component` suffix, starting lowercase. Values set the component's fields:

```json
"components": {
  "player": { "moveSpeed": 600 },
  "animation": {}
}
```

This attaches a `PlayerComponent` with `moveSpeed = 600` and an `AnimationComponent`.

## Presets

`presets` holds reusable values. Any string value in your settings that matches a preset name is replaced by that preset:

```json
"presets": {
  "PARTICLE_EFFECT": { "particle": { "life": 1, "emitRate": 5 } }
},
"basePrefabs": [
  { "name": "collectable", "components": { "particle": "PARTICLE_EFFECT" } }
]
```

## Other settingsData sections

| Key | Description |
| --- | --- |
| `animations` | Named frame animations, used by `AnimationComponent`. |
| `layers` | Layer names, see [Levels & Layers](./levels-and-layers). |
| `settings` | Editor settings, for example `gridEnabled` and `gridSize`. |
| `categories` | How prefabs are grouped in the Chrome extension. |

## Typed access

The generated `Data` object gives you autocomplete for prefab names:

```ts
import { Data } from './generated/assets';

this.AddGameObject(Data.Prefab.PLAYER);
```
