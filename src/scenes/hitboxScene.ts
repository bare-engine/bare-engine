import { assetsHandler } from "../handlers/assetsHandler";
import { SettingsHandler } from "../handlers/settingsHandler";
import { ArcadeObject } from "../objects/arcadeObject";
import { AwakePayload, LevelData, SettingsData } from "../types/bareTypes";
import { Helper } from "../utils/helper";
import { MakePath, MakePathForEntity } from "../globals";
import { EditorScene } from "./editorScene";

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
        super({solo:true, persistent: true});
    }

    override async OnStart(payload: HitboxSceneAwakePayload = this.lastPayload): Promise<void>
    {
        this.lastPayload = payload;

        const objectName:string = (payload)?.name;
        const targetSettingsHandler:SettingsHandler = (payload)?.settingsHandler;
        if (!objectName)
            throw new Error("HitboxScene.OnAwake requires payload.name");
        if (!targetSettingsHandler)
            throw new Error("HitboxScene.OnAwake requires payload.settingsData");

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
        // CONSTRUCT ENTITY FROM INITIAL ENTITY DATA, SO WE GET THE HITBOX DEFINED THERE
        var entityConstructedFromSettingsData = this.ConstructEntity(objectName, this.settingsHandler.Get());
        delete entityConstructedFromSettingsData.components;
        
        // NEED TO LOAD AND AWAIT TEXTURE, TO USE THE DIMENSIONS FOR THE LEVEL, SO THE CAMERA CAN BE PROPERLY SET UP BASED ON IT LATER
        var texture = await assetsHandler.LoadTexture(MakePath(entityConstructedFromSettingsData.imagePath!, objectName));

        // CONSTRUCT ENTITY FROM HITBODATA AND APPLY TO DUMMY GAMEOBJECT, SO WE CAN GET THE RESULTING PIVOT
        var obj = new ArcadeObject(this);
        obj.InitTexture(MakePathForEntity(entityConstructedFromSettingsData));
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
            isData: true,
            entitiesByLayer: {
                "objects": [
                    {
                        ...entityConstructedFromSettingsData,
                        name: "main",
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
                        texture: "whitePixel",
                        color: "#000000",
                        position: {
                            x: hitbox.x,
                            y: hitbox.y
                        },
                        scale: {
                            x: hitbox.width,
                            y: hitbox.height
                        },
                        components: {
                            resizable: {},
                            resizableRemove: {}
                        },
                        alpha: .4
                    },
                    {
                        name: "dot",
                        texture: "NONE", // WE'LL DRAW A CIRCLE IN PivotComponent OnPostRender()
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
                        components: {
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
        bare.level.Serialize(level);

        // GET HITBOX AND PIVOT
        var objs = this.object.GetLayer(0).slice();
        objs.splice(objs.findIndex(o => o.name === "currentPreviewEntity"), 1);

        var mainEntity = objs[0].entity;
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
        var obj = ArcadeObject.GetDummpyDataFromEntity(this, mainEntity.name, { propsToIgnoreInEntity: ["pivot", "hitbox", "pivotBasedOnHitbox"] }).gameObject; // NOT SEARCHING IN ENTITY DATA, SO WE GET THE ORIGNAL VARS
        var pivotOrig = obj.pivot;
        var pivotOrigRounded = { x: Math.round(pivotOrig.x), y: Math.round(pivotOrig.y) };
        var hitboxOrig = (obj as any).physicsHitbox ? (obj as any).physicsHitbox?.rectangle : {x: 0, y: 0, width: 0, height: 0};
        var hitboxVecOrig = { x1: hitboxOrig.x, y1: hitboxOrig.y, x2: hitboxOrig.x + hitboxOrig.width, y2: hitboxOrig.y + hitboxOrig.height };
        var resetPivotBasedOnHitbox = (mainEntity.pivotBasedOnHitbox && mainEntity.pivotBasedOnHitbox.x == -1 && mainEntity.pivotBasedOnHitbox.y == -1);

        // APPLY NEW VALUES TO THE INITIAL ENTITY SETTING
        const newRawSettingsData = await this.settingsHandler.UpdateRaw((draft) => {
            const prefabDraft = SettingsHandler.FindPrefab(draft, mainEntityName);
            if (!prefabDraft)
                throw new Error(`Cannot update missing entity '${mainEntityName}'`);

            // PIVOT BASED ON HITBOX
            if (mainEntity.pivotBasedOnHitbox && !resetPivotBasedOnHitbox/* && !Helper.ObjectsAreEqual(pivotBasedOnHitboxOrig!, mainEntity.pivotBasedOnHitbox)*/)
            {
                prefabDraft.pivotBasedOnHitbox = {...mainEntity.pivotBasedOnHitbox};
            }
            else
            {
                delete prefabDraft.pivotBasedOnHitbox;
            }

            // PIVOT
            if (!mainEntity.pivotBasedOnHitbox || resetPivotBasedOnHitbox) // pivotBasedOnHitbox OVERRIDE PIVOT
            {
                if (!Helper.ObjectsAreEqual(pivotOrigRounded, pivot))
                {
                    prefabDraft.pivot = {...pivot};
                }
                else
                {
                    // PIVOT REMAINED AT SAME POSITION, SO SHOULD NOT BE SET IN DATA, DELETE
                    if (prefabDraft.pivot)
                    {
                        delete prefabDraft.pivot;
                    }
                }
            }
            else
            {
                delete prefabDraft.pivot;
            }

            // HITBOX
            if (!Helper.ObjectsAreEqual(hitboxVecOrig, hitbox))
            {
                prefabDraft.hitbox = {...hitbox};
            }
            else
            {
                delete prefabDraft.hitbox;
            }
        });

        // SAVE TO FILE
        await this.SaveSettingsData(newRawSettingsData);

        return level;
    }

    async OnPreSaveSettingsData(rawData: SettingsData): Promise<void>
    {
        // Only sanitize the persistence copy. Processing it here would replace the
        // handler's live raw data and restore defaults that were intentionally stripped
        // from the JSON representation.
        delete rawData.showUI;
        delete rawData.selectionEnabled;
    }

    async OnPostSaveSettingsData(rawData: SettingsData): Promise<void>
    {
        await this.settingsHandler.UpdateRaw((raw) => {
            raw.showUI = false;
            raw.selectionEnabled = false;
        });
    }
}
