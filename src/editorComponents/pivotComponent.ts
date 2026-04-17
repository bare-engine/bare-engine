import { ResizableComponent } from "./resizableComponent";
import { Helper } from "../utils/helper";
import { BaseComponent, componentController } from "../controllers/componentController";
import { GameObject } from "../objects/gameObject";
import { Entity } from "../types/bareTypes";
import { keyboardController } from "../controllers/keyboardController";
import { hitboxController } from "../controllers/hitboxController";
import { mouseController } from "../controllers/mouseController";
import { PhysicsObjectBare } from "../exports/barePhysics";
import { objectController } from "../controllers/objectController";
import { Color, GameMode, Run, Scene } from "../exports";

@Run(GameMode.Editor)
export class PivotComponent extends BaseComponent
{
    objName:string;
    hitboxName:string;

    hitboxObj: GameObject;
    hitboxComp: ResizableComponent;

    constructor(scene: Scene, objectName:string, hitboxName:string)
    {
        super(scene);

        this.objName = objectName;
        this.hitboxName = hitboxName;
    }

    OnAdded():void
    {
        this.UpdateHitboxReferences();
    }

    OnUpdate(deltaTime: number): void 
    {
        if (!this.hitboxObj)
            return;

        const zoom = this.scene.GetCameraZoom();

        //this.go.innerScale = 1/zoom;

        if (!this.hitboxObj.addedToLevel)
        {
            this.UpdateHitboxReferences();
        }

        // IF MOVING THE HITBOX, UPDATE THE PIVOT POSITION
        const isMovingHitbox = hitboxController.GetCurrentHitboxDown() == this.hitboxObj.tapHitbox;
        if (mouseController.IsMouseDown() && mouseController.IsMoving() && (isMovingHitbox || this.hitboxComp.resizing))
        {
            this.UpdatePivotOnHitbox();
        }

        // IF MOVING THE PIVOT, SNAP IT WHERE PIVOT WOULD BE ACCORDING TO CODE (ApplyEntityToGameObject())
        if (mouseController.IsMouseDown() && hitboxController.GetCurrentHitboxDown() == this.go.tapHitbox)
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
                // SO THAT pivotBasedOnHitbox HAS AN EFFECT (ELSE PIVOT OVERRIDES IT)
                //let entity:Entity = { name: this.objName, hitbox: hitbox, propertiesRemoved: ["pivot"] };
                var entity = objectController.GetObjectByName(this.objName)!.entity!;
                entity = { ...entity, hitbox: hitbox, propertiesRemoved: ["pivot"] };

                if (x != -1 && y != -1)
                {
                    entity.pivotBasedOnHitbox = {x: x, y: y};
                }

                //delete entity.components;//

                var obj = new PhysicsObjectBare(this.scene);
                this.scene.ApplyEntityToGameObject(entity, obj);
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
                        objectController.GetObjectByName(this.objName)!.entity!.pivotBasedOnHitbox! = {x: x, y: y};
                    }
                }
            };

            // RESET FIRST, THEN SET LATER IN snapToPosition()
            objectController.GetObjectByName(this.objName)!.pivotBasedOnHitbox.set(-1, -1);
            objectController.GetObjectByName(this.objName)!.entity!.pivotBasedOnHitbox! = {x: -1, y: -1};
            
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
        this.hitboxObj = objectController.GetObjectByName(this.hitboxName);

        if (this.hitboxObj)
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
        //let entity = { name: this.objName, hitbox: hitbox };
        var entity = objectController.GetObjectByName(this.objName)!.entity!;
        entity = { ...entity, hitbox: hitbox };
        var obj = PhysicsObjectBare.GetDummpyDataFromEntity(this.scene, entity).gameObject;
        var pivotPosOrig = obj.pivot;
        
        if (pivotPosOrig)
        {
            this.go.SetPosition(pivotPosOrig.x, pivotPosOrig.y);
        }
    }

    OnPostRender()
    {
        const zoom = this.scene.GetCameraZoom();
        var radius = 9 / zoom;

        // *3 UHH?! FIX THOSE HITBOX SHENANIGANS - TODO
        this.go.tapHitbox.rectangle = {x: -radius, y: -radius, width: radius*3, height: radius*3};

        rapid.renderCircle({
            offset: this.go.position!,
            radius: radius,//
            color: Color.White,
            segments: 16
        });
    }
}
