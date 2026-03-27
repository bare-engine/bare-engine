import { assetsHandler, EditorScene, Helper, LevelData, MakePath, PhysicsObjectBare, SettingsData, SettingsHandler } from "../exports";
import { levelHandler } from "../handlers/levelHandler";
import { AwakePayload } from "../types/bareTypes";

type EditorScenePayload = AwakePayload<EditorScene>;
type HitboxSceneAwakePayload = EditorScenePayload & {
    name: string;
    settingsHandler: SettingsHandler;
};

export class EntityScene extends EditorScene
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

        var levelData = await this.CreateEntityDataFor(objectName);
        await super.OnStart({levelPathOrData: levelData, saveLevelCallback: this.SaveEntityDataToSettingsData});
    }

    async CreateEntityDataFor(objectName: string): Promise<LevelData>
    {
        // CONSTRUCT ENTITY FROM INITIAL ENTITY DATA, SO WE GET THE ENTITY DEFINED THERE
        var entityConstructedFromSettingsData = this.ConstructEntity(objectName);
        
        var entityFromSettingsData = this.settingsData.entities[objectName];

        //delete entityConstructedFromSettingsData.components;
        //delete entityConstructedFromSettingsData.editorComponents;
        
        // NEED TO LOAD AND AWAIT TEXTURE, TO USE THE DIMENSIONS FOR THE LEVEL, SO THE CAMERA CAN BE PROPERLY SET UP BASED ON IT LATER
        var texture = await assetsHandler.GetTexturePromise(MakePath(entityConstructedFromSettingsData.imagePath!, objectName));

        // SET UP LEVEL
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
                    entityFromSettingsData
                ]
            }
        };
    }

    async SaveEntityDataToSettingsData(): Promise<LevelData>
    {
        // SERIALIZE, TODO, NOT REALLY NEEDED, JUST FOR THE RETURN
        var level = this.currentLevel;
        //levelHandler.SerializeLevel(level);

        var entity = this.objectController.GetObjectByName(this.lastObjectName).levelEntity;
        delete entity.name;
        
        // APPLY NEW VALUES TO THE INITIAL ENTITY SETTING
        const newRawSettingsData = await this.settingsHandler.UpdateRaw((draft) => {
            draft.entities[this.lastObjectName] = entity;
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
