# Tile Maps

A `TileMap` is a GameObject that draws a grid of tiles: ground, roads, walls, water. The whole grid is one object, however big it is, so it's the way to draw maps made of cells. A GameObject per tile would be updated and drawn every frame, on screen or not.

The map keeps its tiles on the GPU and only draws the part the camera sees. Changing a tile only uploads that tile's chunk of 32×32 cells again, so maps can change while you play.

## Creating a map

```ts
import { TileMap } from 'bare-engine';
import { Asset, Data } from './generated/assets';

const ground = this.AddGameObject(TileMap, Data.Layer.GROUND)
    .SetTileSize(16)
    .Resize(100, 60)
    .Fill(0, 0, 100, 60, Asset.Image.GRASS);

ground.SetTile(4, 2, Asset.Image.WATER);
ground.SetTile(5, 2, null); // empty
```

Cells are counted in columns and rows from the map's top left. Its position, scale and rotation work like any GameObject's, and its color tints every tile.

Each tile fills its cell, so make the images `tileWidth` × `tileHeight` pixels. Images that stick out of their cell, like a tree over the path behind it, are better as GameObjects.

**Example:** BareRace builds its track from two maps, grass and road: see `Track.Build` in `src/track.ts`.

## The tileset

A cell holds an index into the map's `tileset`, a list of image and animation names. `SetTile` with a name adds the name to the tileset the first time. For speed in loops, look the index up once:

```ts
const WATER = ground.GetTileIndex(Asset.Image.WATER);
ground.SetTile(x, y, WATER);

ground.tileset = [Asset.Image.GRASS, Asset.Image.SAND, Asset.Image.WATER]; // or set it up front
```

The images can be in the atlas or in `public/images`, which [load on first use](./assets). A tile whose image is still loading draws nothing until it's in. One map can draw from one texture less than the GPU has texture units, usually 15: every atlas page counts as one, and so does every image outside the atlas. Keep tiles in the atlas and this doesn't come up.

## Reading tiles

```ts
ground.GetTile(4, 2);          // tileset index, -1 when empty or outside the map
ground.GetTileName(4, 2);      // 'water', or null
ground.GetTileAt(x, y);        // the tile under a point in world space
ground.InBounds(col, row);

const mouse = bare.mouse.world.position;
const cell = ground.WorldToCell(mouse.x, mouse.y);  // cell.x is the column, cell.y the row
const middle = ground.CellToWorld(cell.x, cell.y);  // the middle of that cell
```

`WorldToCell` and `CellToWorld` follow the map's position, scale and rotation.

## Turning and flipping tiles

```ts
road.SetTile(3, 0, Asset.Image.ROAD_CORNER, { rotation: 90 });   // clockwise, in steps of 90
road.SetTile(4, 0, Asset.Image.ROAD_CORNER, { flipX: true });
road.GetTileTransform(3, 0);                                      // { rotation: 90, flipX: false, flipY: false }
```

The flips apply to the image first, then the rotation.

## Animated tiles

Put an [animation](./animations) name in the tileset, like water with a few frames:

```json
"animations": {
  "water": { "frames": ["water1#4"], "framesPerSecond": 4 }
}
```

```ts
ground.SetTile(x, y, 'water');
```

Every cell with that tile shows the same frame. Playing it costs nothing per tile: the GPU picks the frame from the map's `animationTime`, which runs in `OnUpdate`, so it stops while the scene is paused.

## Several layers of tiles

A map is one layer of tiles: one tile per cell. Use a map per layer, for example ground, then roads on top, and put them on [layers](./levels-and-layers#layers) in the order they should draw. Objects can go in between:

```json
"layers": ["ground", "objects", "roofs"]
```

## Setting the whole map

`SetTiles` takes every cell at once, row after row, with -1 for empty. That's quicker than `SetTile` for a map your code generates, and it fits game data kept in typed arrays:

```ts
const tiles = new Int32Array(width * height);
for (let i = 0; i < tiles.length; i++)
    tiles[i] = noise[i] < 0.3 ? WATER : GRASS;

ground.SetTiles(tiles, width);
```

`GetTiles()` returns them the same way. `Clear()` empties every cell, and `Resize()` keeps the tiles that still fit.

## Tile maps in levels

A map in a level is an entity with `baseClass` `TileMap`. Write its `tiles` as rows of tileset indices:

```json
{
  "baseClass": "TileMap",
  "name": "ground",
  "position": { "x": 0, "y": 0 },
  "tileWidth": 16,
  "tileHeight": 16,
  "tileset": ["grass", "wall", "water"],
  "tiles": [
    [1, 1, 1, 1],
    [1, 0, 2, 1],
    [1, 1, 1, 1]
  ]
}
```

That's also an easy format for a script that generates levels. When the level is saved, `tiles` becomes a compact encoded string, which loads the same way. Tiles changed while playing are saved by `bare.level.Save()` too.

## Collisions

`GetRects` merges the cells you pick into as few rectangles as it can, in world space. Create a static collider for each, for example from an invisible, static `ArcadeObject` prefab with the `PIXEL` image:

```ts
const WALL = walls.GetTileIndex(Asset.Image.WALL);
for (const rect of walls.GetRects(tile => tile === WALL))
    this.AddGameObject({
        extends: Data.Prefab.WALL,
        position: { x: rect.x, y: rect.y },
        scale: { x: rect.width, y: rect.height },
    });
```

For movement on a grid, like a roguelike or pathfinding, read the cells with `GetTile` instead.

## Drawing it yourself

A map doesn't have to be in a layer. A game that draws its world itself, in the scene's `OnPreRender`, can create maps without adding them and draw them in between its own drawing:

```ts
this.terrain = new TileMap(this).SetTileSize(16).Resize(256, 256);

override OnPreRender()
{
    this.terrain.Render();
    // ...buildings and units on top
}
```

The scene then doesn't clean them up: call `ReleaseResources()` on them when you're done, for example in the scene's `OnClear`. A map that isn't in a layer doesn't get `OnUpdate`, so set `animationTime` yourself if it has animated tiles.

**Example:** BareFactorio draws its terrain, shorelines and resources this way: see `src/render/groundRenderer.ts`.

## Performance

- Drawing a map costs a draw call per row of chunks on screen, or one in all when the map's whole width is on screen.
- Every cell takes 4 bytes in memory and the same on the GPU, empty or not. A 1024×1024 map is 4 MB.
- `SetTile` only writes a number; the changed chunks upload at the next draw.
- Zoomed far out over a huge map, every cell on screen is drawn, which costs more than drawing a few big sprites.
- `TileMap.chunkSize` (default 32, a power of two) sets the chunk size for maps created after it changes.

## Limits

- The [level editor](./level-editor) can move, select and save a map, but not paint its tiles yet. Edit tiles in code or in the level file.
- [Shaders](./rendering#shaders) and masks don't apply to tile maps.
- A tileset holds up to 65534 names.
