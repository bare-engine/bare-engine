# GameObjects

A `GameObject` is anything in your scene. It holds position, scale, rotation, pivot, alpha and color, and supports children, components, shaders, masks, events and pointer input.

## Adding a GameObject

`AddGameObject` accepts several kinds of input:

```ts
this.AddGameObject('player');                     // a prefab name or image name
this.AddGameObject('/player');                    // force the image, skip the prefab
this.AddGameObject('enemies/saw');                // an image path
this.AddGameObject({ extends: 'player', x: 50 }); // an entity
this.AddGameObject(Asset.Image.PLAYER);           // image from generated assets
this.AddGameObject(MyGameObjectClass);            // a class
this.AddGameObject(new MyGameObjectClass(this));  // an instance
this.AddGameObject();                             // an empty GameObject
```

A name is resolved in this order:

1. A [prefab](./prefabs) with that name in `settingsData.json`.
2. An image in the initial assets (for example the texture atlas).
3. An image in `public/images/`, which is streamed in.

The second argument is the parent: a layer name, a layer index or another GameObject.

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [basics demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/basics/src/DemoBasics.ts) adds and rotates a single GameObject.

## Transform

Setters return the object, so you can chain them:

```ts
this.AddGameObject('ball')
    .SetPosition(100, 200)
    .SetScale(2)
    .SetRotation(45)
    .CenterPivot();
```

| Setter | Description |
| --- | --- |
| `SetPosition(x, y)` | Position. |
| `SetScale(scale)` | The same scale on both axes. |
| `SetScaleXY(x, y)` | A different scale per axis, eg `SetScaleXY(bare.width, bare.height)` to stretch the 1×1 `PIXEL` over the screen. |
| `SetScaleToReachDimensions(width, height, keepRatio?)` | Scale the image to a size in game units. With `keepRatio`, it fits inside that size without stretching. |
| `SetRotation(degrees)` | Rotation. |
| `SetPivot(x, y)` / `CenterPivot()` | Pivot, see [Pivot](#pivot). |
| `SetColor(color)` / `SetAlpha(alpha)` | Tint, as a `Color` or hex string, and opacity from 0 to 1. |

| Property | Description |
| --- | --- |
| `x`, `y`, `position` | Position (`position` is a `Vec2`). |
| `scale`, `scaleX`, `scaleY` | Scale. |
| `rotation` | Rotation in **degrees**. |
| `pivot`, `pivotX`, `pivotY` | Anchor point, in texture pixels from the top left. See [Pivot](#pivot). |
| `alpha`, `color`, `visible` | Appearance. |
| `flipped` | Mirror horizontally. |
| `width`, `height` | Size (read-only). |
| `active` | Inactive objects are not updated. |
| `tags`, `customData` | Your own data, saved with the object. |

### Pivot

The pivot is the point of the image that sits at the object's position, and that it rotates and scales around. `SetPivot(x, y)` takes fractions of the texture size: values above 0 and up to 1 are a fraction, larger values are pixels. `CenterPivot()` is `SetPivot(0.5, 0.5)`.

```ts
obj.SetPivot(0.5, 1);   // bottom center
obj.CenterPivot();
```

The fraction is of the texture's own size, not the scaled size. Reading `pivot`, `pivotX` or `pivotY` always gives pixels, and assigning to them directly sets pixels too: on a 64×64 image, `obj.SetPivot(0.5, 0.5)` gives a `pivot` of `{ x: 32, y: 32 }`, and `obj.pivotX = 0.5` means half a pixel. A prefab's `pivot` works like `SetPivot`.

## Inner transform

Unique to Bare, every GameObject also has an **inner** transform: `innerPosition`, `innerScale`, `innerRotation`, `innerPivot` and `innerFlipped`. It moves the texture without moving the object itself. This makes many effects possible without nesting objects, for example squashing a character while its position stays the same:

```ts
import { TweenTo } from 'bare-engine';

TweenTo(player, 0.1, { innerScaleY: 0.8 });
```

`innerPosition` is in the object's own units, before its `scale`: on an object with `scale` 4, `innerX = 10` moves the texture 40 game units. To move it a fixed distance on screen, divide by the scale, for example `innerX = 10 / obj.scaleX`. This matters most for the 1×1 `PIXEL` texture, which is usually scaled up a lot.

Children follow the inner transform by default. Set `childrenInheritInnerTransform = false` to change that.

**Examples:** [Platformer](https://github.com/bare-engine/bare-platformer) coins [bob up and down with `innerY`](https://github.com/bare-engine/bare-platformer/blob/main/src/components/collectableComponent.ts#L10), and [RPG](https://github.com/bare-engine/bare-rpg) enemies [wiggle with `innerRotation`](https://github.com/bare-engine/bare-rpg/blob/main/src/components/enemyAIComponent.ts#L180) while they walk.

## Children

```ts
const ship = this.AddGameObject('ship');
const gun = ship.AddChild('gun').SetPosition(20, 0);

ship.GetChildByName('gun');
gun.RemoveFromParent();
```

A child's position is measured from the top left of its parent's image, in the parent's image pixels, and it moves, turns and scales along with the parent. Changing the parent's [pivot](#pivot) moves its children along with its image.

Set `childrenAtPivot = true` on the parent to measure from its pivot instead. `SetPosition(0, 0)` then puts a child on the parent's position, whatever the parent's pivot is, like an anchor in Pixi:

```ts
ball.CenterPivot();
ball.childrenAtPivot = true;
const face = ball.AddChild('face').CenterPivot();   // on the ball's position
```

A child of a scaled parent is scaled too. If the parent is scaled differently in width and height, a turned child is skewed, so keep things like that as separate objects that follow the parent instead.

Use `ToGlobal(point)` and `ToLocal(point)` to convert between a child's space and world space. For a point on the object's image, in its image pixels from the top left, like a corner of a hitbox, use `ContentToGlobal(point)`.

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

See [Hitbox](../reference/hitbox).

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

Extend `GameObject` and override its lifecycle methods (`OnAwake`, `OnStart`, `OnUpdate`, `OnFixedUpdate`, `OnRender`, `OnRemoved`, …). See [Lifecycle & Cleanup](./lifecycle) for how object hooks differ from scene hooks. For most behavior a [component](./components) is the better choice, because it can be attached from data.

**Example:** the [Trust](https://github.com/bare-engine/bare-trust) game's [`Peep`](https://github.com/bare-engine/bare-trust/blob/main/src/peep.ts#L20) extends `GameObject` and [overrides `OnUpdate`](https://github.com/bare-engine/bare-trust/blob/main/src/peep.ts#L94).
