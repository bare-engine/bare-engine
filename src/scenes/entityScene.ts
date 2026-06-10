import { cameraHandler } from "../handlers/cameraHandler";
import { assetsHandler } from "../handlers/assetsHandler";
import { SettingsHandler } from "../handlers/settingsHandler";
import { Color, RenderTexture, Vec2 } from "../libraries/new-rapid-render";
import { TextObject } from "../objects/textObject";
import { ArcadeObject } from "../objects/arcadeObject";
import { EditorScene } from "./editorScene";
import { levelHandler } from "../handlers/levelHandler";
import { AwakePayload, Entity, entityVars, LevelData, Rectangle, SettingsData, Size } from "../types/bareTypes";
import { MakePathForEntity } from "../globals";

type EditorScenePayload = AwakePayload<EditorScene>;
type EntitySceneAwakePayload = EditorScenePayload & {
    name: string;
    isBase: boolean;
    settingsHandler: SettingsHandler;
};

export class EntityScene extends EditorScene
{
    objectName: string = "";
    isBase: boolean = false;
    
    lastPayload: EntitySceneAwakePayload;
    degugAtStart: boolean;

    constructor()
    {
        super({solo:true, persistent: true});
    }

    override async OnStart(payload: EntitySceneAwakePayload = this.lastPayload): Promise<void>
    {
        this.degugAtStart = window.debug;
        window.debug = true;
        
        if (!assetsHandler.HasTexture("placeHolder"))
        {
            var rt = new RenderTexture(rapid, { width: 512, height: 512, clearColor: Color.fromHex("b3b3b3") });
            var text = new TextObject(this, {text: "  Place       Holder", fontSize: 52, fill: "white"});
            text.CenterPivot();
            text.x = rt.width / 2;
            text.y = rt.height / 2;
            this.RenderTo(text, rt, true);

            rapid.drawToRenderTexture(rt, () => {
                rapid.drawLine({
                    points: [
                        new Vec2(0, 0),
                        new Vec2(rt.width, rt.height),
                    ],
                    width: 5,
                    roundCap: false,
                    color: Color.White,
                });
                rapid.drawLine({
                    points: [
                        new Vec2(0, rt.height),
                        new Vec2(rt.width, 0),
                    ],
                    width: 5,
                    roundCap: false,
                    color: Color.White,
                });
            }, null);
            
            assetsHandler.AddTexture("placeHolder", rt);
        }

        this.lastPayload = payload;

        const objectName:string = (payload)?.name;
        const isBase:boolean = (payload)?.isBase;
        const targetSettingsHandler:SettingsHandler = (payload)?.settingsHandler;
        
        // WE TAKE OVER THE TARGET ENTITY DATA, ONCE AT INIT
        // SO THAT THE OBJECTS AND DUMMY DATA CREATED FROM THIS SCENE ARE BASED ON THIS DATA
        if (this.objectName == "")
        {
            this.objectName = objectName;
        }

        this.isBase = isBase;

        // Entity editor UI state is local to this scene; don't write it into the shared settings raw data.
        //this.HideEditorUIForScene();
        // PROBLEM: THE ACTUAL RECT INGAME - TODO
        
        targetSettingsHandler.Get().showUI = false;
        targetSettingsHandler.Get().selectionEnabled = false;

        var levelData = await this.CreateEntityDataFor(objectName, isBase);
        await super.OnStart({levelPathOrData: levelData, saveLevelCallback: this.SaveEntityDataToSettingsData, settingsHandler: targetSettingsHandler});
    }

    override OnClear(): void
    {
        if (this.opened)
        {
            window.debug = this.degugAtStart;

            // UNDO THE showUI / selectionEnabled OVERRIDES WE SET AT OnStart()
            // OTHERWISE THE LEVEL EDITOR (WHICH SHARES THIS HANDLER) OPENS WITH ITS UI HIDDEN
            // ONLY WHEN opened, SINCE OnClear ALSO RUNS DURING INIT (LoadLevel), WHERE WE STILL NEED THE OVERRIDE
            var settings = this.lastPayload?.settingsHandler?.Get();
            if (settings)
            {
                delete settings.showUI;
                delete settings.selectionEnabled;
            }
        }

        super.OnClear();
    }

