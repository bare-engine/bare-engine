import { Component } from '../controllers/componentController';
import { GameMode } from '../globals';
import { GameObject } from '../objects/gameObject';
import { ArcadeObject } from '../objects/arcadeObject';
import { Run } from '../utils/runModes';
import { Helper } from '../utils/helper';
import { PivotComponent } from './pivotComponent';

@Run(GameMode.Editor)
export class ResizableRemoveComponent extends Component
{
    OnRemoved(): void
    {
        if (!bare.mouse.IsRightDown())
            return; // TO PREVENT THIS FROM HAPPENING WHEN CLOSING EDITOR, ONLY WANT TO RECREATE WHEN USER RIGHT CLICKS

        // CONSTRUCT ENTITY FROM INITIAL ENTITY DATA, SO WE GET THE RESULTING ORIGNAL VARS
        var mainObj = bare.object.GetAll().find((o: GameObject) => o.customName == "main")!;
        var obj = ArcadeObject.GetDummpyDataFromEntity(this.scene, mainObj.name, { propsToIgnoreInEntity: ["hitbox"] }).gameObject; // NOT SEARCHING IN ENTITY DATA, SO WE GET THE ORIGNAL VARS
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
                resizable: {},
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

        // CLEAR pivotBasedOnHitbox
        //bare.object.GetByName(mainObj.name)!.pivotBasedOnHitbox.set(-1, -1);
        bare.object.GetByName(mainObj.name)!.entity.pivotBasedOnHitbox = {x: -1, y: -1};

        var gameObject = this.scene.AddGameObject(entityBare, 0);
        bare.object.MoveWithinLayer(gameObject, 2);

        var pivotOjb = bare.object.GetByName("dot")!;
        bare.component.Get(pivotOjb, PivotComponent)!.UpdateHitboxReferences();
        bare.component.Get(pivotOjb, PivotComponent)!.UpdatePivotOnHitbox();
    }
}
