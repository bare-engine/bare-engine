import { Color, Texture, Vec2 } from "../libraries/rapid-render";
import { TileRegion } from "../libraries/rapid-render/region/tileRegion";
import type { Scene } from "../scenes/scene";
import type { Entity, Rectangle } from "../types/bareTypes";
import { Hidden, Int, Limit } from "../utils/decorators";
import { SerializeField } from "../utils/serializeFields";
import { GameObject } from "./gameObject";

// ENTITY PROPERTIES FOR this.AddGameObject<TileMap>({ ... })
export interface TileMapEntity extends Entity
{
    tileWidth?: number;
    tileHeight?: number;
    columns?: number;
    rows?: number;
    /** image or animation names; a cell holds an index into this list */
    tileset?: string[];
    /** rows of tileset indices, -1 for empty. Saved levels hold an encoded string instead */
    tiles?: number[][] | string;
}

/** how a tile is turned and mirrored in its cell. The flips apply to the image before the turn */
export interface TileTransform
{
    /** clockwise, in degrees */
    rotation?: 0 | 90 | 180 | 270;
    flipX?: boolean;
    flipY?: boolean;
}

const EMPTY = -1;
const DEFAULT_TILE_SIZE = 16;
const DEFS_WIDTH = 256; // texels per row of the definitions texture, the same in tile.vert
const MAX_TILES = 0xFFFF - 1;

interface TileFrame
{
    name: string;
    texture: Texture;
}

interface TileGpu
{
    buffer: WebGLBuffer;
    bufferLength: number;
    defs: WebGLTexture | null;
    frameBase: number;
    textures: (WebGLTexture | null)[];
}

/**
 * A grid of tiles drawn as one object, for ground, walls and other maps made of cells.
 * Each tile is an image or animation from the tileset, so drawing doesn't create a GameObject
 * per cell: the cells live on the GPU, only changed chunks are uploaded again, and only the
 * chunks the camera sees are drawn. A map is one layer of tiles; put several maps on different
 * layers to draw objects in between.
 */
export class TileMap extends GameObject
{
    declare entity: TileMapEntity | null;

    /** cells per side of a chunk, a power of two. Read when a map's cells are created */
    static chunkSize = 32;

    @SerializeField @Limit(0, Infinity)
    tileWidth: number = DEFAULT_TILE_SIZE;

    @SerializeField @Limit(0, Infinity)
    tileHeight: number = DEFAULT_TILE_SIZE;

    /** seconds animated tiles have played; advances in OnUpdate */
    animationTime: number = 0;

    private cols = 0;
    private rowCount = 0;
    private shift = 5;
    private chunksX = 0;
    private chunksY = 0;
    // one uint32 per cell: tile index + 1 in the low 16 bits (0 is empty), the transform above that.
    // ordered chunk after chunk, each chunk row by row, which is also how the GPU buffer holds them
    private cells = new Uint32Array(0);

    private names: string[] = [];
    private nameIndex = new Map<string, number>();

    private chunkDirty = new Uint8Array(0);
    private dirtyChunks: number[] = [];
    private _allDirty = true;
    // the tiles field, kept until a cell changes: the editor's inspector reads it often
    private encoded: string | null = null;

    private gpu: TileGpu | null = null;
    private defsDirty = true;
    private frames: TileFrame[] = [];
    private waitingFor = new Set<string>();

    private drawMatrix = new Float32Array(6);
    private tint = new Float32Array(4);
    private ranges: number[] = [];

    constructor(scene: Scene)
    {
        super(scene);
        this.SetChunkSize(TileMap.chunkSize);
    }

    // ---- SERIALIZED FIELDS ----

    @SerializeField @Int @Limit(0, Infinity)
    get columns(): number { return this.cols; }
    set columns(value: number) { this.Resize(value, this.rowCount); }

    @SerializeField @Int @Limit(0, Infinity)
    get rows(): number { return this.rowCount; }
    set rows(value: number) { this.Resize(this.cols, value); }

