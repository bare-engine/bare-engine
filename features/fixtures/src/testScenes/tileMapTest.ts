import { Color, RenderTexture, Scene, TileMap, Vec2 } from "bare-engine";
import { Checks } from "./checks";

// covers TileMap: setting and reading cells, transforms, encoding, level saving, rects, world space,
// and what it draws: turned and flipped tiles, animation, tint and culling, read back as pixels

// a 2x2 image: red green / blue white
const QUAD = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]];

function MakeTexture(name: string, pixels: number[][])
{
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2;
    const context = canvas.getContext("2d")!;
    pixels.forEach(([r, g, b], i) => {
        context.fillStyle = `rgb(${r},${g},${b})`;
        context.fillRect(i % 2, Math.floor(i / 2), 1, 1);
    });
    bare.asset.AddTexture(name, bare.texture.create(canvas));
}

export class TileMapTest extends Scene
{
    checks = new Checks();

    constructor()
    {
        super({ settingsData: { basePrefabs: [{ name: "ANY", texture: "PIXEL" }] } });
    }

    override OnAwake(): void
    {
        bare.AddClass(TileMap);
        MakeTexture("tmQuad", QUAD);
        MakeTexture("tmYellow", [[255, 255, 0], [255, 255, 0], [255, 255, 0], [255, 255, 0]]);
        bare.asset.AddAnimation("tmBlink", ["tmQuad", "tmYellow"], 2);
    }

