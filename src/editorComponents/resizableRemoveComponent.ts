import { BaseComponent, componentController } from '../controllers/componentController'
import { PivotComponent } from './pivotComponent';
import { GameObject } from '../objects/gameObject';
import { Helper } from '../utils/helper';
import { mouseController } from '../controllers/mouseController';
import { PhysicsObjectBare, sceneController } from '..';
import { EditorScene } from '../scenes/editorScene';

export class ResizableRemoveComponent extends BaseComponent
{
  Removed(): void
  {
    if (!mouseController.IsRightMouseDown())
      return; // TO PREVENT THIS FROM HAPPENING WHEN CLOSING EDITOR, ONLY WANT TO RECREATE WHEN USER RIGHT CLICKS

    // CONSTRUCT ENTITY FROM INITIAL ENTITY DATA, SO WE GET THE RESULTING ORIGNAL VARS
    var mainObj = objectController.GetAllObjects().find((o: GameObject) => o.customName == "main")!;
    var obj = PhysicsObjectBare.GetDummpyDataFromEntity(mainObj.name, bare.baseSettings, { propsToIgnoreInEntity: ["hitbox"] }).gameObject; // NOT SEARCHING IN ENTITY DATA, SO WE GET THE ORIGNAL VARS
    var hitboxOrig = (obj as any).physicsHitbox ? (obj as any).physicsHitbox?.rectangle : {x: 0, y: 0, width: 0, height: 0};

    var entityBare = {name: "collisionRect",
                        position: {
                            x: 0,
                            y: 0
                        },
                        scale: {
                            x: 0,
                            y: 0
                        },
                        editorComponents: {
                            resizableRemove: {}
                        },
                        alpha: .8
                      };

    var currentHitbox = {x: this.go.x, y: this.go.y, width: this.go.width, height: this.go.height};
    if (!Helper.ObjectsAreEqual(hitboxOrig, currentHitbox))
    {
      // CURRENT HITBOX IS NOT EQUAL TO DEFAULT ONE, SET IT TO DEFAULT
      entityBare.position.x = hitboxOrig.x;
      entityBare.position.y = hitboxOrig.y;
      entityBare.scale.x = hitboxOrig.width;
      entityBare.scale.y = hitboxOrig.height;
    }
    else
    {
      objectController.GetObjectByName(mainObj.name)!.pivotBasedOnHitbox.set(-1, -1);
    }
    
    var editorScene = sceneController.Get(EditorScene);
    var gameObject = editorScene.AddGameObject(entityBare, 0);
    objectController.MoveWithinLayer(gameObject, 2);

    var pivotOjb = objectController.GetObjectByName("dot")!;
    componentController.GetComponent(pivotOjb, PivotComponent)!.UpdateHitboxReferences();
    componentController.GetComponent(pivotOjb, PivotComponent)!.UpdatePivotOnHitbox();
  }
}