    @SerializeField
    get tileset(): string[] { return this.names.slice(); }
    set tileset(names: string[])
    {
        this.names = [...(names ?? [])];
        this.nameIndex.clear();
        this.names.forEach((name, i) => this.nameIndex.has(name) || this.nameIndex.set(name, i));
        this.defsDirty = true;
    }

    // "<columns>x<rows>:" then base64 of [run length, cell] pairs, row by row. Also takes rows of
    // tileset indices (-1 for empty), which is easier to write by hand or from a script
    @SerializeField @Hidden
    get tiles(): string { return this.EncodeTiles(); }
    set tiles(value: string | number[][] | number[])
    {
        if (typeof value === "string")
            this.DecodeTiles(value);
        else if (Array.isArray(value) && Array.isArray(value[0]))
            this.SetRows(value as number[][]);
        else if (Array.isArray(value))
            this.SetTiles(value as number[]);
    }

    // ---- SIZE ----

    /** map width in world units, before scaling */
    get mapWidth(): number { return this.cols * this.tileWidth; }

    /** map height in world units, before scaling */
    get mapHeight(): number { return this.rowCount * this.tileHeight; }

    SetTileSize(width: number, height: number = width): this
    {
        this.tileWidth = width;
        this.tileHeight = height;
        return this;
    }

    /** changes the number of cells, keeping the tiles that still fit */
    Resize(columns: number, rows: number): this
    {
        columns = Math.max(0, Math.floor(columns || 0));
        rows = Math.max(0, Math.floor(rows || 0));
        if (columns === this.cols && rows === this.rowCount)
            return this;

        const old = this.cells;
        const oldCols = this.cols;
        const oldRows = this.rowCount;
        const oldChunksX = this.chunksX;

        this.cols = columns;
        this.rowCount = rows;
        this.chunksX = Math.ceil(columns / this.chunkSize);
        this.chunksY = Math.ceil(rows / this.chunkSize);
        this.cells = new Uint32Array(this.chunksX * this.chunksY * this.cellsPerChunk);
        this.chunkDirty = new Uint8Array(this.chunksX * this.chunksY);
        this.dirtyChunks.length = 0;
        this.allDirty = true;

        const keepCols = Math.min(columns, oldCols);
        const keepRows = Math.min(rows, oldRows);
        for (let row = 0; row < keepRows; row++)
            for (let col = 0; col < keepCols; col++)
                this.cells[this.Index(col, row)] = old[this.IndexIn(col, row, oldChunksX)];

        return this;
    }

    // ---- TILES ----

    InBounds(col: number, row: number): boolean
    {
        return col >= 0 && row >= 0 && col < this.cols && row < this.rowCount;
    }

    /**
     * Puts a tile in a cell: a tileset index, or an image or animation name (added to the tileset
     * when it isn't in it yet). null or -1 empties the cell. Cells outside the map are ignored.
     */
    SetTile(col: number, row: number, tile: number | string | null, transform?: TileTransform): this
    {
        if (!this.InBounds(col, row))
            return this;

        const value = this.CellValue(tile, transform);
        const i = this.Index(col, row);
        if (this.cells[i] !== value)
        {
            this.cells[i] = value;
            this.MarkChunkDirty(Math.floor(i / this.cellsPerChunk));
        }
        return this;
    }

    /** the tileset index in a cell, -1 when it's empty or outside the map */
    GetTile(col: number, row: number): number
    {
        if (!this.InBounds(col, row))
            return EMPTY;
        return (this.cells[this.Index(col, row)] & 0xFFFF) - 1;
    }

    /** the image or animation name in a cell, null when it's empty or outside the map */
    GetTileName(col: number, row: number): string | null
    {
        const tile = this.GetTile(col, row);
        return tile === EMPTY ? null : this.names[tile] ?? null;
    }

    GetTileTransform(col: number, row: number): TileTransform
    {
        const flags = this.InBounds(col, row) ? this.cells[this.Index(col, row)] >>> 16 : 0;
        return {
            rotation: ((flags & 3) * 90) as TileTransform["rotation"],
            flipX: (flags & 4) !== 0,
            flipY: (flags & 8) !== 0,
        };
    }

