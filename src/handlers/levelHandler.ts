
import { globalEvents, MakePathForEntity, RegisterController } from "../globals";
import { Color, Texture } from "../libraries/rapid-render";
import { GameObject } from "../objects/gameObject";
import { Scene } from "../scenes/scene";
import { Bare } from "../types/bare";
import { defaultSettingsData } from "../types/bareData";
import { BareEvent, BareEventPayload, ConstructEntityOptions, Entity, LevelData, SaveData, SettingsData } from '../types/bareTypes';
import { InspectorField } from "../utils/decorators";
import { Helper, Size } from "../utils/helper";
import { GameObjectSerializer } from "../utils/entitySerializer";
import { assetsHandler } from "./assetsHandler";
import { SettingsHandler } from "./settingsHandler";

export class LevelHandler
{
    static levelCache: Map<string, LevelData> = new Map();
    
    currentLevel: LevelData | null = null;
    
    scene: Scene;

    @InspectorField
    private get name():string | undefined { return this.currentLevel?.name; }

    @InspectorField
    private get dimensions():Size | undefined { return this.currentLevel?.dimensions; }
    
    @InspectorField
    get backgroundColor():Color | undefined {return this.currentLevel ? rapid.backgroundColor : undefined;}
    set backgroundColor(value:Color) {bare.SetBackgroundColor(value);}

    // YOUR OWN VALUES FOR THE LEVEL. SAVED WITH IT WHEN THE LEVEL EDITOR SAVES
    @InspectorField
    get customData():Record<string, any> | undefined {return this.currentLevel?.customData;}
    set customData(value:Record<string, any> | undefined)
    {
        if (!this.currentLevel)
            return;

        if (value && Object.keys(value).length > 0)
            this.currentLevel.customData = value;
        else
            delete this.currentLevel.customData;
    }

    constructor(scene: Scene)
    {
        this.scene = scene;

        if (bare.preloadedLevels)
        {
            LevelHandler.levelCache = new Map(bare.preloadedLevels);
            bare.preloadedLevels = null;
        }

        defaultSettingsData.saveVars!.GameObject.push("save");

        bare.events.on(BareEvent.game_objectAdded, this.OnGameObjectAdded.bind(this));
    }

    OnGameObjectAdded({ gameObject, layer }: BareEventPayload['game_objectAdded']): void
    {
        if (!gameObject.parent)
        {
            gameObject.save = true;
        }
    }

    get objectsLayer(): GameObject[]
    {
        return bare.object.GetLayerByName("objects");
    }

    get width(): int
    {
        if (!this.currentLevel)
            throw "Can't get level width before level is loaded";

        return this.currentLevel.dimensions.width
    }

    get height(): int
    {
        if (!this.currentLevel)
            throw "Can't get level height before level is loaded";

        return this.currentLevel.dimensions.height
    }

