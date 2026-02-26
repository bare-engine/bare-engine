import { assetsHandler, EditorScene, Helper, LevelData, MakePath, PhysicsObjectBare, SettingsData, SettingsHandler } from "../exports";
import { levelHandler } from "../handlers/levelHandler";
import { AwakePayload } from "../types/bareTypes";

type EditorScenePayload = AwakePayload<EditorScene>;
type HitboxSceneAwakePayload = EditorScenePayload & {
    name: string;
    settingsHandler: SettingsHandler;
};

export class HitboxScene extends EditorScene
{
    lastObjectName: string = "";
    settingsHandlerEntity: SettingsHandler;
    lastPayload: HitboxSceneAwakePayload;

    constructor()
    {
        var hitboxData = {
            "name": "hitboxEditor",
            "entities": 
            {
                "collisionRect":
                {
                    "hitbox": {
                        "x1": 0,
                        "y1": 0,
                        "x2": 1,
                        "y2": 1
                    },
                    "editorComponents": {
                        "resizable": {}
                    }
                }
            },
            "layers": [
                "objects"
            ],
            "layersInfo": {
                "objects": 
                {
                    "doSave": true
                }
            },
            "saveVars": {
                "PhysicsObjectBare": ["scale", "pivotBasedOnHitbox"]
            },
            "showUI": false,
            "selectionEnabled": false
        };

        super({solo:true, persistent: true, entityData: hitboxData});
    }

    override async OnStart(payload: HitboxSceneAwakePayload = this.lastPayload): Promise<void>
    {
        this.lastPayload = payload;

        const objectName = (payload)?.name;
        const settingsHandler = (payload)?.settingsHandler;
        if (!objectName)
            throw new Error("HitboxScene.OnAwake requires payload.name");
        if (!settingsHandler)
            throw new Error("HitboxScene.OnAwake requires payload.entityData");

        this.lastObjectName = objectName;
        this.settingsHandlerEntity = settingsHandler;
        
        var levelData = await this.CreateHitboxDataFor(objectName);
        super.OnStart({levelPathOrData: levelData, saveLevelCallback: this.SaveHitboxDataToSettingsData});

        /*this.events.on(BareEvent.pointer_down, ()=>{
            trace('pointer_down');
            sceneController.Remove(this);
        });*/
    }

    async CreateHitboxDataFor(objectName: string): Promise<LevelData>
    {
        //if (!hitboxData.processed)
        //    await this.settingsHandler.Process(hitboxData); // NEEDED? TODO

        // CONSTRUCT ENTITY FROM INITIAL ENTITY DATA, SO WE GET THE HITBOX DEFINED THERE
        var entityConstructedFromSettingsData = this.ConstructEntity(objectName, this.settingsHandlerEntity.Get());
        delete entityConstructedFromSettingsData.components;
        delete entityConstructedFromSettingsData.editorComponents;
        
        // NEED TO LOAD AND AWAIT TEXTURE, TO USE THE DIMENSIONS FOR THE LEVEL, SO THE CAMERA CAN BE PROPERLY SET UP BASED ON IT LATER
        var texture = await assetsHandler.GetTexturePromise(MakePath(entityConstructedFromSettingsData.imagePath!, objectName));

        // CONSTRUCT ENTITY FROM HITBODATA AND APPLY TO DUMMY GAMEOBJECT, SO WE CAN GET THE RESULTING PIVOT
        var obj = new PhysicsObjectBare();
        obj.InitTexture(MakePath(entityConstructedFromSettingsData.imagePath!, entityConstructedFromSettingsData.name));
        this.ApplyEntityToGameObject(entityConstructedFromSettingsData, obj);
        var pivot = obj.pivot;
        var hitbox = (obj as any).physicsHitbox ? (obj as any).physicsHitbox?.rectangle : {x: 0, y: 0, width: 0, height: 0};

        // SET UP LEVEL WITH HITBOX AND PIVOT
        return {
            name: objectName,
            dimensions: {
                width: texture.width,
                height: texture.height
            },
            background: {
                color: "#3C3C3C"
            },
            entitiesByLayer: {
                "objects": [
                    {
                        ...entityConstructedFromSettingsData,
                        customName: "main",
                        position: {
                            x: 0,
                            y: 0
                        },
                        pivot: {
                            x: 0,
                            y: 0
                        },
                        interactableInEditor: false,
                    },
                    {
                        name: "collisionRect",
                        position: {
                            x: hitbox.x,
                            y: hitbox.y
                        },
                        scale: {
                            x: hitbox.width,
                            y: hitbox.height
                        },
                        editorComponents: {
                            resizable: {},
                            resizableRemove: {}
                        },
                        alpha: .8 // WORKING?
                    },
                    {
                        name: "dot",
                        position: {
                            x: pivot.x,
                            y: pivot.y
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
                            pivot: {objectName: objectName, hitboxName: "collisionRect"},
                            pivotRemove: {}
                        }
                    }
                ]
            }
        };
    }

