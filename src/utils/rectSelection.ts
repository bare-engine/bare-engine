import { keyboardController } from "../controllers/keyboardController";
import { Color, Vec2 } from "../libraries/new-rapid-render";
import type { GameObject } from "../objects/gameObject";
import { Rectangle } from "../types/bareTypes";

export interface RectSelectionCandidate
{
    obj: GameObject;
    rect: Rectangle;
}

// marquee drag shared by the editors (left click, world space) and in-game selection (right click,
// screen space). the caller feeds it points in whatever space it draws in
export class RectSelection
{
    private start: Vec2 | null = null;
    rect: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

    get active(): boolean
    {
        return this.start != null;
    }

    Begin(point: Vec2): void
    {
        this.start = new Vec2(point.x, point.y);
        this.rect = { x: point.x, y: point.y, width: 0, height: 0 };
    }

    Update(point: Vec2): void
    {
        if (!this.start)
            return;

        this.rect = {
            x: Math.min(this.start.x, point.x),
            y: Math.min(this.start.y, point.y),
            width: Math.abs(point.x - this.start.x),
            height: Math.abs(point.y - this.start.y)
        };
    }

    // ends the drag and returns its rect
    End(): Rectangle
    {
        const rect = this.rect;
        this.start = null;
        this.rect = { x: 0, y: 0, width: 0, height: 0 };
        return rect;
    }

    Draw(): void
    {
        if (!this.start)
            return;

        const { x, y, width, height } = this.rect;
        rapid.drawRect({
            width,
            height,
            color: new Color(0, 0, 0, 20),
            position: new Vec2(x, y),
        });
        rapid.drawLine({
            points: [
                new Vec2(x, y),
                new Vec2(x + width, y),
                new Vec2(x + width, y + height),
                new Vec2(x, y + height),
            ],
            width: 2,
            roundCap: false,
            color: Color.fromHex('#dda112'),
            closed: true
        });
    }

    // candidates fully inside rect. alt selects anything the rect touches instead
    static ObjectsIn(rect: Rectangle, candidates: RectSelectionCandidate[]): GameObject[]
    {
        if (rect.width == 0 || rect.height == 0)
            return [];

        const allowPartial = keyboardController.IsKeyDown("alt");
        return candidates
            .filter(candidate => allowPartial
                ? RectSelection.RectOverlaps(rect, candidate.rect)
                : RectSelection.RectContains(rect, candidate.rect))
            .map(candidate => candidate.obj);
    }

    private static RectOverlaps(a: Rectangle, b: Rectangle): boolean
    {
        return a.x <= b.x + b.width &&
            a.x + a.width >= b.x &&
            a.y <= b.y + b.height &&
            a.y + a.height >= b.y;
    }

    private static RectContains(container: Rectangle, target: Rectangle): boolean
    {
        return target.x >= container.x &&
            target.x + target.width <= container.x + container.width &&
            target.y >= container.y &&
            target.y + target.height <= container.y + container.height;
    }
}
