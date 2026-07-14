import { Component } from "../controllers/componentController";
import { ArcadeObject } from "../objects/arcadeObject";
import { Scene } from "../scenes/scene";
import { Save } from "../utils/decorators";

export class PositionPivotComponent extends Component
{
    @Save
    objName:string = "";

    @Save
    pivotName:string = "";

    constructor(scene: Scene)
    {
        super(scene);
    }

    OnUpdate(deltaTime: number): void 
    {
        if (bare.mouse.IsDown() && bare.hitbox.GetCurrentHover() == this.go.tapHitbox)
        {
            var hitbox = {
                x1: this.go.position!.x,
                y1: this.go.position!.y,
                x2: this.go.position!.x + this.go.scale!.x,
                y2: this.go.position!.y + this.go.scale!.y
            };
            
            var entity = { name: this.objName, hitbox: hitbox };
            var origEntity = this.scene.ConstructEntity(entity);
            var obj = new ArcadeObject(this.scene);
            this.scene.ApplyEntityToGameObject(origEntity, obj);
            var pivotPosOrig = obj.pivot;
            
            var pivotObj = bare.object.GetByName(this.pivotName)!;
            if (pivotPosOrig)
            {
                pivotObj.SetPosition(pivotPosOrig.x, pivotPosOrig.y);
            }
        }
    }
}