    // the map drawn into a render texture, as rgb per pixel; row 0 is the map's top
    Draw(map: TileMap, width: number, height: number): { pixel: (x: number, y: number) => string, draws: number }
    {
        const rt = new RenderTexture(rapid, { width, height });
        const pixels = new Uint8Array(width * height * 4);
        let draws = 0;
        rapid.drawToRenderTexture(rt, () => {
            const before = rapid.drawcallCount;
            map.Render();
            rapid.flush();
            draws = rapid.drawcallCount - before;
            rapid.gl.readPixels(0, 0, width, height, rapid.gl.RGBA, rapid.gl.UNSIGNED_BYTE, pixels);
        });
        rt.destroy();
        return {
            pixel: (x, y) => {
                const i = (y * width + x) * 4;
                return `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
            },
            draws,
        };
    }

    override async OnStart()
    {
        const c = this.checks;
        const RED = "255,0,0", GREEN = "0,255,0", BLUE = "0,0,255", WHITE = "255,255,255", YELLOW = "255,255,0", NONE = "0,0,0";

        // cells
        const map = this.AddGameObject(TileMap).SetTileSize(2).Resize(40, 3);
        c.check(map.columns === 40 && map.rows === 3 && map.mapWidth === 80 && map.mapHeight === 6, "Resize and SetTileSize should set the size: " + map.columns + "x" + map.rows);
        c.check(map.texture === null, "a tile map should not get a texture from the ANY prefab");

        map.SetTile(0, 0, "tmQuad");
        map.SetTile(1, 0, "tmQuad", { rotation: 90 });
        map.SetTile(2, 0, "tmQuad", { rotation: 180 });
        map.SetTile(3, 0, "tmQuad", { rotation: 270 });
        map.SetTile(4, 0, "tmQuad", { flipX: true });
        map.SetTile(5, 0, "tmQuad", { flipY: true });
        map.SetTile(6, 0, "tmBlink");
        map.SetTile(35, 0, "tmYellow");
        c.check(map.tileset.join() === "tmQuad,tmBlink,tmYellow", "names should be added to the tileset once: " + map.tileset.join());
        c.check(map.GetTile(0, 0) === 0 && map.GetTile(35, 0) === 2 && map.GetTileName(6, 0) === "tmBlink", "GetTile and GetTileName should read the cell");
        c.check(map.GetTile(7, 0) === -1 && map.GetTileName(7, 0) === null, "an empty cell should read -1 and null");
        c.check(map.GetTile(-1, 0) === -1 && map.GetTile(40, 0) === -1 && map.GetTile(0, 3) === -1, "cells outside the map should read -1");
        map.SetTile(99, 99, 0);
        c.check(map.columns === 40, "setting a cell outside the map should do nothing");
        const turned = map.GetTileTransform(1, 0), flipped = map.GetTileTransform(4, 0);
        c.check(turned.rotation === 90 && !turned.flipX && flipped.flipX && flipped.rotation === 0, "GetTileTransform should read the transform: " + JSON.stringify([turned, flipped]));

        // drawing
        let drawn = this.Draw(map, 80, 6);
        const topLeft = (col: number) => drawn.pixel(col * 2, 0);
        c.check(drawn.pixel(0, 0) === RED && drawn.pixel(1, 0) === GREEN && drawn.pixel(0, 1) === BLUE && drawn.pixel(1, 1) === WHITE,
            "an untransformed tile should draw its image: " + [drawn.pixel(0, 0), drawn.pixel(1, 0), drawn.pixel(0, 1), drawn.pixel(1, 1)].join(" "));
        c.check(topLeft(1) === BLUE && topLeft(2) === WHITE && topLeft(3) === GREEN,
            "turned tiles should show the right corner top left: " + [topLeft(1), topLeft(2), topLeft(3)].join(" "));
        c.check(topLeft(4) === GREEN && topLeft(5) === BLUE, "flipped tiles should be mirrored: " + [topLeft(4), topLeft(5)].join(" "));
        c.check(topLeft(35) === YELLOW, "a tile in the second chunk should draw: " + topLeft(35));
        c.check(topLeft(7) === NONE, "an empty cell should draw nothing: " + topLeft(7));
        c.check(topLeft(6) === RED, "an animation should start on its first frame: " + topLeft(6));
        map.animationTime = 0.6;
        drawn = this.Draw(map, 80, 6);
        c.check(topLeft(6) === YELLOW, "an animation should move on with animationTime: " + topLeft(6));

        map.SetTile(0, 0, "tmYellow");
        drawn = this.Draw(map, 80, 6);
        c.check(topLeft(0) === YELLOW, "a changed cell should draw its new tile: " + topLeft(0));
        map.SetColor(new Color(255, 0, 0, 255));
        drawn = this.Draw(map, 80, 6);
        c.check(topLeft(0) === RED, "the map's color should tint its tiles: " + topLeft(0));
        map.SetColor(Color.White);

        map.SetPosition(-100000, 0);
        drawn = this.Draw(map, 80, 6);
        c.check(drawn.draws === 0, "a map off screen should not be drawn: " + drawn.draws + " draw calls");
        map.SetPosition(0, 0);
        drawn = this.Draw(map, 80, 6);
        c.check(drawn.draws === 1, "a map whose whole width shows should be one draw call: " + drawn.draws);

        // encoding
        const copy = this.AddGameObject(TileMap);
        copy.tileset = map.tileset;
        copy.tiles = map.tiles;
        c.check(copy.columns === 40 && copy.rows === 3, "decoding tiles should set the size: " + copy.columns + "x" + copy.rows);
        c.check(copy.GetTiles().join() === map.GetTiles().join(), "decoded tiles should match");
        c.check(copy.GetTileTransform(1, 0).rotation === 90 && copy.GetTileTransform(5, 0).flipY, "decoded tiles should keep their transform");
        const encoded = copy.tiles;
        copy.SetTile(7, 2, 0);
        c.check(copy.tiles !== encoded && copy.tiles === copy.tiles, "the encoded tiles should follow a changed cell");

        const fromRows = this.AddGameObject(TileMap);
        fromRows.tiles = [[0, -1, 1], [1]];
        c.check(fromRows.columns === 3 && fromRows.rows === 2 && fromRows.GetTile(2, 0) === 1 && fromRows.GetTile(1, 0) === -1 && fromRows.GetTile(1, 1) === -1,
            "rows of indices should set the tiles, short rows padded with empty cells: " + fromRows.GetTiles().join());

        // size changes keep what fits
        map.Resize(10, 2);
        c.check(map.GetTile(1, 0) === 0 && map.GetTileTransform(1, 0).rotation === 90 && map.GetTile(35, 0) === -1, "Resize should keep the tiles that still fit");
        map.Fill(0, 1, 100, 5, "tmYellow");
        c.check(map.GetTiles().slice(10).every(tile => tile === 2), "Fill should set the cells, clipped to the map");
        map.Clear();
        c.check(map.GetTiles().every(tile => tile === -1), "Clear should empty every cell");

        // rects
        const walls = this.AddGameObject(TileMap).SetTileSize(10);
        walls.tiles = [
            [0, 0, 0, -1],
            [0, 0, 0, -1],
            [-1, 0, -1, 0],
        ];
        walls.SetPosition(100, 50);
        const rects = walls.GetRects(tile => tile === 0);
        const area = rects.reduce((sum, r) => sum + r.width * r.height, 0);
        c.check(rects.length === 3 && area === 800 && rects[0].x === 100 && rects[0].y === 50 && rects[0].width === 30 && rects[0].height === 20,
            "GetRects should merge cells into rectangles in world space: " + JSON.stringify(rects));

        // world space
        walls.SetScale(2);
        const cell = walls.WorldToCell(100 + 25, 50 + 45);
        const middle = walls.CellToWorld(1, 2);
        c.check(cell.x === 1 && cell.y === 2, "WorldToCell should follow position and scale: " + cell.x + "," + cell.y);
        c.check(middle.x === 130 && middle.y === 100, "CellToWorld should give the cell's middle: " + middle.x + "," + middle.y);
        c.check(walls.GetTileAt(100 + 25, 50 + 45) === 0 && walls.GetTileAt(0, 0) === -1, "GetTileAt should read the cell under a point");
        const bounds = walls.GetBounds();
        c.check(bounds.width === 80 && bounds.height === 60, "the bounds should cover the map: " + JSON.stringify(bounds));

        // a map in a level file, written as rows; changed, saved and loaded again
        const findMap = () => bare.object.GetAll().find((o): o is TileMap => o instanceof TileMap);
        await bare.level.Load({
            name: "tileMapLevel",
            dimensions: { width: 800, height: 600 },
            entitiesByLayer: { objects: [{
                baseClass: "TileMap", name: "ground", position: { x: 100, y: 50 },
                tileWidth: 10, tileHeight: 10, tileset: ["tmQuad", "tmYellow"],
                tiles: [[0, 0, 0, -1], [0, 0, 0, -1], [-1, 0, -1, 0]],
            }] },
        } as any);
        const fromLevel = findMap();
        c.check(fromLevel && fromLevel.GetTiles().join() === "0,0,0,-1,0,0,0,-1,-1,0,-1,0" && fromLevel.x === 100 && fromLevel.tileWidth === 10,
            "a level should create the map from its rows: " + fromLevel?.GetTiles().join());

        fromLevel?.SetTile(3, 0, "tmYellow", { rotation: 180 });
        const level = bare.level.Serialize();
        const entity: any = Object.values(level.entitiesByLayer).flat().find((e: any) => e.baseClass === "TileMap");
        c.check(entity && typeof entity.tiles === "string" && entity.tileset?.join() === "tmQuad,tmYellow", "the saved level should hold the tiles, encoded, and the tileset: " + JSON.stringify(entity));
        await bare.level.Load(level);
        const loaded = findMap();
        c.check(loaded && loaded.GetTiles().join() === "0,0,0,1,0,0,0,-1,-1,0,-1,0" && loaded.GetTileTransform(3, 0).rotation === 180 && loaded.x === 100,
            "loading the saved level should restore the changed map: " + loaded?.GetTiles().join());

        // a pooled map comes back empty
        loaded?.Remove();
        const reused = this.AddGameObject(TileMap);
        c.check(reused.columns === 0 && reused.tileset.length === 0 && reused.tileWidth === 16, "a reused map should start empty: " + reused.columns + " " + reused.tileset.join());

        c.flush();
    }
}
