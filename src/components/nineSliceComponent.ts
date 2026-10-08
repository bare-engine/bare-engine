import { Component } from "../controllers/componentController";
import { GameMode } from "../globals";
import { Color } from "../libraries/rapid-render";
import type { GameObject } from "../objects/gameObject";
import { SerializeField } from "../utils/serializeFields";
import { Run } from "../utils/runModes";

// STRETCHES THE OBJECT'S TEXTURE WITHOUT STRETCHING ITS BORDERS: SCALE THE OBJECT TO SET THE SIZE, THE CORNERS KEEP
// THEIR SIZE, THE EDGES STRETCH ALONG ONE AXIS AND THE MIDDLE ALONG BOTH. FOR PANELS, BUTTONS AND OUTLINED BLOCKS.
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

        const w = texture.width;
        const h = texture.height;
        const xs = this.Cuts(w, Math.abs(this.go.scale.x), this.left, this.right);
        const ys = this.Cuts(h, Math.abs(this.go.scale.y), this.top, this.bottom);
        const us = [0, this.left / w, 1 - this.right / w, 1];
        const vs = [0, this.top / h, 1 - this.bottom / h, 1];

        const points: { x: number, y: number }[] = [];
        const uv: { x: number, y: number }[] = [];

        for (let row = 0; row < 3; row++)
        {
            for (let col = 0; col < 3; col++)
            {
                const x0 = xs[col], x1 = xs[col + 1], y0 = ys[row], y1 = ys[row + 1];
                const u0 = us[col], u1 = us[col + 1], v0 = vs[row], v1 = vs[row + 1];

                points.push({ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 });
                uv.push({ x: u0, y: v0 }, { x: u1, y: v0 }, { x: u1, y: v1 }, { x: u0, y: v0 }, { x: u1, y: v1 }, { x: u0, y: v1 });
            }
        }

        rapid.drawGraphic({ points, uv, texture, color, customMatrix: matrixIndex });
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