    async CreateEntityDataFor(objectName: string, isBase: boolean): Promise<LevelData>
    {
        var entityFromSettingsData:Entity;

        if (isBase)
        {
            entityFromSettingsData = this.settingsData.baseEntities[objectName];
        }
        else
        {
            entityFromSettingsData = this.settingsData.entities[objectName];
        }

        entityFromSettingsData = {...entityFromSettingsData};
        
        if (isBase)
        {
            entityFromSettingsData.name = objectName;
            entityFromSettingsData.texture = "placeHolder";
            entityFromSettingsData.imagePath = "";
        }
        
        // SET UP LEVEL
        return {
            name: objectName,
            dimensions: {
                width: 1,
                height: 1
            },
            backgroundColor: "#3C3C3C",
            isData: true,
            entitiesByLayer: {
                "objects": [
                    {
                        ... entityFromSettingsData,
                        /*position: {
                            x: 0,
                            y: 0
                        },*/
                        interactableInEditor: false,//
                    }
                ]
            }
        };
    }

    override OnUpdate(deltaTime: number): void
    {
        /*var pivotObj = this.objectController.GetObjectByName("dot");
        var mainObj = this.objectController.GetObjectByName(this.objectName);
        var tl = mainObj.GetTopLeftPosition();
        pivotObj.SetPosition(tl.x + mainObj.pivot.x * mainObj.totalScaleX, tl.y + mainObj.pivot.y * mainObj.totalScaleY);*/
    }

