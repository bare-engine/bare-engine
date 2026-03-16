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
    lastPayload: HitboxSceneAwakePayload;

    constructor()
    {
        // NOT REALLY USED ANYMORE!
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

        const objectName:string = (payload)?.name;
        const targetSettingsHandler:SettingsHandler = (payload)?.settingsHandler;
        if (!objectName)
            throw new Error("HitboxScene.OnAwake requires payload.name");
        if (!targetSettingsHandler)
            throw new Error("HitboxScene.OnAwake requires payload.entityData");

        // WE TAKE OVER THE TARGET ENTITY DATA, ONCE AT INIT
        // SO THAT THE OBJECTS AND DUMMY DATA CREATED FROM THIS SCENE ARE BASED ON THIS DATA
        if (this.lastObjectName == "")
        {
            this.settingsHandler.Process(targetSettingsHandler.GetRaw());
            this.lastObjectName = objectName;
        }

        // DON'T WANT TO SHOW THE UI, WE UNDO THIS BEFORE SAVING THE ENTITY DATA AGAIN, BIT AWKWARD
        this.settingsHandler.UpdateRaw((raw) => {
            raw.showUI = false;
            raw.selectionEnabled = false;
        });

        var levelData = await this.CreateHitboxDataFor(objectName);
        await super.OnStart({levelPathOrData: levelData, saveLevelCallback: this.SaveHitboxDataToSettingsData});
    }

    async CreateHitboxDataFor(objectName: string): Promise<LevelData>
    {
        //if (!hitboxData.processed)
        //    await this.settingsHandler.Process(hitboxData); // NEEDED? TODO

        // CONSTRUCT ENTITY FROM INITIAL ENTITY DATA, SO WE GET THE HITBOX DEFINED THERE
        var entityConstructedFromSettingsData = this.ConstructEntity(objectName, this.settingsHandler.Get());
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
            backgroundColor: "#3C3C3C",
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
        // SERIALIZE, TODO, NOT REALLY NEEDED, JUST FOR THE RETURN
        var level = this.currentLevel;
        levelHandler.SerializeLevel(level);

        // GET HITBOX AND PIVOT
        var objs = this.objectController.GetLayer(0).slice();
        objs.splice(objs.findIndex(o => o.name === "currentPreviewEntity"), 1);

        var mainEntity = objs[0].levelEntity;
        var collisionRect = objs[1];
        var pivotObj = objs[2];
        
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
        const newRawSettingsData = await this.settingsHandler.UpdateRaw((draft) => {
            draft.entities[mainEntityName] ??= {};
            const entityDraft = draft.entities[mainEntityName];

            // PIVOT BASED ON HITBOX
            if (mainEntity.pivotBasedOnHitbox && !resetPivotBasedOnHitbox/* && !Helper.ObjectsAreEqual(pivotBasedOnHitboxOrig!, mainEntity.pivotBasedOnHitbox)*/)
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
        //this.settingsHandlerEntity.Process(rawData);
        this.settingsHandler.Process(rawData);

        this.settingsHandler.UpdateRaw((raw) => {
            delete raw.showUI;
            delete raw.selectionEnabled;
        });
    }

    async OnPostSaveEntityData(rawData: SettingsData): Promise<void>
    {
        await this.settingsHandler.UpdateRaw((raw) => {
            raw.showUI = false;
            raw.selectionEnabled = false;
        });
    }
}
