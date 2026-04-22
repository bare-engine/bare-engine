import { assetsHandler, cameraHandler, Color, EditorScene, LevelData, PhysicsObjectBare, RenderTexture, SettingsData, SettingsHandler, TextObject, Vec2 } from "../exports";
import { levelHandler } from "../handlers/levelHandler";
import { MakePathForEntity } from "../main";
import { AwakePayload, Entity, entityVars, Rectangle, Size } from "../types/bareTypes";

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

    constructor()
    {
        super({solo:true, persistent: true});
    }

    override async OnStart(payload: EntitySceneAwakePayload = this.lastPayload): Promise<void>
    {
        if (!assetsHandler.HasTexture("placeHolder"))
        {
            var rt = new RenderTexture(512, 512, true, Color.fromHex("b3b3b3"));
            var text = new TextObject(this, {text: "  Place       Holder", fontSize: 52, color: "white"});
            text.CenterPivot();
            text.x = rt.width / 2;
            text.y = rt.height / 2;
            this.RenderTo(text, rt);

            const fbo = rt.fbo;

            rapid.drawToFBO(fbo, () => {
                rapid.renderLine({
                    points: [
                        new Vec2(0, 0),
                        new Vec2(rt.width / 2, rt.height / 2),
                    ],
                    width: 5,
                    roundCap: false,
                    color: Color.White,
                });
                rapid.renderLine({
                    points: [
                        new Vec2(rt.width, 0),
                        new Vec2(rt.width / 2, rt.height / 2),
                    ],
                    width: 5,
                    roundCap: false,
                    color: Color.White,
                });
                rapid.renderLine({
                    points: [
                        new Vec2(0, rt.height),
                        new Vec2(rt.width / 2, rt.height / 2),
                    ],
                    width: 5,
                    roundCap: false,
                    color: Color.White,
                });
                rapid.renderLine({
                    points: [
                        new Vec2(rt.width, rt.height),
                        new Vec2(rt.width / 2, rt.height / 2),
                    ],
                    width: 5,
                    roundCap: false,
                    color: Color.White,
                });
            });
            
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

        // DON'T WANT TO SHOW THE UI, WE UNDO THIS BEFORE SAVING THE ENTITY DATA AGAIN, BIT AWKWARD
        this.settingsHandler.UpdateRaw((raw) => {
            raw.showUI = false;
            raw.selectionEnabled = false;
        }, {fillPresets: false}); // fillPresets FALSE!!! DON'T WANT TO FILL PRESETS SO THEY REMAIN AS STRING IN PLUGIN PANEL
        // PROBLEM: THE ACTUAL RECT INGAME - TODO
        
        var levelData = await this.CreateEntityDataFor(objectName, isBase);
        await super.OnStart({levelPathOrData: levelData, saveLevelCallback: this.SaveEntityDataToSettingsData});
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
        var pivotObj = this.objectController.GetObjectByName("dot");
        var mainObj = this.objectController.GetObjectByName(this.objectName);
        var tl = mainObj.GetTopLeftPosition();
        pivotObj.SetPosition(tl.x + mainObj.pivot.x * mainObj.totalScaleX, tl.y + mainObj.pivot.y * mainObj.totalScaleY);
    }

    override async Open(levelPathOrData?: string | LevelData, saveLevelCallback?: () => Promise<LevelData>, settingsHandler?: SettingsHandler): Promise<void>
    {
        var ret = await super.Open(levelPathOrData, saveLevelCallback, settingsHandler);

        var obj = this.objectController.GetObjectByName(this.objectName);
        //obj.x += obj.pivot.x;
        //obj.y += obj.pivot.y;

        // COLLISION RECT
        if (obj instanceof PhysicsObjectBare)
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
        this.AddGameObject(pivotEntity);

        // SET CAMERA ZOOM, BASED ON OBJECT BOUNDS
        var bounds = obj.GetBoundsWithChildren();
        var s = Math.max(bounds.width / rapid.width, bounds.height / rapid.height);
        this.cameraHandler.zoom = 1/s * .7;
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

    async OnSaveEntityData(rawData: SettingsData): Promise<void>
    {
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
