
import { BareEngine } from "../bareEngine";
import { objectController } from "../controllers/objectController";
import { sceneController } from "../controllers/sceneController";
import { Color, Texture } from "../libraries/rapid-render";
import { GameMode, MakePath, Scene } from "../main";
import { GameObject } from "../objects/gameObject";
import { EditorUIScene } from "../scenes/editorUIScene";
import { defaultEntityData } from "../types/bareData";
import { BareEvent, Component, Entity, LevelData, SaveData, SettingsData } from '../types/bareTypes';
import { Helper } from "../utils/helper";
import { assetsHandler } from "./assetsHandler";

export class LevelHandler
{
    private static editorUISceneRequested: boolean = false;

    currentLevel: LevelData;
    levelCache: Map<string, LevelData> = new Map();
    
    public scene: Scene;
    
    constructor(scene: Scene)
    {
        this.scene = scene;

        if (__DEV__)
            if (!globalThis.plugin) // ONLY SHOW IF NO PLUGIN EXISTS, ELSE USER CAN PRESS BUTTON IN PLUGIN
                LevelHandler.EnsureEditorSceneRegistered();
    }

    get objectsLayer(): GameObject[]
    {
        return objectController.GetLayerByName("objects");
    }

    async LoadLevelData(levelStr: string): Promise<LevelData>
    {
        var level: LevelData;

        var hasCachedLevel = SaveData.levelCache.has(levelStr);

        if (hasCachedLevel)
        {
            level = SaveData.levelCache.get(levelStr)!;
        }
        else
        {
            level = await Helper.loadJSON<LevelData>(`${bareEngine.levelPath}/${levelStr}.json`);
            SaveData.levelCache.set(levelStr, level);
        }

        return level;
    }

    async LoadCurrentLevel(): Promise<LevelData>
    {
        if (SaveData.currentLevelStr == '')
            return; // NO CURRENT LEVEL

        return this.LoadLevel(SaveData.currentLevelStr);
    }

    async RestartLevel(): Promise<LevelData>
    {
        return this.LoadCurrentLevel();
    }

    async LoadLevel(levelInput: string | LevelData = ""):Promise<LevelData>
    {
        // STORE PERSISTENT OBJECTS, TO CALL ONLEVELCHANGED AFTER LOAD
        var persistenObjUIDs:string[] = [];
        var gameLayers = objectController.GetLayers();
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
        
        await this.scene.OnBeforeLoadLevel();
        this.scene.doRender = false;

        var level = await this.LoadLevelOnly(levelInput || SaveData.currentLevelStr); // IF NO LEVEL SUPPLIED, RELOAD CURRENT LEVEL

        this.scene.doRender = true;
        this.scene.AfterLoadedLevel(level, persistenObjUIDs);
        
        bareEngine.SendEvent(BareEvent.level_loaded, {levelStr: SaveData.currentLevelStr, level: this.currentLevel});

        return level;
    }

    async LoadSettingsData(settingsDataName: string): Promise<void>
    {
        var settingsData = await Helper.loadJSON<SettingsData>(`${bareEngine.dataPath}/${settingsDataName}.json`);
        
        // 
        //this.scene.settingsHandler = new SettingsHandler(this.scene);
        //this.scene.settingsHandler.Process(settingsData);

        //this.scene.settingsHandler.SetRaw(settingsData);
        await this.scene.settingsHandler.Process(settingsData);
    }