    /** the tile under a point in world space, -1 when there's none */
    GetTileAt(x: number, y: number): number
    {
        const cell = this.WorldToCell(x, y);
        return this.GetTile(cell.x, cell.y);
    }

    /** sets every cell of a rectangle, clipped to the map */
    Fill(col: number, row: number, columns: number, rows: number, tile: number | string | null, transform?: TileTransform): this
    {
        const value = this.CellValue(tile, transform);
        const col0 = Math.max(0, col), row0 = Math.max(0, row);
        const col1 = Math.min(this.cols, col + columns), row1 = Math.min(this.rowCount, row + rows);

        for (let r = row0; r < row1; r++)
            for (let c = col0; c < col1; c++)
            {
                const i = this.Index(c, r);
                if (this.cells[i] !== value)
                {
                    this.cells[i] = value;
                    this.MarkChunkDirty(Math.floor(i / this.cellsPerChunk));
                }
            }
        return this;
    }

    /** empties every cell */
    Clear(): this
    {
        this.cells.fill(0);
        this.allDirty = true;
        return this;
    }

    /**
     * Sets the whole map from tileset indices, row after row (-1 for empty). Resizes the map to
     * `columns` wide and as many rows as the tiles fill.
     */
    SetTiles(tiles: ArrayLike<number>, columns: number = this.cols): this
    {
        if (columns <= 0)
            return this;

        this.Resize(columns, Math.ceil(tiles.length / columns));
        this.cells.fill(0);
        for (let i = 0; i < tiles.length; i++)
        {
            const tile = tiles[i];
            if (tile >= 0)
                this.cells[this.Index(i % columns, Math.floor(i / columns))] = this.CellValue(tile);
        }
        this.allDirty = true;
        return this;
    }

    /** every cell's tileset index, row after row, -1 for empty */
    GetTiles(): Int32Array
    {
        const out = new Int32Array(this.cols * this.rowCount);
        for (let row = 0; row < this.rowCount; row++)
            for (let col = 0; col < this.cols; col++)
                out[row * this.cols + col] = (this.cells[this.Index(col, row)] & 0xFFFF) - 1;
        return out;
    }

    /** the tileset index of an image or animation name, adding it to the tileset when it isn't in it */
    GetTileIndex(name: string): number
    {
        let index = this.nameIndex.get(name);
        if (index === undefined)
        {
            if (this.names.length >= MAX_TILES)
                throw new Error(`TileMap: a tileset holds at most ${MAX_TILES} tiles`);
            index = this.names.length;
            this.names.push(name);
            this.nameIndex.set(name, index);
            this.defsDirty = true;
        }
        return index;
    }

    // ---- WORLD SPACE ----

    /** the cell under a point in world space, as (column, row). It can lie outside the map */
    WorldToCell(x: number, y: number): Vec2
    {
        const [a, b, c, d, e, f] = this.GetContentAffine();
        const det = a * d - b * c;
        if (det === 0)
            return new Vec2(EMPTY, EMPTY);

        const px = x - e, py = y - f;
        const lx = (d * px - c * py) / det;
        const ly = (a * py - b * px) / det;
        return new Vec2(Math.floor(lx / this.tileWidth), Math.floor(ly / this.tileHeight));
    }

    /** the middle of a cell in world space */
    CellToWorld(col: number, row: number): Vec2
    {
        return this.ContentToGlobal(new Vec2((col + 0.5) * this.tileWidth, (row + 0.5) * this.tileHeight), true);
    }