    async SaveHitboxDataToSettingsData(): Promise<LevelData>
    {
        var level = this.currentLevel;
    
        // SERIALIZE, DATA IS EASIER TO FETCH? NO NEED, TODO
        levelHandler.SerializeLevel(level);

        // GET HITBOX AND PIVOT
        var objs = this.objectController.GetLayer(0);
        var mainEntity = objs[1].entity; // objs[0] IS currentPreviewEntity, SKIPPING
        var collisionRect = objs[2];
        var pivotObj = objs[3];
        
        var mainEntityName = mainEntity.name;

        var hitbox = {
            x1: Math.round(collisionRect.position!.x),
            y1: Math.round(collisionRect.position!.y),
            x2: Math.round(collisionRect.position!.x + collisionRect.scale!.x),
            y2: Math.round(collisionRect.position!.y + collisionRect.scale!.y)
        };

        var pivot = {
            x: Math.round(pivotObj.position!.x),
            y: Math.round(pivotObj.position!.y)
        };

        // CONSTRUCT ENTITY FROM INITIAL ENTITY DATA, SO WE GET THE RESULTING ORIGNAL VARS
        var obj = PhysicsObjectBare.GetDummpyDataFromEntity(this, mainEntity.name, { propsToIgnoreInEntity: ["pivot", "hitbox", "pivotBasedOnHitbox"] }).gameObject; // NOT SEARCHING IN ENTITY DATA, SO WE GET THE ORIGNAL VARS
        var pivotOrig = obj.pivot;
        var pivotOrigRounded = { x: Math.round(pivotOrig.x), y: Math.round(pivotOrig.y) };
        var hitboxOrig = (obj as any).physicsHitbox ? (obj as any).physicsHitbox?.rectangle : {x: 0, y: 0, width: 0, height: 0};
        var hitboxVecOrig = { x1: hitboxOrig.x, y1: hitboxOrig.y, x2: hitboxOrig.x + hitboxOrig.width, y2: hitboxOrig.y + hitboxOrig.height };
        var pivotBasedOnHitboxOrig = obj.pivotBasedOnHitbox;
        var resetPivotBasedOnHitbox = (mainEntity.pivotBasedOnHitbox && mainEntity.pivotBasedOnHitbox.x == -1 && mainEntity.pivotBasedOnHitbox.y == -1);

        // APPLY NEW VALUES TO THE INITIAL ENTITY SETTING
        const newRawSettingsData = await this.settingsHandlerEntity.UpdateRaw((draft) => {
            draft.entities[mainEntityName] ??= {};
            const entityDraft = draft.entities[mainEntityName];

            // PIVOT BASED ON HITBOX
            if (mainEntity.pivotBasedOnHitbox && !resetPivotBasedOnHitbox && !Helper.ObjectsAreEqual(pivotBasedOnHitboxOrig!, mainEntity.pivotBasedOnHitbox))
            {
                entityDraft.pivotBasedOnHitbox = {...mainEntity.pivotBasedOnHitbox};
            }
            else
            {
                delete entityDraft.pivotBasedOnHitbox;
            }

            // PIVOT
            if (!mainEntity.pivotBasedOnHitbox || resetPivotBasedOnHitbox) // pivotBasedOnHitbox OVERRIDE PIVOT
            {
                if (!Helper.ObjectsAreEqual(pivotOrigRounded, pivot))
                {
                    entityDraft.pivot = {...pivot};
                }
                else
                {
                    // PIVOT REMAINED AT SAME POSITION, SO SHOULD NOT BE SET IN DATA, DELETE
                    if (entityDraft.pivot)
                    {
                        delete entityDraft.pivot;
                    }
                }
            }
            else
            {
                delete entityDraft.pivot;
            }

            // HITBOX
            if (!Helper.ObjectsAreEqual(hitboxVecOrig, hitbox))
            {
                entityDraft.hitbox = {...hitbox};
            }
            else
            {
                delete entityDraft.hitbox;
            }
        });

        //newRawSettingsData.name = "";

        // SAVE TO FILE
        await this.SaveEntityData(newRawSettingsData);
        //await window.__GAME_DEBUG_API__.setEntityData(newRawSettingsData);

        return level;
    }

    async OnSaveEntityData(rawData: SettingsData): Promise<void>
    {
        this.settingsHandlerEntity.Process(rawData);
    }
}
