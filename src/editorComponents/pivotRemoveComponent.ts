import { BaseComponent } from "../controllers/componentController";
import { mouseController } from "../controllers/mouseController";
import { objectController } from "../controllers/objectController";
import { Run } from "../exports";
import { PhysicsObjectBare } from "../exports/barePhysics";
import { GameMode } from "../main";
import { GameObject } from "../objects/gameObject";
import { Scene } from "../scenes/scene";
import { Helper } from "../utils/helper";

@Run(GameMode.Editor)
export class PivotRemoveComponent extends BaseComponent
{
    constructor(scene: Scene)
    {
        super(scene);
    }
    
    OnRemoved()
    {
        if (!mouseController.IsRightMouseDown())
        return; // TO PREVENT THIS FROM HAPPENING WHEN CLOSING EDITOR, ONLY WANT TO RECREATE WHEN USER RIGHT CLICKS

        // CONSTRUCT ENTITY FROM INITIAL ENTITY DATA, SO WE GET THE RESULTING ORIGNAL VARS
        var mainObj = objectController.GetAllObjects().find((o: GameObject) => o.customName == "main")!;
        var obj = PhysicsObjectBare.GetDummpyDataFromEntity(this.scene, mainObj.name, { propsToIgnoreInEntity: ["pivot"] }).gameObject; // NOT SEARCHING IN ENTITY DATA, SO WE GET THE ORIGNAL VARS
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


        var entity = PhysicsObjectBare.GetDummpyDataFromEntity(this.scene, mainObj.name).entity;
        if (entity.hitbox)
        {
            var currentHitboxIsZero = (entity.hitbox.x1 == 0 && entity.hitbox.y1 == 0 && entity.hitbox.x2 == 0 && entity.hitbox.y2 == 0);

            var currentPivot = this.go.position;
            if (!currentHitboxIsZero && !Helper.ObjectsAreEqual(pivotOrig, currentPivot))
            {
                // CURRENT PIVOT IS NOT EQUAL TO DEFAULT ONE, SET IT TO DEFAULT
                entityBare.position.x = pivotOrig.x;
                entityBare.position.y = pivotOrig.y;
            }
        }
        
        var gameObject = this.scene.AddGameObject(entityBare, 0);
        objectController.BringToFront(gameObject);
    }
}