    /**
     * Rectangles in world space that together cover every cell `test` accepts, merged into as few
     * as it can, eg to create a static collider per rectangle for walls. For a turned map they're
     * the bounding boxes of the turned rectangles.
     */
    GetRects(test: (tile: number, col: number, row: number) => boolean): Rectangle[]
    {
        const cols = this.cols, rows = this.rowCount;
        const taken = new Uint8Array(cols * rows);
        const accepts = (col: number, row: number) =>
            !taken[row * cols + col] && test(this.GetTile(col, row), col, row);

        const [a, b, c, d, e, f] = this.GetContentAffine();
        const rects: Rectangle[] = [];

        for (let row = 0; row < rows; row++)
            for (let col = 0; col < cols; col++)
            {
                if (!accepts(col, row))
                    continue;

                let width = 1;
                while (col + width < cols && accepts(col + width, row))
                    width++;

                let height = 1;
                grow: while (row + height < rows)
                {
                    for (let i = 0; i < width; i++)
                        if (!accepts(col + i, row + height))
                            break grow;
                    height++;
                }

                for (let r = row; r < row + height; r++)
                    taken.fill(1, r * cols + col, r * cols + col + width);

                const x0 = col * this.tileWidth, y0 = row * this.tileHeight;
                const x1 = (col + width) * this.tileWidth, y1 = (row + height) * this.tileHeight;
                const xs = [a * x0 + c * y0 + e, a * x1 + c * y0 + e, a * x0 + c * y1 + e, a * x1 + c * y1 + e];
                const ys = [b * x0 + d * y0 + f, b * x1 + d * y0 + f, b * x0 + d * y1 + f, b * x1 + d * y1 + f];
                const minX = Math.min(...xs), minY = Math.min(...ys);
                rects.push({ x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY });
            }

        return rects;
    }

    // ---- GAMEOBJECT ----

    override GetLocalContentBounds(): Rectangle | null
    {
        return { x: 0, y: 0, width: this.mapWidth, height: this.mapHeight };
    }

    // a tile map draws its tiles, never a texture of its own (eg from the ANY prefab)
    override SetTexture(texture: Texture): this
    {
        return this;
    }

    override OnUpdate(deltaTime: number): void
    {
        this.animationTime += deltaTime;
    }

    override OnRender(inheritedColor?: Color): void
    {
        this.DrawTiles(inheritedColor ?? this.color);
    }

    override ResetValues(): this
    {
        super.ResetValues();

        // also runs from GameObject's constructor, before this class's fields exist
        if (!this.cells)
            return this;

        this.FreeGpu();
        this.tileWidth = DEFAULT_TILE_SIZE;
        this.tileHeight = DEFAULT_TILE_SIZE;
        this.animationTime = 0;
        this.tileset = [];
        this.SetChunkSize(TileMap.chunkSize);
        this.Resize(0, 0);
        return this;
    }

    override ReleaseResources(): void
    {
        super.ReleaseResources();
        this.FreeGpu();
    }

    // ---- CELLS ----

    private get chunkSize(): number { return 1 << this.shift; }
    private get cellsPerChunk(): number { return 1 << (this.shift * 2); }

    private SetChunkSize(size: number)
    {
        const shift = Math.round(Math.log2(Math.max(1, size)));
        if (1 << shift !== size)
            console.warn(`TileMap.chunkSize should be a power of two, using ${1 << shift}`);
        if (shift === this.shift && this.cells.length > 0)
            return;

        const cols = this.cols, rows = this.rowCount;
        const tiles = this.GetTiles();
        this.shift = shift;
        this.cols = this.rowCount = 0;
        this.Resize(cols, rows);
        for (let i = 0; i < tiles.length; i++)
            if (tiles[i] >= 0)
                this.cells[this.Index(i % cols, Math.floor(i / cols))] = (tiles[i] + 1) >>> 0;
    }

    private Index(col: number, row: number): number
    {
        return this.IndexIn(col, row, this.chunksX);
    }

    private IndexIn(col: number, row: number, chunksX: number): number
    {
        const shift = this.shift, mask = (1 << shift) - 1;
        const chunk = (row >> shift) * chunksX + (col >> shift);
        return chunk * (1 << (shift * 2)) + ((row & mask) << shift) + (col & mask);
    }

    private CellValue(tile: number | string | null, transform?: TileTransform): number
    {
        const index = typeof tile === "string" ? this.GetTileIndex(tile) : tile ?? EMPTY;
        if (index < 0)
            return 0;
        if (index > MAX_TILES)
            throw new Error(`TileMap: tile index ${index} is above the maximum of ${MAX_TILES}`);

        let flags = 0;
        if (transform)
        {
            flags = Math.round((transform.rotation ?? 0) / 90) & 3;
            if (transform.flipX) flags |= 4;
            if (transform.flipY) flags |= 8;
        }
        return ((index + 1) | (flags << 16)) >>> 0;
    }

