import { Component } from "../controllers/componentController";
import { GameMode } from "../globals";
import { Color, Vec2 } from "../libraries/rapid-render";
import type { GameObject } from "../objects/gameObject";
import { SerializeField } from "../utils/serializeFields";
import { Run } from "../utils/runModes";

// REPEATS THE OBJECT'S TEXTURE INSTEAD OF STRETCHING IT: SCALE THE OBJECT TO SET THE AREA,
// EVERY REPEAT KEEPS THE TEXTURE'S OWN SIZE TIMES tileScale.
// IT TAKES OVER THE OBJECT'S RenderSprite, SO NOTHING OF THIS ENDS UP IN GAMES THAT DON'T USE IT
@Run(GameMode.Edit, GameMode.Play)
export class TiledComponent extends Component
{
    // SIZE OF ONE REPEAT, RELATIVE TO THE TEXTURE'S OWN SIZE
    @SerializeField(GameMode.Edit)
    tileScale: number = 1;

    // TILES PER SECOND THE TEXTURE MOVES, EG FOR A CONVEYOR OR FLOWING WATER. IN THE OBJECT'S OWN DIRECTION, SO IT TURNS WITH IT
    @SerializeField(GameMode.Edit)
    scroll: Vec2 = new Vec2();

    // HOW FAR IT HAS SCROLLED, IN TILES, KEPT WITHIN 0..1
    private scrollX: number = 0;
    private scrollY: number = 0;

    override OnAdded(go: GameObject): void
    {
        this.Attach(go);
    }

    override OnEnable(): void
    {
        this.Attach(this.go);
    }

    override OnUpdate(deltaTime: number): void
    {
        this.scrollX = (this.scrollX + this.scroll.x * deltaTime) % 1;
        this.scrollY = (this.scrollY + this.scroll.y * deltaTime) % 1;
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
            this.RenderTiles(color ?? go.color, matrixIndex);
    }

    // BACK TO THE PROTOTYPE'S RenderSprite, ALSO FOR POOLED OBJECTS THAT GET REUSED
    private Detach(): void
    {
        delete (this.go as Partial<GameObject>).RenderSprite;
    }

    // DRAWS IN TEXTURE SPACE: THE OBJECT COVERS 0..TEXTURE WIDTH, 0..TEXTURE HEIGHT. OVERRIDE TO DRAW TILES DIFFERENTLY
    RenderTiles(color: Color, matrixIndex: number): void
    {
        const texture = this.go.texture;
        if (!texture)
            return;

        const w = texture.width;
        const h = texture.height;
        const u = Math.abs(this.go.scale.x) / this.tileScale;
        const v = Math.abs(this.go.scale.y) / this.tileScale;
        // MOVING THE UVS BACK MOVES THE TEXTURE FORWARD
        const u0 = -this.scrollX;
        const v0 = -this.scrollY;

        rapid.drawGraphic({
            points: [
                { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h },
                { x: 0, y: 0 }, { x: w, y: h }, { x: 0, y: h },
            ],
            uv: [
                { x: u0, y: v0 }, { x: u0 + u, y: v0 }, { x: u0 + u, y: v0 + v },
                { x: u0, y: v0 }, { x: u0 + u, y: v0 + v }, { x: u0, y: v0 + v },
            ],
            texture,
            repeatTexture: true,
            color,
            customMatrix: matrixIndex,
        });
    }
}
