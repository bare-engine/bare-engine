# Objects

`bare.object` holds the scene's [GameObjects](../guide/game-objects), sorted into [layers](../guide/levels-and-layers#layers). To add objects, use the scene's `AddGameObject`; this module is for finding and ordering them.

```ts
const player = bare.object.GetByName('player');
const enemies = bare.object.GetLayerByName('enemies');

for (const obj of bare.object.GetAll())
    obj.alpha = 0.5;
```

## Finding objects

| Method | Description |
| --- | --- |
| `GetByName(name)` | The first object with this name, or `null`. Only searches objects on a layer, not their children. |
| `GetById(id, searchChildren?)` | The object with this `uniqueID`, or `null`. Searches children too, unless `searchChildren` is `false`. |
| `GetAll()` | Every object on every layer, without children. |

`GetByName` and `GetById` take a type, for example `bare.object.GetByName<ArcadeObject>('player')`.

To find objects by their components, use [`bare.component.GetAllByType`](../guide/components#finding-components).

## Layers

| Method | Description |
| --- | --- |
| `GetLayerByName(name)` | The objects on a layer, as an array. Empty if there is no such layer. |
| `GetLayer(index)` | The same, by layer index. |
| `GetLayers()` | All layers. |
| `GetLayerOf(obj)` | The index of the layer an object is on, or `-1`. |
| `MoveToLayer(obj, index)` | Move an object to another layer. |

The arrays are the live layers, so don't add or remove items yourself. Reordering them is fine, see [Draw order](#draw-order).

## Draw order

Within a layer, later objects draw on top.

| Method | Description |
| --- | --- |
| `BringToFront(obj)` / `BringToBack(obj)` | Draw on top of, or below, everything on its layer. Same as `obj.BringToFront()`. |
| `MoveWithinLayer(obj, index)` | Move an object to a position in its layer. |

To draw objects further down the screen on top, as in a top-down game, sort the layer by `y` every frame. Sorting the array in place is allowed, and it's cheap, since the order barely changes between frames. Pointer input follows the same order, so the object drawn on top is also the one that's clicked:

```ts
override OnUpdate()
{
    bare.object.GetLayerByName('objects').sort((a, b) => a.y - b.y);
}
```

This sorts by each object's position, so put the [pivot](../guide/game-objects#pivot) at the feet: `SetPivot(0.5, 1)`. With the pivot in the center, a tall object sorts by its middle and can end up behind a short one standing in front of it.

## Clearing

`Clear(includingPersistent?)` removes every object. Pass `false` to keep [persistent](../guide/prefabs#behavior) ones. Usually you'd load a level or restart the scene instead.