    // every change to the cells goes through here or allDirty
    private get allDirty(): boolean { return this._allDirty; }
    private set allDirty(value: boolean)
    {
        this._allDirty = value;
        if (value)
            this.encoded = null;
    }

    private MarkChunkDirty(chunk: number)
    {
        this.encoded = null;
        if (this.chunkDirty[chunk])
            return;
        this.chunkDirty[chunk] = 1;
        this.dirtyChunks.push(chunk);
    }

    private SetRows(rows: number[][])
    {
        const columns = Math.max(0, ...rows.map(row => row?.length ?? 0));
        const flat = new Int32Array(columns * rows.length).fill(EMPTY);
        rows.forEach((row, r) => row?.forEach((tile, c) => flat[r * columns + c] = tile ?? EMPTY));
        if (columns > 0)
            this.SetTiles(flat, columns);
        else
            this.Resize(0, rows.length);
    }

    private EncodeTiles(): string
    {
        if (this.encoded !== null)
            return this.encoded;

        const runs: number[] = [];
        let run = 0, previous = -1;
        for (let row = 0; row < this.rowCount; row++)
            for (let col = 0; col < this.cols; col++)
            {
                const value = this.cells[this.Index(col, row)];
                if (value === previous && run < 0xFFFFFFFF)
                    run++;
                else
                {
                    if (run > 0)
                        runs.push(run, previous);
                    run = 1;
                    previous = value;
                }
            }
        if (run > 0)
            runs.push(run, previous);

        const bytes = new Uint8Array(new Uint32Array(runs).buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return this.encoded = `${this.cols}x${this.rowCount}:${btoa(binary)}`;
    }

    private DecodeTiles(value: string)
    {
        const match = /^(\d+)x(\d+):(.*)$/s.exec(value.trim());
        if (!match)
        {
            console.warn(`TileMap: can't read tiles "${value.slice(0, 40)}"`);
            return;
        }

        const columns = +match[1], rows = +match[2];
        const binary = atob(match[3]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);
        const runs = new Uint32Array(bytes.buffer, 0, bytes.length >> 2);

        this.Resize(columns, rows);
        this.cells.fill(0);
        let cell = 0;
        const total = columns * rows;
        for (let i = 0; i + 1 < runs.length && cell < total; i += 2)
        {
            const end = Math.min(total, cell + runs[i]);
            const v = runs[i + 1];
            for (; cell < end; cell++)
                if (v !== 0)
                    this.cells[this.Index(cell % columns, Math.floor(cell / columns))] = v;
        }
        this.allDirty = true;
    }

    // the transform tiles are drawn in, local to world: a, b, c, d, tx, ty
    private GetContentAffine(): number[]
    {
        const origin = this.ContentToGlobal(new Vec2(0, 0), true);
        const xAxis = this.ContentToGlobal(new Vec2(1, 0), true);
        const yAxis = this.ContentToGlobal(new Vec2(0, 1), true);
        return [xAxis.x - origin.x, xAxis.y - origin.y, yAxis.x - origin.x, yAxis.y - origin.y, origin.x, origin.y];
    }

    // ---- DRAWING ----

    private DrawTiles(color: Color)
    {
        if (this.cols === 0 || this.rowCount === 0 || color.a === 0)
            return;

        const region = TileRegion.Get(rapid);
        const gpu = this.gpu ??= this.CreateGpu();

        if (this.defsDirty || this.TexturesChanged())
            this.BuildDefs(gpu, region.maxTextures);
        if (!gpu.defs)
            return;

        this.Upload(gpu);

        const stack = rapid.matrixStack;
        this.drawMatrix.set(rapid.matrix.getMatrixRef(stack.curWorldM));
        const rangeCount = this.FindVisibleRanges(this.drawMatrix);
        if (rangeCount === 0)
            return;

        const alpha = color.a / 255;
        const scale = rapid.premultipliedAlpha ? alpha / 255 : 1 / 255;
        this.tint[0] = color.r * scale;
        this.tint[1] = color.g * scale;
        this.tint[2] = color.b * scale;
        this.tint[3] = alpha;

        region.drawLayer({
            buffer: gpu.buffer,
            defs: gpu.defs,
            frameBase: gpu.frameBase,
            textures: gpu.textures,
            chunkShift: this.shift,
            chunksX: this.chunksX,
            tileWidth: this.tileWidth,
            tileHeight: this.tileHeight,
            time: this.animationTime,
            tint: this.tint,
            matrix: this.drawMatrix,
            ranges: this.ranges,
            rangeCount,
        });
    }

    // the chunks on screen, as ranges of cells in the buffer: one per row of chunks,
    // or one in all when the map's whole width is on screen
    private FindVisibleRanges(m: Float32Array): number
    {
        // local -> clip space is the projection after the map's transform. Invert it to find
        // what part of the map the screen's corners (-1..1 in clip space) cover
        const p = rapid.projection;
        const a = p[0] * m[0] + p[4] * m[1], c = p[0] * m[2] + p[4] * m[3], e = p[0] * m[4] + p[4] * m[5] + p[12];
        const b = p[1] * m[0] + p[5] * m[1], d = p[1] * m[2] + p[5] * m[3], f = p[1] * m[4] + p[5] * m[5] + p[13];
        const det = a * d - b * c;
        if (det === 0 || !Number.isFinite(det))
            return 0;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let corner = 0; corner < 4; corner++)
        {
            const px = (corner & 1 ? 1 : -1) - e;
            const py = (corner & 2 ? 1 : -1) - f;
            const x = (d * px - c * py) / det;
            const y = (a * py - b * px) / det;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }

        const chunkWidth = this.chunkSize * this.tileWidth;
        const chunkHeight = this.chunkSize * this.tileHeight;
        const cx0 = Math.max(0, Math.floor(minX / chunkWidth));
        const cy0 = Math.max(0, Math.floor(minY / chunkHeight));
        const cx1 = Math.min(this.chunksX - 1, Math.floor(maxX / chunkWidth));
        const cy1 = Math.min(this.chunksY - 1, Math.floor(maxY / chunkHeight));
        if (cx0 > cx1 || cy0 > cy1)
            return 0;

        const perChunk = this.cellsPerChunk;
        const ranges = this.ranges;
        if (cx0 === 0 && cx1 === this.chunksX - 1)
        {
            ranges[0] = cy0 * this.chunksX * perChunk;
            ranges[1] = (cy1 - cy0 + 1) * this.chunksX * perChunk;
            return 1;
        }

        let count = 0;
        for (let cy = cy0; cy <= cy1; cy++, count++)
        {
            ranges[count * 2] = (cy * this.chunksX + cx0) * perChunk;
            ranges[count * 2 + 1] = (cx1 - cx0 + 1) * perChunk;
        }
        return count;
    }