    async LoadData(levelStr: string): Promise<LevelData>
    {
        var levelData: LevelData;

        var hasCachedLevel = SaveData.levelCache.has(levelStr);

        if (hasCachedLevel)
        {
            levelData = SaveData.levelCache.get(levelStr)!;
        }
        else
        {
            if (LevelHandler.levelCache.has(levelStr))
            {
                levelData = LevelHandler.levelCache.get(levelStr)!;
            }
            else
            {
                try
                {
                    levelData = await Helper.loadJSON<LevelData>(`${bare.levelPath}/${levelStr}.json`);
                    LevelHandler.levelCache.set(levelStr, levelData);
                }
                catch (error)
                {
                    throw new Error(`Failed to load level "${levelStr}": ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }

        return levelData;
    }

    async LoadCurrent(): Promise<LevelData | undefined>
    {
        if (SaveData.currentLevelStr == '')
            return; // NO CURRENT LEVEL

        return this.Load(SaveData.currentLevelStr);
    }

    async Restart(): Promise<LevelData | undefined>
    {
        return this.LoadCurrent();
    }

    async Load(levelInput: string | LevelData = ""):Promise<LevelData | undefined>
    {
        // WHEN IN PRODUCTION, WE DON'T LOAD LEVELS FROM CACHE
        // BUT ONCE PLAYER EDITS IT IN LEVEL EDITOR, IT'S LOADED FROM CACHE (SINCE IN PROD WE CAN'T SAVE EDITS TO DISK)
        if (!__DEV__)
        {
            var levelStr = SaveData.currentLevelStr;
            if (typeof levelInput === "string")
                levelStr = levelInput;

            var levelCached = SaveData.levelsEditedCache.get(levelStr);
            if (levelCached)
            {
                levelInput = levelCached;
                
                // SETTING currentLevelStr HERE SINCE IT'S NOT SET IN LOADLEVEL() 
                // BECAUSE WE SUPPLY A LEVELDATA OBJECT (NOT LEVELNAME STRING)
                SaveData.currentLevelStr = levelStr;
            }
        }

        // STORE PERSISTENT OBJECTS, TO CALL OnPostLoadLevel AFTER LOAD
        var persistenObjUIDs:string[] = [];
        var gameLayers = bare.object.GetLayers();
        for (var i = 0; i < gameLayers.length; i++)
        {
            var layer = gameLayers[i];

            for (var j = layer.length - 1; j >= 0; j--)
            {
                var obj = layer[j];
                if (obj instanceof GameObject)
                if (obj.persistent)
                {
                    persistenObjUIDs.push(obj.uniqueID); 
                }
            }
        }

        this.scene.Clear(false);
        
        this.scene.render = false;

        var level: LevelData;
        try
        {
            level = await this.LoadOnly(levelInput || SaveData.currentLevelStr); // IF NO LEVEL SUPPLIED, RELOAD CURRENT LEVEL
        }
        catch (error: any)
        {
            console.error('Failed to load level', error);
            this.scene.render = true;
            return;
        }

        this.scene.render = true;
        this.scene.PostLoadLevel(level, persistenObjUIDs);
        
        //bare.SendEvent(BareEvent.level_loaded, {levelStr: SaveData.currentLevelStr, level: this.currentLevel});
        // NOT USING bare.SendEvent, SINCE THAT SENDS IT TO ALL SCENES, TRIGGERING ENGINE CODE LIKE CAMERA HANDLER EVENT LISTENER THAT RESETS THE BOUNDS TO THE LEVEL
        bare.events.emit(BareEvent.level_loaded, {levelStr: SaveData.currentLevelStr, level: this.currentLevel!});
        bare.globalEvents.emit(BareEvent.level_loaded, {levelStr: SaveData.currentLevelStr, level: this.currentLevel!});

        return level;
    }

    async LoadOnly(levelInput: string | LevelData): Promise<LevelData>
    {
        var level: LevelData;
        var levelStr: string = "";

        if (typeof levelInput === 'string')
        {
            // LEVEL NAME
            level = await this.LoadData(levelInput);
            level.name = levelInput; // SETTING THE NAME HERE, SO WE CAN USE IT LATER WHEN SAVING
            levelStr = levelInput;
            //SaveData.currentLevelStr = levelStr;
        }
        else
        {
            // LEVEL DATA
            level = levelInput;
            levelStr = level.name; // DON'T REALLY WANT TO USE THIS LEVEL PROPERTY? NOT SAME AS ACTUAL NAME OF FILE - CHANGED IT SO IT IS

            // cache it under its name, so Restart()/LoadCurrent() can reload it instead of fetching a file that may not exist
            if (!level.isData && levelStr)
                LevelHandler.levelCache.set(levelStr, level);
        }

        // WHEN A LEVEL IS SET AS DATA, WE DON'T SET SaveData.currentLevelStr TO NOT LOAD IT WHEN CLOSING THE EDITOR
        // HAPPENS FOR A HITBOX OR MAP LEVEL
        if (!level.isData) 
            SaveData.currentLevelStr = levelStr;

        // SOME LEVELS HAVE settingsData SET, SO WE LOAD THAT FIRST HERE
        // TO THEN LOAD THE LEVEL THAT WILL USE THAT settingsData
        // EG: map.json HAS settingsData: "mapData"
        // THIS IS NOW ONLY USED WHEN SELECTING A LEVEL FROM THE PLUGIN AND LOADING IT
        // FOR INGAME USE, YOU MORE LIKELY SUPPLY THE settingsData DIRECTLY INSTEAD OF LOADING IT
        // EG:
        // await bare.scene.Add(EditorScene, {
        //     levelPathOrData: "data/levels/map.json",
        //     settingsHandler: game.mapSettingsHandler,
        // });
        if (level.settingsData && level.settingsData != this.scene.settingsData.name)
            await this.LoadSettingsData(level.settingsData);

        for (const layerName in level.entitiesByLayer)
            level.entitiesByLayer[layerName] = this.scene.settingsHandler.RemoveDanglingReferences(level.entitiesByLayer[layerName], level.name);

        this.currentLevel = level;

        if (level.backgroundColor)
        {
            //this.backgroundColor = Color.fromHex(level.backgroundColor); // CAUSES FLASH ON LEVEL SWITCH AND NOT USEFUL FOR DEMO
            bare.SetBackgroundColor(Color.fromHex(level.backgroundColor));
        }

        await this.scene.OnPreLoadLevel(level);


        // LOAD ALL TEXTURES
        await Promise.all(this.LoadTextures(level));

        // CREATE ALL OBJECTS
        for (var layerName in level.entitiesByLayer)
        {
            var entities = level.entitiesByLayer[layerName];
            for(var levelEntity of entities)
            {
                var gameObject = this.scene.AddGameObject(levelEntity, layerName);
                gameObject.save = true;
            }
        }

        trace('Level loaded:', levelStr);
        
        return level;
    }

    async LoadSettingsData(settingsDataName: string): Promise<void>
    {
        var settingsData = await Helper.loadJSON<SettingsData>(`${bare.dataPath}/${settingsDataName}.json`);
        
        // 
        //this.scene.settingsHandler = new SettingsHandler(this.scene);
        //this.scene.settingsHandler.Process(settingsData);

        //this.scene.settingsHandler.SetRaw(settingsData);

        // INSTATIATE A NEW SETTINGS HANDLER, SO THE OLD ONE IS LOST
        // WHEN GOING FROM GAME TO EDITOR, EDITOR TAKES SETTINGS HANDLER FROM GAME
        // SO IN THIS CASE, WE DON'T WANT TO WRITE TO THAT
        this.scene.settingsHandler = new SettingsHandler(this.scene);

        await this.scene.settingsHandler.Process(settingsData);

    }

    LoadTextures(level: LevelData = this.currentLevel!): Promise<Texture>[]
    {
        var promisesAr: Array<Promise<Texture>> = [];
        var texturesFound = new Set<string>();

        var collectTextures = (entity: any) => {
            if (!entity.texture || entity.texture == "NAME")
            {
                entity = this.scene.ConstructEntity(entity, this.scene.settingsData);
            }

            if (Bare.assets.images.length > 0 && entity.texture && entity.texture != "NONE" && entity.texture != "placeHolder")
            {
                var fullPath = MakePathForEntity(entity);

                var hasEntityImage = Bare.assets.images.includes(fullPath) || assetsHandler.HasTexture(fullPath);
                
                if (!hasEntityImage)
                {
                    if (entity.baseClass != "TextObject")
                    if (__STRIP_GENERATED_ASSETS__)
                    {
                        console.warn(`Could not find image for entity: ${entity.name}\n
This is fine for dev, but for production you need to provide an exsiting image name for this entity. Or you get a failed image request.\n
Alternatively, to skip the image request, prepend it with -, eg: AddGameObject("-${entity.name}")\n
Or, add:
"bareEngine": {
"stripGeneratedAssets": false
}
to package.json to keep the generated assets (can become large for big projects).`);
                    }

                    return;
                }
                
                if (!texturesFound.has(fullPath) && !assetsHandler.HasTexture(fullPath))
                {
                    promisesAr.push(assetsHandler.LoadTexture(fullPath));
                    texturesFound.add(fullPath);
                }
            }

            // ALSO PRELOAD CHILDREN TEXTURES
            if (entity.children)
            {
                for (const child of entity.children)
                    collectTextures(child);
            }
        };

        // COLLECT TEXTURES FOR EACH ENTITY IN LEVEL
        for (var layerName in level.entitiesByLayer)
        {
            var entities = level.entitiesByLayer[layerName];
            for (var i = 0; i < entities.length; i++)
            {
                collectTextures(entities[i]);
            }
        }

        // COLLECT ADDITIONAL TEXTURES - CAN BE OVERRIDEN IN USER SPACE
        promisesAr.push(...this.scene.OnLoadLevelTextures(level));

        return promisesAr;
    }

    // THIS SAVES THE LEVEL -IF- bare.storage HAS BEEN CALLED (MAKING SaveDataHandler EXIST).
    // SaveDataHandler LISTENS FOR THE level_postSave EVENT AND SAVES ITS DATA, INCLUDING THE LEVEL DATA
    // IF YOU'D WANT TO JUST STORE A LEVEL, YOU CALL Serialize(), THEN TO FINALLY SAVE ALL, CALL Save()
    //    COULD BE USEFUL FOR A GAME WHERE YOU GO THROUGH LEVELS AND WANT TO REMEMBER THEIR STATE,
    //    BUT WHEN YOU DIE, THEY SHOULD BE REVERTED TO THEIR PREVIOUS STATE, USING LevelHandler.ClearCache() AND POTENTIALLY Load()
    //    HOWEVER, WHEN YOU REACH A SAVE POINT, YOU CAN CALL Save() TO SAVE THEM ALL
    async Save(): Promise<LevelData>
    {
        const level = this.currentLevel!;

        //events.emit(BareEvent.level_preSave, {levelStr: SaveData.currentLevelStr});
        bare.SendEvent(BareEvent.level_preSave, {levelStr: SaveData.currentLevelStr});
        
        this.Serialize(level);

        //events.emit(BareEvent.level_postSave, {levelStr: SaveData.currentLevelStr, level: level});
        bare.SendEvent(BareEvent.level_postSave, {levelStr: SaveData.currentLevelStr, level: level});

        return level;
    }

    // THIS JUST REPOPULATES THE entitiesByLayer OF THE LEVEL
    Serialize(level: LevelData = this.currentLevel!): LevelData
    {
        var gameLayers = bare.object.GetLayers();
        var layersSettings = this.scene.settingsData.layers;
        for (var i = 0; i < gameLayers.length; i++)
        {
            var layerName = layersSettings[i];
            var layerInfo = this.scene.settingsData.layersInfo[layerName];

            // SHOULD BE A SAVEABLE LAYER
            if (!layerInfo.save)
                continue;

            var gameObjs = gameLayers[i];
            layerName = layerInfo.name!;

            level.entitiesByLayer[layerName] = gameObjs
                .filter(obj => !obj.persistent && obj.save) // ONLY LOOK AT NON-PERSISTENT AND SAVEABLE OBJECTS
                .map(obj => {
                    //if (obj.name == "")
                    //    trace("NO NAME");

                    // IF HAS PIVOT HAS BEEN SET IN CODE, BUT WANT TO KEEP SAVING AT ORIGINAL POSITION, THIS REVERTS THE PIVOT
                    if (obj.revertPivotOnSave)
                    {
                        obj.x -= obj.pivotX;
                        obj.y -= obj.pivotY;
                    }
                    
                    var entity = this.SerializeObject(obj);

                    // top-level objects are always saved, so they don't need the mark. children keep theirs (see GetEntityFromObject)
                    delete entity.save;

                    // POSITION HAS BEEN STORED, CAN APPLY PIVOT AGAIN
                    if (obj.revertPivotOnSave)
                    {
                        obj.x += obj.pivotX;
                        obj.y += obj.pivotY;
                    }
                    return entity;
                });
        }

        GameObjectSerializer.CleanEntities(Object.values(level.entitiesByLayer), this.scene.settingsHandler.rawEntitiesMappedByUID, ["interactableInEditor"]);
    
        return level;
    }

    // SERIALIZE OBJECT DIFF
    SerializeObject(obj: GameObject, options: ConstructEntityOptions = { propsToIgnoreInEntity: [], fillPresets: true, forceAllEntityVars: false }): Entity
    {
        var entity = this.scene.GetEntityFromObject(obj, options);

        //delete entity.name;

        return entity;
    }

    AssignEntityToChildren(gameObject: GameObject, levelEntity: Entity)
    {
        for (var i = 0; i < gameObject.children.length; i++)
        {
            gameObject.children[i].entity = levelEntity.children[i];
            this.AssignEntityToChildren(gameObject.children[i], levelEntity.children[i]);
        }
    }

    PreRender()
    {
        // if (this.backgroundColor)
        //     rapid.drawRect({ width: this.currentLevel.dimensions.width, height: this.currentLevel.dimensions.height, color: this.backgroundColor });
    }

    // NOT MEANT TO CLEAR THE CURRENT LEVEL, EG REMOVE THE OBJECTS
    // FOR THAT USE: bare.object.Clear(false);
    Clear()
    {
        //this.backgroundColor = null;
        this.currentLevel = null;
    }

    static ClearCache()
    {
        LevelHandler.levelCache = new Map();
    }
}

RegisterController(LevelHandler);

globalEvents.persistent.on(BareEvent.game_completeClear, () => {
    LevelHandler.ClearCache();
});
