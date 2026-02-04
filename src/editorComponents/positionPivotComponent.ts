import { PhysicsObjectBare } from "../barePhysics";
import { BaseComponent } from "../controllers/componentController";
import { hitboxController } from "../controllers/hitboxController";
import { mouseController } from "../controllers/mouseController";
import { GameObject } from "../objects/gameObject";

export class PositionPivotComponent extends BaseComponent
{
    objName:string;
    pivotName:string;

    constructor(objectName:string, pivotName:string)
    {
        super();

        this.objName = objectName;
        this.pivotName = pivotName;
    }

    Added(go: GameObject):void
    {
        super.Added(go);
    }

    OnUpdate(deltaTime: number): void 
    {
        if (mouseController.mouseIsDown && hitboxController.GetCurrentHitboxHover() == this.go.tapHitbox)
        {
            var hitbox = {
                x1: this.go.position!.x,
                y1: this.go.position!.y,
                x2: this.go.position!.x + this.go.scale!.x,
                y2: this.go.position!.y + this.go.scale!.y
            };
            
            var entity = { name: this.objName, hitbox: hitbox };
            var origEntity = bare.ConstructEntity(entity, bare.initialSettings);
            var obj = new PhysicsObjectBare()
            bare.ApplyEntityToGameObject(origEntity, obj);
            var pivotPosOrig = obj.pivot;
            
            var pivotObj = objectController.GetObjectByName(this.pivotName)!;
            if (pivotPosOrig)
            {
                pivotObj.SetPosition(pivotPosOrig.x, pivotPosOrig.y);
            }
        }
    }
    
    Removed()
    {

    }
}