    private CreateGpu(): TileGpu
    {
        return { buffer: rapid.gl.createBuffer()!, bufferLength: 0, defs: null, frameBase: 0, textures: [] };
    }

    private FreeGpu()
    {
        const gpu = this.gpu;
        if (!gpu)
            return;
        const gl = rapid.gl;
        gl.deleteBuffer(gpu.buffer);
        if (gpu.defs)
            gl.deleteTexture(gpu.defs);
        this.gpu = null;
        this.defsDirty = true;
        this.allDirty = true;
    }

    private Upload(gpu: TileGpu)
    {
        const gl = rapid.gl;
        if (!this.allDirty && this.dirtyChunks.length === 0)
            return;

        gl.bindBuffer(gl.ARRAY_BUFFER, gpu.buffer);
        if (this.allDirty || gpu.bufferLength !== this.cells.length)
        {
            gl.bufferData(gl.ARRAY_BUFFER, this.cells, gl.DYNAMIC_DRAW);
            gpu.bufferLength = this.cells.length;
        }
        else
        {
            const perChunk = this.cellsPerChunk;
            for (const chunk of this.dirtyChunks)
                gl.bufferSubData(gl.ARRAY_BUFFER, chunk * perChunk * 4, this.cells, chunk * perChunk, perChunk);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        for (const chunk of this.dirtyChunks)
            this.chunkDirty[chunk] = 0;
        this.dirtyChunks.length = 0;
        this.allDirty = false;
    }

    // whether an image the tileset uses was replaced, eg when the atlas reloads in development
    private TexturesChanged(): boolean
    {
        const textures = bare.asset.textures;
        for (const frame of this.frames)
            if (textures.get(frame.name) !== frame.texture)
                return true;
        return this.waitingFor.size > 0 && [...this.waitingFor].some(name => textures.has(name));
    }

    // the tiles' textures can still be loading: those tiles draw nothing until they're in
    private ResolveFrames(name: string): { frames: string[], fps: number }
    {
        if (bare.asset.HasTexture(name))
            return { frames: [name], fps: 0 };

        const animation = bare.asset.GetAnimation(name);
        if (animation)
            return { frames: animation.frames, fps: animation.framesPerSecond };

        return { frames: [name], fps: 0 };
    }

    private BuildDefs(gpu: TileGpu, maxTextures: number)
    {
        this.defsDirty = false;
        this.frames.length = 0;
        this.waitingFor.clear();

        const tiles: number[] = [];
        const frameTexels: number[] = [];
        const units = new Map<WebGLTexture, number>();
        gpu.textures.length = 0;

        for (const name of this.names)
        {
            const { frames, fps } = this.ResolveFrames(name);
            const first = frameTexels.length / 8;
            let count = 0;

            for (const frameName of frames)
            {
                const texture = this.GetFrameTexture(frameName);
                if (!texture?.glTexture || !texture.base)
                    continue;

                let unit = units.get(texture.glTexture);
                if (unit === undefined)
                {
                    if (units.size >= maxTextures)
                    {
                        console.warn(`TileMap: a map can draw from ${maxTextures} textures at most, "${frameName}" isn't drawn. Put its images in the atlas`);
                        continue;
                    }
                    unit = units.size;
                    units.set(texture.glTexture, unit);
                    gpu.textures.push(texture.glTexture);
                }

                if (__DEV__ && texture.isRotated)
                    console.warn(`TileMap: "${frameName}" is turned in its atlas, which tiles don't support`);

                this.frames.push({ name: frameName, texture });
                frameTexels.push(
                    texture.uvX, texture.uvY, texture.uvW, texture.uvH,
                    unit, 0.5 / texture.base.width, 0.5 / texture.base.height, 0,
                );
                count++;
            }

            tiles.push(first, count, fps, 0);
        }

        const frameBase = tiles.length / 4;
        const texels = frameBase + frameTexels.length / 4;
        const height = Math.max(1, Math.ceil(texels / DEFS_WIDTH));
        const data = new Float32Array(DEFS_WIDTH * height * 4);
        data.set(tiles);
        data.set(frameTexels, tiles.length);

        const gl = rapid.gl;
        gpu.defs ??= gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, gpu.defs);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, DEFS_WIDTH, height, 0, gl.RGBA, gl.FLOAT, data);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gpu.frameBase = frameBase;
    }

    // a loaded texture, or null while it loads. Images outside the atlas load on first use;
    // one that fails to load draws as the red placeholder, like a sprite's
    private GetFrameTexture(name: string): Texture | null
    {
        const texture = bare.asset.textures.get(name);
        if (texture)
            return texture;

        if (TileMap.failedTextures.has(name))
            return bare.asset.missingTexture;

        this.waitingFor.add(name);
        bare.asset.LoadTexture(name).then(loaded => {
            if (loaded === bare.asset.missingTexture && !TileMap.failedTextures.has(name))
            {
                TileMap.failedTextures.add(name);
                console.warn(`TileMap: no image "${name}" in the atlas or in ${bare.imagePath}`);
            }
            this.defsDirty = true;
        });
        return null;
    }

    private static failedTextures = new Set<string>();
}
