import { Component } from "../controllers/componentController";
import { GameMode } from "../globals";
import { Color } from "../libraries/rapid-render";
import type { GameObject } from "../objects/gameObject";
import { PrefabScene } from "../scenes/prefabScene";
import { SerializeField } from "../utils/serializeFields";
import { Run } from "../utils/runModes";

// STRETCHES THE OBJECT'S TEXTURE WITHOUT STRETCHING ITS BORDERS: SCALE THE OBJECT TO SET THE SIZE, THE CORNERS KEEP
// THEIR SIZE, THE EDGES STRETCH (OR TILE) ALONG ONE AXIS AND THE MIDDLE ALONG BOTH. FOR PANELS, BUTTONS AND OUTLINED BLOCKS.
// IT TAKES OVER THE OBJECT'S RenderSprite, LIKE TiledComponent, SO NOTHING OF THIS ENDS UP IN GAMES THAT DON'T USE IT
@Run(GameMode.Edit, GameMode.Play)
export class NineSliceComponent extends Component
{
    // BORDER WIDTHS, IN TEXTURE PIXELS
    @SerializeField(GameMode.Edit)
    left: number = 8;

    @SerializeField(GameMode.Edit)
    top: number = 8;

    @SerializeField(GameMode.Edit)
    right: number = 8;

    @SerializeField(GameMode.Edit)
    bottom: number = 8;

    // SIZE OF THE BORDERS IN GAME UNITS PER TEXTURE PIXEL. 0.5 FOR ART DRAWN AT 2X
    @SerializeField(GameMode.Edit)
    borderScale: number = 1;

    // REPEAT THE MIDDLE (AND THE EDGES ALONG IT) INSTEAD OF STRETCHING IT. A WHOLE NUMBER OF TILES IS FITTED,
    // EACH STRETCHED SLIGHTLY, SO NONE IS CUT OFF. LIKE PHASER'S tileX / tileY AND CSS border-image-repeat: round
    @SerializeField(GameMode.Edit)
    tileX: boolean = false;

    @SerializeField(GameMode.Edit)
    tileY: boolean = false;

    override OnAdded(go: GameObject): void
    {
        this.Attach(go);
    }

    override OnEnable(): void
    {
        this.Attach(this.go);
    }

    override OnDisable(): void
    {
        this.Detach();
    }

    override OnRemoved(): void
    {
        this.Detach();
    }

    private Attach(go: GameObject): void
    {
        go.RenderSprite = (color?: Color, matrixIndex: number = rapid.matrixStack.curWorldM) =>
            this.RenderSlices(color ?? go.color, matrixIndex);
    }

    // BACK TO THE PROTOTYPE'S RenderSprite, ALSO FOR POOLED OBJECTS THAT GET REUSED
    private Detach(): void
    {
        delete (this.go as Partial<GameObject>).RenderSprite;
    }

    // DRAWS IN TEXTURE SPACE: THE OBJECT COVERS 0..TEXTURE WIDTH, 0..TEXTURE HEIGHT, AND ITS SCALE IS APPLIED AFTER.
    // SO A BORDER THAT SHOULDN'T SCALE IS DIVIDED BY THE SCALE HERE
    RenderSlices(color: Color, matrixIndex: number): void
    {
        const texture = this.go.texture;
        if (!texture)
            return;

        const xs = this.Segments(texture.width, Math.abs(this.go.scale.x), this.left, this.right, this.tileX);
        const ys = this.Segments(texture.height, Math.abs(this.go.scale.y), this.top, this.bottom, this.tileY);

        const points: { x: number, y: number }[] = [];
        const uv: { x: number, y: number }[] = [];

        for (const [y0, y1, v0, v1] of ys)
        {
            for (const [x0, x1, u0, u1] of xs)
            {
                points.push({ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 });
                uv.push({ x: u0, y: v0 }, { x: u1, y: v0 }, { x: u1, y: v1 }, { x: u0, y: v0 }, { x: u1, y: v1 }, { x: u0, y: v1 });
            }
        }

        rapid.drawGraphic({ points, uv, texture, color, customMatrix: matrixIndex });

        if (this.go.scene instanceof PrefabScene)
            this.RenderGuides(xs, ys, matrixIndex);
    }

    // prefab editor only: a line on each of the four cuts (left, right, top, bottom), so you can see where the borders end.
    // drawn in texture space like the slices, so the line widths are divided by the scale to stay the same on screen
    private RenderGuides(xs: number[][], ys: number[][], matrixIndex: number): void
    {
        const w = this.go.texture!.width;
        const h = this.go.texture!.height;
        const px = this.go.scene?.ScreenPxToWorldScale() ?? 1;
        const hw = px / Math.abs(this.go.scale.x || 1) * 0.5;
        const hh = px / Math.abs(this.go.scale.y || 1) * 0.5;

        const points: { x: number, y: number }[] = [];
        const quad = (x0: number, y0: number, x1: number, y1: number) =>
            points.push({ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 });

        for (const x of [xs[0][1], xs[xs.length - 1][0]])
            quad(x - hw, 0, x + hw, h);
        for (const y of [ys[0][1], ys[ys.length - 1][0]])
            quad(0, y - hh, w, y + hh);

        rapid.drawGraphic({ points, color: new Color(255, 0, 255, 200), customMatrix: matrixIndex });
    }

    // THE SLICES ALONG ONE AXIS AS [START, END, UV START, UV END]: THE START BORDER, THE MIDDLE (ONE STRETCHED PIECE,
    // OR REPEATED TILES WHEN tile IS SET) AND THE END BORDER
    private Segments(size: number, scale: number, start: number, end: number, tile: boolean): number[][]
    {
        const [c0, c1, c2, c3] = this.Cuts(size, scale, start, end);
        const t1 = start / size;
        const t2 = 1 - end / size;

        // NATURAL SIZE OF ONE MIDDLE TILE IN TEXTURE SPACE, THE SAME WAY THE BORDERS ARE SIZED
        const tileSize = (size - start - end) * this.borderScale / scale;
        const count = tile && tileSize > 0 ? Math.max(1, Math.round((c2 - c1) / tileSize)) : 1;
        const step = (c2 - c1) / count;

        const segments = [[c0, c1, 0, t1]];
        for (let i = 0; i < count; i++)
            segments.push([c1 + step * i, c1 + step * (i + 1), t1, t2]);
        segments.push([c2, c3, t2, 1]);

        return segments;
    }

    // THE FOUR EDGES OF THE SLICES ALONG ONE AXIS, IN TEXTURE SPACE. WHEN THE OBJECT IS SMALLER THAN ITS TWO BORDERS,
    // THE BORDERS SHRINK TOGETHER SO THEY STILL FIT
    private Cuts(size: number, scale: number, start: number, end: number): number[]
    {
        let a = start * this.borderScale / scale;
        let b = end * this.borderScale / scale;

        if (a + b > size)
        {
            const fit = size / (a + b);
            a *= fit;
            b *= fit;
        }

        return [0, a, size - b, size];
    }
}