    async LoadLevelOnly(levelInput: string | LevelData): Promise<LevelData>
    {
        var level: LevelData;
        var levelStr: string = "";

        if (typeof levelInput === 'string')
        {
            // LEVEL NAME
            level = await this.LoadLevelData(levelInput);
            level.name = levelInput; // SETTING THE NAME HERE, SO WE CAN USE IT LATER WHEN SAVING
            levelStr = levelInput;
            //SaveData.currentLevelStr = levelStr;
        }
        else
        {
            // LEVEL DATA
            level = levelInput;
            levelStr = level.name; // DON'T REALLY WANT TO USE THIS LEVEL PROPERTY? NOT SAME AS ACTUAL NAME OF FILE - CHANGED IT SO IT IS
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
        // await sceneController.Add(EditorScene, {
        //     levelPathOrData: "assets/data/levels/map.json",
        //     settingsHandler: game.mapDataStore,
        // });
        if (level.settingsData && level.settingsData != this.scene.settingsData.name)
            await this.LoadSettingsData(level.settingsData);

        this.currentLevel = level;
        //SaveData.currentLevelStr = levelStr;

        if (level.backgroundColor)
            rapid.backgroundColor = Color.fromHex(level.backgroundColor);

        // LOAD ALL TEXTURES
        await Promise.all(this.CreatePromiseLevelTextures(level));

        // CREATE ALL OBJECTS
        for (var layerName in level.entitiesByLayer) {
            var entities = level.entitiesByLayer[layerName];
            for(var levelEntity of entities)
            {
                var layerNameLowerCase = layerName.toLowerCase();
                var layer = this.scene.layerNames.indexOf(layerNameLowerCase);
                var gameObject = this.scene.AddGameObject(levelEntity, layer);

                gameObject.levelEntity = levelEntity;
                gameObject.save = true;
            }
        }

        trace('Level loaded:', levelStr);
        
        //globalEvents.emit(BareEvent.level_loaded, {levelStr: levelStr, level: this.currentLevel});
        //this.scene.events.emit(BareEvent.level_loaded, {levelStr: levelStr, level: this.currentLevel});
        
        return level;
    }

    CreatePromiseLevelTextures(level: LevelData)
    {
        var promisesAr: Array<Promise<Texture>> = [];
        var texturesFound = new Set<string>();

        var collectTextures = (entity: any) => {
            var entityConstructed = this.scene.ConstructEntity(entity);
            var imagePath = entityConstructed.imagePath;
            var fullPath = MakePath(imagePath, entity.name);

            if (!texturesFound.has(fullPath) && !assetsHandler.HasTexture(fullPath))
            {
                promisesAr.push(assetsHandler.GetTexturePromise(fullPath));
                texturesFound.add(fullPath);
            }

            // ALSO PRELOAD CHILDREN TEXTURES
            if (entityConstructed.children)
            {
                for (const child of entityConstructed.children)
                    collectTextures(child);
            }
        };

        for (var layerName in level.entitiesByLayer) {
            var entities = level.entitiesByLayer[layerName];
            entities.forEach(collectTextures);
        }

        return promisesAr;
    }

    async SaveLevel()
    {
        events.emit(BareEvent.level_preSave, {levelStr: SaveData.currentLevelStr});

        const level = this.currentLevel;
        this.SerializeLevel(level);

        events.emit(BareEvent.level_postSave, {levelStr: SaveData.currentLevelStr, level: level});
        
        return level;
    }

    // THIS JUST REPOPULATES THE entitiesByLayer OF THE LEVEL
    SerializeLevel(level: LevelData)
    {
        var gameLayers = objectController.GetLayers();
        for (var i = 0; i < gameLayers.length; i++)
        {
            var layerInfo = this.scene.layerInfos[i];

            // SHOULD BE A SAVEABLE LAYER
            if (!layerInfo.doSave)
                continue;

            var gameObjs = gameLayers[i];
            var layerName = layerInfo.name;

            level.entitiesByLayer[layerName] = gameObjs
                .filter(obj => !obj.persistent && obj.save) // ONLY LOOK AT NON-PERSISTENT AND SAVEABLE OBJECTS
                .map(obj => {
                    if (obj.name == "")
                        trace("NO NAME");

                    var entity:Entity;
                    
                    if (window.gameMode == GameMode.Game)
                        entity = this.SerializeObject(obj); // FOR GAME, WE WANT TO SERIALIZE THE OBJECT, NO HASSLE OF ALIGNING IT WITH levelEntity, AND NO editorCompents ANYWAY
                    else
                    if (window.gameMode == GameMode.Editor)
                        entity = obj.levelEntity; // SOURCE OF TRUTH FOR EDITOR. THIS MAKES IT SO THAT THE OBJECT innerScale CAN PULSE FOR EXAMPLE (BY editorComponent) AND IT DOESN'T GET SAVED

                    // NOT SERIALIZING THE OBJECT FOR GameMode.Editor WORKS NOW, 
                    // BUT IT'S JUST FOR THIS LITTLE EDGE CASE WHERE SOME editorComponent CAN ALTER THE OBJECT'S PROPERTIES
                    // MAYBE REVERT THIS IF IT'S NOT WORTH THE SPLIT?

                    return entity;
                });
        }
    }

    SerializeObject(obj: GameObject): Entity
    {
        // IF HAS PIVOT HAS BEEN SET IN CODE, BUT WANT TO KEEP SAVING AT ORIGINAL POSITION, THIS REVERTS THE PIVOT
        if (obj.revertPivotOnSave)
        {
            obj.x -= obj.pivotX;
            obj.y -= obj.pivotY;
        }
        
        var entity:Entity = {
            name: obj.name,
            position: obj.position.clone()
        };

        // POSITION HAS BEEN STORED, CAN APPLY PIVOT AGAIN
        if (obj.revertPivotOnSave)
        {
            obj.x += obj.pivotX;
            obj.y += obj.pivotY;
        }

        var origEntity = this.scene.ConstructEntity(obj.name);

        var objDiff = this.GetChangedSaveValues(obj, origEntity);
        if (Object.keys(objDiff).length > 0)
            Object.assign(entity, objDiff); // APPLY DIFF TO entity

        var components = this.scene.GetAllComponentsFrom(obj);
        
        if (gameMode == GameMode.Game)
        {
            // INGAME, SERIALIZE COMPONENTS, SET STORED EDITOR-COMPONENTS

            if (components.length > 0)
            {
                var diffedComponents = this.DiffComponents(components, origEntity.components);
                if (diffedComponents)
                    entity.components = diffedComponents;
            }

            var removedComponents = this.GetRemovedComponents(components, origEntity.components);
            if (removedComponents.length > 0)
                entity.componentsRemoved = removedComponents;

            if (obj.levelEntity?.editorComponents)
                entity.editorComponents = obj.levelEntity?.editorComponents;
        }
        else
        if (gameMode == GameMode.Editor)
        {
            // IN EDITOR, SERIALIZE EDITOR-COMPONENTS, SET STORED COMPONENTS

            if (components.length > 0)
            {
                var diffedComponents = this.DiffComponents(components, origEntity.editorComponents);
                if (diffedComponents)
                    entity.editorComponents = diffedComponents;
            }

            var removedComponents = this.GetRemovedComponents(components, origEntity.editorComponents);//
            if (removedComponents.length > 0)
                entity.componentsRemoved = removedComponents;

            if (obj.levelEntity?.components)
                entity.components = obj.levelEntity?.components;
        }

        // SERIALIZE CHILDREN RECURSIVELY
        var saveableChildren = obj.children.filter(child => !child.persistent && child.save);
        if (saveableChildren.length > 0)
            entity.children = saveableChildren.map(child => this.SerializeObject(child));

        return entity;
    }

    GetChangedSaveValues(gameObject: GameObject, origEntity: Entity): any
    {
        const obj: Record<string, any> = {};

        // GET VARS TO SAVE
        var varsToSave: string[] = []
        var saveVars = this.scene.settingsData.saveVars;
        if (saveVars) // WILL ALWAYS BE THERE REALLY
        {
            var constructorName = this.scene.GetContructorName(gameObject);

            if (saveVars[constructorName])
            {
                varsToSave = saveVars[constructorName]; // MERGE THIS WITH defaultEntityData.saveVars!["GameObject"]? TODO
            }
            else
            {
                if (constructorName == "GameObject")
                    varsToSave = defaultEntityData.saveVars!["GameObject"];
                else
                    console.warn("NO VARS TO SAVE FOR " + constructorName);
            }
        }

        // COMPARE EACH SAVE VAR WITH ORIGINAL ENTITY AND STORE IF IT IS DIFFERENT
        for (var varName of varsToSave)
        {
            const key = (varName as keyof GameObject);
            const currentValue = gameObject[key];
            const origValue = origEntity[key]; //gameObject.entity?.[varName];

            if (origValue !== undefined && currentValue !== undefined)
            {
                // COMPARE PROPERLY DEPENDING ON TYPE
                let isChanged = false;

                if (typeof currentValue === 'object' && currentValue !== null && 
                    'x' in currentValue && 'y' in currentValue)
                {
                    // X/Y VECTOR
                    isChanged = (currentValue.x !== origValue.x || currentValue.y !== origValue.y);
                }
                else if (Array.isArray(currentValue))
                {
                    // ARRAY
                    isChanged = !Array.isArray(origValue) || 
                                currentValue.length !== origValue.length ||
                                currentValue.some((val, idx) => val !== origValue[idx]);
                }
                else
                {
                    // PRIMITIVE
                    isChanged = (currentValue != origValue);
                }
                
                if (isChanged)
                {
                    Object.assign(obj, {[varName]: currentValue});
                }
            }
        }

        return obj;
    }

    // EG:
    // {
    //     "shadow": {
    //          "show": true
    //     },
    //     "goal": {
    //         "emoji": "🥚",
    //         "target": 3
    //     }
    // }

    
    DiffComponents(components: Component[], origComponents?: Record<string, any>): Record<string, any>
    {
        var serializedCurrentComponents = this.SerializeComponents(components);
        var diff: Record<string, any> = {};

        // ONLY GOING OVER components, IF NOT IN ORIG, ADD AS DIFF
        for (var compName in serializedCurrentComponents)
        {
            var currentComp = serializedCurrentComponents[compName];
            var origComp = origComponents?.[compName];

            if (!origComp)
            {
                diff[compName] = currentComp;
                continue;
            }

            var compDiff: Record<string, any> = {};
            for (var key in currentComp)
            {
                if (currentComp[key] !== origComp[key])
                    compDiff[key] = currentComp[key];
            }

            if (Object.keys(compDiff).length > 0)
                diff[compName] = compDiff;
        }

        if (Object.keys(diff).length > 0)
            return diff;

        return null;
    }

    GetRemovedComponents(components: Component[], origComponents?: Record<string, any>): string[]
    {
        // ONLY GOING OVER origComponents, IF NOT IN components, ADD AS REMOVED
        var removed: string[] = [];

        var serializedCurrentComponents = this.SerializeComponents(components);
        for (var compName in origComponents)
        {
            if (!serializedCurrentComponents[compName])
                removed.push(compName);
        }

        return removed;
    }

    SerializeComponents(components: Component[]): Record<string, Record<string, (string | number | boolean)>>
    {
        if (!components)
            return null;

        var componentsRec: Record<string, Record<string, (string | number | boolean)>> = {};
        for (var i = 0; i < components.length; i++)
        {
            var component = components[i];

            if (component.save === false)
                continue;
            
            var componentData = this.SerializeComponent(component);
            var compName = component.constructor.name.replace('Component', '');
            compName = Helper.DecapitalizeFirstLetter(compName);
            componentsRec[compName] = componentData;
        }

        return componentsRec;
    }

    SerializeComponent(component: Component): Record<string, (string | number | boolean)>
    {
        var componentData: Record<string, (string | number | boolean)> = {};
        var constructorVarNames = (component as any).__paramNames || Helper.GetConstructorParamNames(component.constructor);
        
        // GET VALUE FROM EACH KEY OF CONSTRUCTOR PARAMS
        for (let i = 0; i < constructorVarNames.length; i++)
        {
            const paramName = constructorVarNames[i];
            const paramValue = component[paramName as keyof typeof component] as any; // SHOULD STRING, NUMBER OR BOOLEAN

            // SKIP SCENE
            if (paramName == "scene" || paramValue instanceof Scene)
                continue;

            componentData[paramName] = paramValue;
        }
        
        return componentData;
    }

    Clear()
    {
        this.currentLevel = null;
    }

    private static async EnsureEditorSceneRegistered(): Promise<void>
    {
        if (__DEV__)
        {
            if (LevelHandler.editorUISceneRequested)
                return;

            LevelHandler.editorUISceneRequested = true;

            //const { EditorScene } = await import("../scenes/editorScene");
            sceneController.Add(EditorUIScene);
        }
    }
}

export var levelHandler:LevelHandler;
BareEngine.RegisterController(LevelHandler);
