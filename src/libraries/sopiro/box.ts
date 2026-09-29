import { GameObject } from "../../objects/gameObject";
import type { Scene } from "../../scenes/scene";
import { Entity } from "../../types/bareTypes";
import { Vec2 } from "../new-rapid-render";
import { Polygon, PolygonEntity } from "./polygon";
import { Type } from "./rigidbody";
import { Settings } from "./settings";

export class Box extends Polygon
{
    phyWidth: number;
    phyHeight: number;

    constructor(scene: Scene, width: number = 1, height: number = width, type: Type = Type.Dynamic, density: number = Settings.defaultDensity)
    {
        super(scene, [new Vec2(0, 0), new Vec2(0, height), new Vec2(width, height), new Vec2(width, 0)], type, true, density);

        this.phyWidth = width;
        this.phyHeight = height;
    }

    override ResetValues(): this
    {
        super.ResetValues();
        this.phyWidth = 0;
        this.phyHeight = 0;

        return this;
    }

    override OnApplyEntityVarsToGameObject(entity: PolygonEntity, obj: GameObject)
    {
        if (!entity.rigidbodyRect)
        {
            entity.rigidbodyRect = {width: this.texture.width, height: this.texture.height};
        }
    }

    override set rigidbodyRect(value: { width: number, height: number })
    {
        super.rigidbodyRect = value;
        
        this.phyWidth = value.width;
        this.phyHeight = value.height;
    }
}
