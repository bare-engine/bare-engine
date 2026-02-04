import { Helper } from "../utils/helper";
import { BaseComponent } from "../controllers/componentController";
import { GameObject } from "../objects/gameObject";
import { mouseController } from "../controllers/mouseController";
import { editorController, PhysicsObjectBare } from "..";

export class PivotRemoveComponent extends BaseComponent
{
    constructor()
    {
        super();
    }
    
    Removed()
    {
        if (!mouseController.rightMouseIsDown)
        return; // TO PREVENT THIS FROM HAPPENING WHEN CLOSING EDITOR, ONLY WANT TO RECREATE WHEN USER RIGHT CLICKS

        // CONSTRUCT ENTITY FROM INITIAL ENTITY DATA, SO WE GET THE RESULTING ORIGNAL VARS
        var mainObj = objectController.GetAllObjects().find((o: GameObject) => o.customName == "main")!;
        var obj = PhysicsObjectBare.GetDummpyDataFromEntity(mainObj.name, bare.initialSettingsHandler.Get(), { propsToIgnoreInEntity: ["pivot"] }).gameObject; // NOT SEARCHING IN ENTITY DATA, SO WE GET THE ORIGNAL VARS
        var pivotOrig = obj.pivot;

        var entityBare = {
                            name: "dot",
                            position: {
                                x: 0,
                                y: 0
                            },
                            pivot: {
                                x: .5,
                                y: .5
                            },
                            scale: {
                                x: .75,
                                y: .75
                            },
                            imagePath: "",
                            editorComponents: {
                                pivot: {objectName: mainObj.name, hitboxName: "collisionRect"},
                                pivotRemove: {}
                            }
                        }

        var entity = PhysicsObjectBare.GetDummpyDataFromEntity(mainObj.name, bare.initialSettingsHandler.Get()).entity;
        var currentHitboxIsZero = entity.hitbox.x1 == 0 && entity.hitbox.y1 == 0 && entity.hitbox.x2 == 0 && entity.hitbox.y2 == 0;

        var currentPivot = this.go.position;
        if (!currentHitboxIsZero && !Helper.ObjectsAreEqual(pivotOrig, currentPivot))
        {
            // CURRENT PIVOT IS NOT EQUAL TO DEFAULT ONE, SET IT TO DEFAULT
            entityBare.position.x = pivotOrig.x;
            entityBare.position.y = pivotOrig.y;
        }
        
        var gameObject = editorController.levelFunctionality.AddGameObjectFromLevelEntity(entityBare, 0);
        objectController.BringToFront(gameObject);
    }
}
