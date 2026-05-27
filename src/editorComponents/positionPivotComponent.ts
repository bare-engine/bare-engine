import { BaseComponent } from "../controllers/componentController";
import { hitboxController } from "../controllers/hitboxController";
import { mouseController } from "../controllers/mouseController";
import { GameObject } from "../objects/gameObject";
import { objectController } from "../controllers/objectController";
import { ArcadeObject } from "../objects/arcadeObject";
import { Scene } from "../scenes/scene";
import { Save } from "../utils/decorators";

export class PositionPivotComponent extends BaseComponent
{
    @Save
    objName:string = "";

    @Save
    pivotName:string = "";

    constructor(scene: Scene)
    {
        super(scene);
    }

    Added(go: GameObject):void
    {
        super.Added(go);
    }

    OnUpdate(deltaTime: number): void 
    {
        if (mouseController.IsMouseDown() && hitboxController.GetCurrentHitboxHover() == this.go.tapHitbox)
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
            
            var pivotObj = objectController.GetObjectByName(this.pivotName)!;
            if (pivotPosOrig)
            {
                pivotObj.SetPosition(pivotPosOrig.x, pivotPosOrig.y);
            }
        }
    }
}