    override async Open(levelPathOrData?: string | LevelData, saveLevelCallback?: () => Promise<LevelData>, settingsHandler?: SettingsHandler): Promise<void>
    {
        var ret = await super.Open(levelPathOrData, saveLevelCallback, settingsHandler);

        var obj = this.objectController.GetObjectByName(this.objectName);
        //obj.x += obj.pivot.x;
        //obj.y += obj.pivot.y;

        // COLLISION RECT
        /*if (obj instanceof ArcadeObject)
        {
            var hitbox = obj.physicsHitbox.rectangle;
            var collisionRectEntity:Entity = {
                name: "collisionRect",
                position: {
                    x: hitbox.x - obj.pivot.x,
                    y: hitbox.y - obj.pivot.y
                },
                scale: {
                    x: hitbox.width,
                    y: hitbox.height
                },
                components: {
                    resizableRemove: {}
                },
                alpha: .4
            };
            this.AddGameObject(collisionRectEntity);
        }
                   
        // PIVOT
        var pivot = obj.pivot;
        var pivotEntity:Entity = {
            name: "dot",
            texture: "NONE", // WE'LL DRAW A CIRCLE IN PivotComponent OnPostRender()
            position: {
                x: pivot.x - obj.pivot.x,
                y: pivot.y - obj.pivot.y
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
                pivot: {objectName: this.objectName, hitboxName: "collisionRect"},
                pivotRemove: {}
            }
        }
        this.AddGameObject(pivotEntity);*/

        // SET CAMERA ZOOM, BASED ON OBJECT BOUNDS
        var bounds = obj.GetBoundsWithChildren();
        var s = Math.max(bounds.width / rapid.width, bounds.height / rapid.height);
        this.cameraHandler.zoom = 1/s * .5;
        cameraHandler.SetPosition(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        
        return ret;
    }

    async SaveEntityDataToSettingsData(): Promise<LevelData>
    {
        return;
        var obj = this.objectController.GetObjectByName(this.objectName);
        
        var entityFromSettingsData:Entity;
        if (this.isBase)
        {
            entityFromSettingsData = this.settingsHandler.GetRaw().baseEntities[this.objectName];
        }
        else
        {
            entityFromSettingsData = this.settingsHandler.GetRaw().entities[this.objectName];
        }

        //var diff = levelHandler.GetChangedValues(obj, entityFromSettingsData);

        var entityFromSettingsDataModified = {...entityFromSettingsData};

        // SUPPLY PLACEHOLDER TEXTURE FOR BASE AGAIN, SO PIVOT CAN BE SET ON IT
        if (this.isBase)
        {
            entityFromSettingsDataModified.texture = "placeHolder";
            entityFromSettingsDataModified.imagePath = "";
        }

        var fullEntity = levelHandler.SerializeObjectFully(obj);
        var origEntity = this.GetAppliedEntityWithDefaultValues(entityFromSettingsDataModified);

        // UNDO THE TEXTURE/PATH FOR BASE 
        if (this.isBase)
        {
            if (entityFromSettingsData.texture)
                origEntity.texture = entityFromSettingsData.texture;
            else
                origEntity.texture = undefined;
            
            if (entityFromSettingsData.imagePath)
                origEntity.imagePath = entityFromSettingsData.imagePath;
            else
                origEntity.imagePath = undefined;
        }

        var diffEntity = levelHandler.GetEntitiesDiff(origEntity, fullEntity);

        delete diffEntity.name;

        // DON'T SAVE PLACEHOLDER TEXTURE FOR BASE
        if (this.isBase)
            delete diffEntity.texture;

        // LITTLE HACK TO FIX DUPLICATE SCALING ENTRIES
        delete diffEntity.scale;
        delete diffEntity.innerPosition;
        delete diffEntity.innerScale;

        const deepMerge = (base: any, override: any): any => {
            const result = {...base};
            for (const key in override) {
                if (override[key] !== null && typeof override[key] === 'object' && !Array.isArray(override[key]) && key in base) {
                    result[key] = deepMerge(base[key], override[key]);
                } else {
                    result[key] = override[key];
                }
            }
            return result;
        };
        var combinedEntity = deepMerge(entityFromSettingsData, diffEntity);

        // TAKE OFF PROPS FROM combinedEntity IF THEY ARE DEFAULT VALUE
        var entityFromSettingsDataDiffPropsRemoved = {...entityFromSettingsDataModified};
        for (var prop in combinedEntity)
        {
            delete entityFromSettingsDataDiffPropsRemoved[prop];
        }
        var defaultEntity = this.GetAppliedEntityWithDefaultValues(entityFromSettingsDataDiffPropsRemoved);
        for (var prop in combinedEntity)
        {
            var value = combinedEntity[prop];
            if (defaultEntity[prop] === value)
                delete combinedEntity[prop];
        }

        // APPLY NEW VALUES TO THE RAW ENTITY SETTING
        const newRawSettingsData = await this.settingsHandler.UpdateRaw((draft) => {
            if (this.isBase)
                draft.baseEntities[this.objectName] = combinedEntity;
            else
                draft.entities[this.objectName] = combinedEntity;
        });

        // SAVE TO FILE
        await this.SaveEntityData(newRawSettingsData);

        return this.currentLevel;

        var origPivot = obj.pivot;
        var currentPivot = this.objectController.GetObjectByName("dot")!.position;

        var madeChangeToEntity = false;

        var entity = {...obj.entity};
        if (!currentPivot.equals(origPivot))
        {
            entity.pivot = currentPivot;
            madeChangeToEntity = true;
        }

        if (madeChangeToEntity)
        {
            // APPLY NEW VALUES TO THE RAW ENTITY SETTING
            const newRawSettingsData = await this.settingsHandler.UpdateRaw((draft) => {
                if (this.isBase)
                    draft.baseEntities[this.objectName] = entity;
                else
                    draft.entities[this.objectName] = entity;
            });

            // RELOAD THE ENTITY PANEL IN PLUGIN
            window.__GAME_DEBUG_API__.gotoEntity(this.objectName, this.isBase);

            // SAVE TO FILE
            await this.SaveEntityData(newRawSettingsData);
        }
        
        return this.currentLevel;

        return;

        // SERIALIZE, TODO, NOT REALLY NEEDED, JUST FOR THE RETURN
        /*var level = this.currentLevel;
        //levelHandler.SerializeLevel(level);

        var obj = this.objectController.GetObjectByName(this.objectName);
        var entity = levelHandler.SerializeObject(obj, {propsToIgnoreInEntity: entityVars, fillPresets: true});
        delete entity.name;
        delete entity.position;
        
        // APPLY NEW VALUES TO THE INITIAL ENTITY SETTING
        const newRawSettingsData = await this.settingsHandler.UpdateRaw((draft) => {
            draft.entities[this.objectName] = entity;
        });

        // SAVE TO FILE
        await this.SaveEntityData(newRawSettingsData);

        return level;*/
    }

    private HideEditorUIForScene(): void
    {
        this.settingsData.showUI = false;
        this.settingsData.selectionEnabled = false;
    }

    async OnPreSaveEntityData(rawData: SettingsData): Promise<void>
    {
        delete rawData.showUI;
        delete rawData.selectionEnabled;

        await this.settingsHandler.Process(rawData);
    }

    async OnPostSaveEntityData(rawData: SettingsData): Promise<void>
    {
        this.HideEditorUIForScene();
    }
}
