import { ResizableComponent } from "./resizableComponent";
import { Helper } from "../utils/helper";
import { BaseComponent, componentController } from "../controllers/componentController";
import { GameObject } from "../objects/gameObject";
import { Entity } from "../utils/bareTypes";
import { keyboardController } from "../controllers/keyboardController";
import { hitboxController } from "../controllers/hitboxController";
import { mouseController } from "../controllers/mouseController";
import { PhysicsObjectBare } from "../barePhysics";

export class PivotComponent extends BaseComponent
{
    objName:string;
    hitboxName:string;

    hitboxObj: GameObject;
    hitboxComp: ResizableComponent;

    constructor(objectName:string, hitboxName:string)
    {
        super();

        this.objName = objectName;
        this.hitboxName = hitboxName;
    }

    Added(go: GameObject):void
    {
        super.Added(go);

        this.UpdateHitboxReferences();
    }

    OnUpdate(deltaTime: number): void 
    {
        const zoom = bare.GetCameraZoom();

        this.go.innerScale = 1/zoom;

        if (!this.hitboxObj.addedToLevel)
        {
            this.UpdateHitboxReferences();
        }

        // IF MOVING THE HITBOX, UPDATE THE PIVOT POSITION
        const isMovingHitbox = hitboxController.GetCurrentHitboxDown() == this.hitboxObj.tapHitbox;
        if (mouseController.mouseIsDown && mouseController.IsMoving() && (isMovingHitbox || this.hitboxComp.resizing))
        {
            this.UpdatePivotOnHitbox();
        }

        // IF MOVING THE PIVOT, SNAP IT WHERE PIVOT WOULD BE ACCORDING TO CODE (ApplyEntityToGameObject())
        if (mouseController.mouseIsDown && hitboxController.GetCurrentHitboxDown() == this.go.tapHitbox)
        {
            const preventSnap = keyboardController.IsKeyDown('control');
            if (preventSnap)
                return;

            if (this.hitboxObj.scale.x == 0 || this.hitboxObj.scale.y == 0)
                return;

            var hitbox = {
                x1: this.hitboxObj.position!.x,
                y1: this.hitboxObj.position!.y,
                x2: this.hitboxObj.position!.x + this.hitboxObj.scale!.x,
                y2: this.hitboxObj.position!.y + this.hitboxObj.scale!.y
            };

            var snapToPosition = (x:number = -1, y:number = -1) => 
            {
                // HERE WE REMOVE THE PIVOT PROPERTY, SO IT'S NOT AFFECTED BY THE (PARENT) PIVOT SET IN DATA, ONLY CODE
                // SO THAT pivotBasedOnHitbox HAS AN EFFECT FOR SURE (ELSE PIVOT OVERRIDES IT)
                let entity:Entity = { name: this.objName, hitbox: hitbox, propertiesRemoved: ["pivot"] };

                if (x != -1 && y != -1)
                {
                    entity.pivotBasedOnHitbox = {x: x, y: y};
                }

                var origEntity = bare.ConstructEntity(entity, bare.initialSettingsHandler.Get());
                var obj = new PhysicsObjectBare()
                bare.ApplyEntityToGameObject(origEntity, obj);
                var pivotPosOrig = obj.pivot;
                
                if (pivotPosOrig)
                {
                    var distToOrigPos = Helper.DistanceNoSqr(this.go.position!, pivotPosOrig!);
                    const minDist = 15 / zoom;
                    if (distToOrigPos < minDist * minDist)
                    {
                        this.go.SetPosition(pivotPosOrig.x, pivotPosOrig.y);

                        // VERY UGLY, TODO
                        objectController.GetObjectByName(this.objName)!.pivotBasedOnHitbox.set(x, y);
                        objectController.GetObjectByName(this.objName)!.levelEntity!.pivotBasedOnHitbox! = {x: x, y: y};
                    }
                }
            };

            // RESET FIRST, THEN SET LATER IN snapToPosition()
            objectController.GetObjectByName(this.objName)!.pivotBasedOnHitbox.set(-1, -1);
            objectController.GetObjectByName(this.objName)!.levelEntity!.pivotBasedOnHitbox! = {x: -1, y: -1};
            
            snapToPosition(.5, .5);
            snapToPosition(0, 0);
            snapToPosition(0, 1);
            snapToPosition(1, 0);
            snapToPosition(1, 1);
            
            snapToPosition(.5, 0);
            snapToPosition(.5, 1);
            snapToPosition(0, .5);
            snapToPosition(1, .5);
        }
    }

    UpdateHitboxReferences()
    {
        this.hitboxObj = objectController.GetObjectByName(this.hitboxName)!;
        this.hitboxComp = componentController.GetComponent(this.hitboxObj, ResizableComponent)!;
    }

    UpdatePivotOnHitbox()
    {
        var hitbox = {
            x1: this.hitboxObj.position!.x,
            y1: this.hitboxObj.position!.y,
            x2: this.hitboxObj.position!.x + this.hitboxObj.scale!.x,
            y2: this.hitboxObj.position!.y + this.hitboxObj.scale!.y
        };
        
        // CONSTRUCT THE ENTITY FOR GIVEN OBJECT WITH NEW HITBOX, 
        // SO WE CAN GET THE PIVOT THAT COULD BE SET BY DATA OR CODE (BY OVERRIDING ApplyEntityToGameObject())
        let entity = { name: this.objName, hitbox: hitbox };
        var obj = PhysicsObjectBare.GetDummpyDataFromEntity(entity).gameObject;
        var pivotPosOrig = obj.pivot;
        
        if (pivotPosOrig)
        {
            this.go.SetPosition(pivotPosOrig.x, pivotPosOrig.y);
        }
    }
    
    Removed()
    {

    }
}
