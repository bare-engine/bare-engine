import { Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject"
import { HitboxType, Rectangle, Rectangle2Vec } from "./bareTypes";

export class Hitbox
{
    active:boolean;
    shouldReleaseOnTop:boolean;
    parent:GameObject;

    type:HitboxType;
    radius:number;
    rectangle:Rectangle;
    circleOffset: Vec2 = new Vec2(0, 0);

    OnEnter:(parent: GameObject) => void;
    OnLeave:(parent: GameObject) => void;
    OnPress:(parent: GameObject, event: PointerEvent) => void;
    OnRelease:(parent: GameObject, event: PointerEvent) => void;

	constructor(parent:GameObject, data:number | Rectangle2Vec)
	{
        this.active = true;
        this.shouldReleaseOnTop = true;
        
        var type = typeof data === 'number' ? HitboxType.Circle : HitboxType.Rectangle;
        this.type = type;

        if (type == HitboxType.Rectangle)
        {
            var dataRect2Vec = data as Rectangle2Vec;
            this.rectangle = {x: dataRect2Vec.x1, y: dataRect2Vec.y1, width: dataRect2Vec.x2 - dataRect2Vec.x1, height: dataRect2Vec.y2 - dataRect2Vec.y1};
        }
        else
        if (type == HitboxType.Circle)
        {
            this.radius = data as number;
        }
        
        this.SetParent(parent);
    }

    SetParent(parent:GameObject):void
    {
        this.parent = parent;
    }

    GetRadius():number
    {
        if (this.radius)
            return this.radius;

        if (this.rectangle)
            return Math.min(this.rectangle.width, this.rectangle.height)/2
        
        return 0;
    }
}