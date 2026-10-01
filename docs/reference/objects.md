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

The arrays are the live layers, so don't add or remove items yourself.

## Draw order

Within a layer, later objects draw on top.

| Method | Description |
| --- | --- |
| `BringToFront(obj)` / `BringToBack(obj)` | Draw on top of, or below, everything on its layer. Same as `obj.BringToFront()`. |
| `MoveWithinLayer(obj, index)` | Move an object to a position in its layer. |

## Clearing

`Clear(includingPersistent?)` removes every object. Pass `false` to keep [persistent](../guide/prefabs#behavior) ones. Usually you'd load a level or restart the scene instead.
