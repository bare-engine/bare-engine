# GameObjects

A `GameObject` is anything in your scene. It holds position, scale, rotation, pivot, alpha and color, and supports children, components, shaders, masks, events and pointer input.

## Adding a GameObject

`AddGameObject` accepts several kinds of input:

```ts
this.AddGameObject('player');                     // a prefab name or image name
this.AddGameObject('/player');                    // force the image, skip the prefab
this.AddGameObject('enemies/saw');                // an image path
this.AddGameObject({ extends: 'player', x: 50 }); // an entity
this.AddGameObject(Asset.Image.EMOJI_GEAR);       // from generated assets
this.AddGameObject(MyGameObjectClass);            // a class
this.AddGameObject();                             // an empty GameObject
```

A name is resolved in this order:

1. A [prefab](./prefabs) with that name in `settingsData.json`.
2. An image in the initial assets (for example the texture atlas).
3. An image in `public/images/`, which is streamed in.

The second argument is the parent: a layer name, a layer index or another GameObject.

## Transform

Most setters return the object, so you can chain them:

```ts
this.AddGameObject('ball')
    .SetPosition(100, 200)
    .SetScale(2)
    .SetRotation(45)
    .CenterPivot();
```

| Property | Description |
| --- | --- |
| `x`, `y`, `position` | Position (`position` is a `Vec2`). |
| `scale`, `scaleX`, `scaleY` | Scale. |
| `rotation` | Rotation in **degrees**. |
| `pivot`, `pivotX`, `pivotY` | Anchor point from 0 to 1. `CenterPivot()` sets it to 0.5. |
| `alpha`, `color`, `visible` | Appearance. |
| `flipped` | Mirror horizontally. |
| `width`, `height` | Size (read-only). |
| `active` | Inactive objects are not updated. |
| `tags`, `customData` | Your own data, saved with the object. |

## Inner transform

Unique to Bare, every GameObject also has an **inner** transform: `innerPosition`, `innerScale`, `innerRotation`, `innerPivot` and `innerFlipped`. It moves the texture without moving the object itself. This makes many effects possible without nesting objects, for example squashing a character while its position stays the same:

```ts
TweenTo(player, 0.1, { innerScaleY: 0.8 });
```

Children follow the inner transform by default. Set `childrenInheritInnerTransform = false` to change that.

## Children

```ts
const ship = this.AddGameObject('ship');
const gun = ship.AddChild('gun').SetPosition(20, 0);

ship.GetChildByName('gun');
gun.RemoveFromParent();
```

Use `ToGlobal(point)` and `ToLocal(point)` to convert between a child's space and world space.

## Components

```ts
const health = player.AddComponent(HealthComponent);
player.GetComponent(HealthComponent);
player.HasComponent(HealthComponent);
player.RemoveComponent(HealthComponent);
```

See [Components](./components).

## Pointer input

```ts
button.OnPointerDown(() => console.log('pressed'));
button.OnPointerUp(...);
button.OnPointerEnter(...);
button.OnPointerLeave(...);
button.OffPointers();
```

See [Input](../reference/input).

## Ordering

`BringToFront()` and `BringToBack()` change draw order within the object's [layer](./levels-and-layers).

## Removing

```ts
obj.Remove();
```

Pooled objects are returned to their pool, so they can be reused without new allocations.

## Shaders and masks

```ts
obj.AddShader(FlashShader);
obj.RemoveShader(FlashShader);
obj.SetMask(maskObject);
```

## Custom GameObject classes

Extend `GameObject` and override its lifecycle methods (`OnAwake`, `OnStart`, `OnUpdate`, `OnFixedUpdate`, `OnRender`, `OnRemoved`, …), the same as a scene. For most behavior a [component](./components) is the better choice, because it can be attached from data.
