import { assetsHandler, EditorScene, Helper, LevelData, MakePath, PhysicsObjectBare, SettingsData, SettingsHandler } from "../exports";
import { levelHandler } from "../handlers/levelHandler";
import { AwakePayload, BareEvent, Entity, entityVars, Size } from "../types/bareTypes";

type EditorScenePayload = AwakePayload<EditorScene>;
type EntitySceneAwakePayload = EditorScenePayload & {
    name: string;
    isBase: boolean;
    settingsHandler: SettingsHandler;
};

export class EntityScene extends EditorScene
{
    objectName: string = "";
    lastPayload: EntitySceneAwakePayload;

    constructor()
    {
        super({solo:true, persistent: true});
    }

    override async OnStart(payload: EntitySceneAwakePayload = this.lastPayload): Promise<void>
    {
        this.lastPayload = payload;

        const objectName:string = (payload)?.name;
        const isBase:boolean = (payload)?.isBase;
        const targetSettingsHandler:SettingsHandler = (payload)?.settingsHandler;
        
        // WE TAKE OVER THE TARGET ENTITY DATA, ONCE AT INIT
        // SO THAT THE OBJECTS AND DUMMY DATA CREATED FROM THIS SCENE ARE BASED ON THIS DATA
        if (this.objectName == "")
        {
            this.settingsHandler.Process(targetSettingsHandler.GetRaw());
            this.objectName = objectName;
        }

        // DON'T WANT TO SHOW THE UI, WE UNDO THIS BEFORE SAVING THE ENTITY DATA AGAIN, BIT AWKWARD
        this.settingsHandler.UpdateRaw((raw) => {
            raw.showUI = false;
            raw.selectionEnabled = false;
        });

        var levelData = await this.CreateEntityDataFor(objectName, isBase);
        await super.OnStart({levelPathOrData: levelData, saveLevelCallback: this.SaveEntityDataToSettingsData});
    }

    async CreateEntityDataFor(objectName: string, isBase: boolean): Promise<LevelData>
    {
        // CONSTRUCT ENTITY FROM INITIAL ENTITY DATA, SO WE GET THE ENTITY DEFINED THERE
        var entityConstructedFromSettingsData = this.ConstructEntity(objectName);
        
        var entityFromSettingsData:Entity;

        if (isBase)
        {
            entityFromSettingsData = this.settingsData.entityBases[objectName];
        }
        else
        {
            entityFromSettingsData = this.settingsData.entities[objectName];
        }

        entityFromSettingsData = {...entityFromSettingsData};
        
        entityFromSettingsData.name = objectName;
        entityFromSettingsData.texture = "placeHolder";
        entityFromSettingsData.imagePath = "";

        //delete entityConstructedFromSettingsData.components;
        //delete entityConstructedFromSettingsData.editorComponents;
        
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

    override async Open(levelPathOrData?: string | LevelData, saveLevelCallback?: () => Promise<LevelData>, settingsHandler?: SettingsHandler): Promise<void>
    {
        var ret = await super.Open(levelPathOrData, saveLevelCallback, settingsHandler);

        // SET CAMERA ZOOM, BASED ON OBJECT BOUNDS
        var obj = this.objectController.GetObjectByName(this.objectName);
        var bounds = obj.GetBoundsWithChildren();
        var s = Math.max(bounds.width / rapid.width, bounds.height / rapid.height);
        this.cameraHandler.zoom = 1/s * .7;

        return ret;
    }

    async SaveEntityDataToSettingsData(): Promise<LevelData>
    {
        // SERIALIZE, TODO, NOT REALLY NEEDED, JUST FOR THE RETURN
        var level = this.currentLevel;
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

        return level;
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
