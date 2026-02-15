
import { BareEngine } from "../bareEngine";
import { objectController } from "../controllers/objectController";
import { sceneController } from "../controllers/sceneController";
import { Color, Texture } from "../libraries/rapid-render";
import { GameMode, globalEvents, MakePath, pipes } from "../main";
import { GameObject } from "../objects/gameObject";
import { EditorUIScene } from "../scenes/editorUIScene";
import { defaultEntityData } from "../types/bareData";
import { BareEvent, Component, Entity, Layer, LevelData, SaveData } from '../types/bareTypes';
import { Helper } from "../utils/helper";
import { assetsHandler } from "./assetsHandler";

export class LevelHandler
{
    private static editorUISceneRequested: boolean = false;

    currentLevel: LevelData;
    levelCache: Map<string, LevelData> = new Map();
    
    constructor()
    {
        if (__DEV__)
            void LevelHandler.EnsureEditorSceneRegistered();
    }

    get objectsLayer(): GameObject[]
    {
        return objectController.GetLayer(Layer.OBJECTS) as GameObject[];
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
            level = await Helper.loadJSON<LevelData>(`${bare.levelPath}/${levelStr}.json`);
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

        bare.Clear(true); // CLEARS EVENTS TOO
        bare.doRender = false;
        await bare.OnBeforeLoadLevel();

        var level = await this.LoadLevelOnly(levelInput || SaveData.currentLevelStr); // IF NO LEVEL SUPPLIED, RELOAD CURRENT LEVEL

        bare.doRender = true;
        bare.AfterLoadedLevel(level, persistenObjUIDs);
        
        return level;
    }

    async LoadLevelOnly(levelInput: string | LevelData): Promise<LevelData>
    {
        var level: LevelData;
        var levelStr: string = "";

        if (typeof levelInput === 'string')
        {
            // LEVEL NAME
            level = await this.LoadLevelData(levelInput);
            levelStr = levelInput;
        }
        else
        {
            // LEVEL DATA
            level = levelInput;
            levelStr = level.name;
        }

        this.currentLevel = level;
        SaveData.currentLevelStr = levelStr;

        if (level.background?.color)
            rapid.backgroundColor = Color.fromHex(level.background.color);

        // LOAD ALL TEXTURES
        await Promise.all(this.CreatePromiseLevelTextures(level));

        // CREATE ALL OBJECTS
        for (var layerName in level.entitiesByLayer) {
            var entities = level.entitiesByLayer[layerName];
            entities.forEach((levelEntity: Entity) => {
                var layerNameLowerCase = Helper.CapitalizeFirstLetter(layerName.toLowerCase());
                var layer = bare.layerNames.indexOf(layerNameLowerCase);
                var gameObject = bare.AddGameObject(levelEntity, layer);

                gameObject.levelEntity = levelEntity;
                gameObject.save = true;
            });
        }

        trace('Level loaded:', levelStr);
        
        globalEvents.emit(BareEvent.level_loaded, {levelStr: levelStr, level: this.currentLevel});
        bare.events.emit(BareEvent.level_loaded, {levelStr: levelStr, level: this.currentLevel});

        return level;
    }

    CreatePromiseLevelTextures(level: LevelData)
    {
        var promisesAr: Array<Promise<Texture>> = [];
        var texturesFound = new Set<string>();
        for (var layerName in level.entitiesByLayer) {
            var entities = level.entitiesByLayer[layerName];
            entities.forEach((entity: any) => {
                var entityConstructed = bare.ConstructEntity(entity);
                var imagePath = entityConstructed.imagePath;
                var fullPath = imagePath + "/" + entity.name;

                if (texturesFound.has(fullPath))
                    return;

                promisesAr.push(assetsHandler.GetTexturePromise(MakePath(imagePath!, entity.name)));
                texturesFound.add(fullPath);
            });
        }

        return promisesAr;
    }

    async SaveLevel()
    {
        globalEvents.emit(BareEvent.level_preSave, {levelStr: SaveData.currentLevelStr});

        const level = (this.currentLevel as LevelData);
        this.SerializeLevel(level);

        globalEvents.emit(BareEvent.level_postSave, {levelStr: SaveData.currentLevelStr, level: this.currentLevel});
        
        return level;
    }

    // THIS JUST REPOPULATES THE entitiesByLayer OF THE LEVEL
    SerializeLevel(level: LevelData)
    {
        var gameLayers = objectController.GetLayers();
        for (var i = 0; i < gameLayers.length; i++)
        {
            var layerInfo = bare.layerInfos[i];

            // SHOULD BE A SAVEABLE LAYER
            if (!layerInfo.doSave)
                continue;

            var gameObjs = gameLayers[i];
            var layerName = layerInfo.name.toUpperCase();

            level.entitiesByLayer[layerName] = gameObjs
                .filter(obj => !obj.persistent && obj.save) // ONLY LOOK AT NON-PERSISTENT AND SAVEABLE OBJECTS
                .map(obj => {
                if (obj.name == "")
                    trace("NO NAME");

                // IF HAS PIVOT HAS BEEN SET IN CODE, BUT WANT TO KEEP SAVING AT ORIGINAL POSITION, THIS REVERTS THE PIVOT
                if (obj.revertPivotOnSave)
                {
                    obj.x -= obj.pivotX;
                    obj.y -= obj.pivotY;
                }
                
                var retObj:Entity = {
                    name: obj.name,
                    position: obj.position.clone()
                };

                // POSITION HAS BEEN STORED, CAN APPLY PIVOT AGAIN
                if (obj.revertPivotOnSave)
                {
                    obj.x += obj.pivotX;
                    obj.y += obj.pivotY;
                }

                var objDiff = this.GetChangedValues(obj);
                if (Object.keys(objDiff).length > 0)
                    Object.assign(retObj, objDiff);

                var components = bare.GetAllComponentsFrom(obj);
                
                if (gameMode == GameMode.Game)
                {
                    // INGAME, SERIALIZE COMPONENTS, SET STORED EDITOR-COMPONENTS
                    if (components && components.length > 0)
                        retObj.components = this.SerializeComponents(components);

                    if (obj.levelEntity?.editorComponents)
                        retObj.editorComponents = obj.levelEntity?.editorComponents;
                }
                else
                if (gameMode == GameMode.Editor)
                {
                    // IN EDITOR, SERIALIZE EDITOR-COMPONENTS, SET STORED COMPONENTS
                    if (components && components.length > 0)
                        retObj.editorComponents = this.SerializeComponents(components);
                    
                    if (obj.levelEntity?.components)
                        retObj.components = obj.levelEntity?.components;
                }

                return retObj;
            });
        }
    }

    GetChangedValues(gameObject: GameObject): any
    {
        const obj: Record<string, any> = {};

        // GET VARS TO SAVE
        var varsToSave: string[] = []
        var saveVars = bare.currentSettings.saveVars;
        if (saveVars)
        {
            var constructorName = bare.GetContructorName(gameObject);

            if (saveVars[constructorName])
            {
                varsToSave = saveVars[constructorName];
            }
            else
            {
                if (constructorName == "GameObject")
                    varsToSave = defaultEntityData.saveVars!["GameObject"];
                else
                    console.warn("NO VARS TO SAVE FOR " + constructorName);
            }
        }

        if (!gameObject.levelEntity)
            gameObject.levelEntity = {name: gameObject.name};

        if (!gameObject.levelEntity)
        {
            // THIS IS TOO HARD TO IMAGINE ATM, DON'T HAVE A CLEAR USE CASE YET, DO WE SAVE THE TEXTURE PATH TOO? OR JUST THE NAME?
            //var varsToSave = saveVars[gameObject.constructor.name];
            
            //var defaultValue = (dummyGameObject as Record<string, any>)[varName as keyof GameObject];
        }
        else
        {
            // WE ALWAYS CARE ABOUT THE LEVEL ENTITY VARS, EVEN IF UNCHANGED
            for (var varName in gameObject.levelEntity)
            {
                if (varName == "name" || varName == "position")
                    continue; // THESE ARE ALREADY IN SAVED BY DEFAULT
                
                const key = varName as keyof Entity;
                const value = gameObject.levelEntity[key];

                if (varName == "extendData" && value == "ANY")
                    continue; // IN BAREGAME CONTRUCTENTIY() WE SET entity.extendData = "ANY"; ONCE, SO IT DOENS'T HAVE TO CHECK CONSECUTIVE TIMES. BUT WE DON'T WANT THAT IN OUR SAVEGAME

                Object.assign(obj, { [key]: value });
            }

            // FOR OTHER (DERIVED VARS), CHECK IF CHANGED
            const entityData = gameObject.entity as Record<string, any> | null;
            if (entityData)
            {
                for (var varName of varsToSave)
                {
                    //if (gameObject.levelEntity.hasOwnProperty(varName)) // ALSO DON'T ALWAYS WANT THIS, EG ADDING pivotBasedOnHitbox ON A HITBOX, THEN WANT IT TO SAVE
                    //    continue; // ALREADY PROCESSED, LEVEL ENTITY TAKES PRECEDENCE - COULD MAKE NEW INST VARTOSAVE AND DELETE THIS PROP FOR PERF

                    var origValue = (entityData[varName] ?? bare.dummyGameObject[varName as keyof GameObject]);
                    var currentValue = gameObject[varName as keyof GameObject];

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
            }
        }

        return obj;
    }

    SerializeComponents(components: Component[]): any
    {
        if (!components)
            return null;

        var componentsRec: Record<string, any> = {};
        for (var i = 0; i < components.length; i++)
        {
            var component = components[i];
            var componentData = this.SerializeComponent(component);
            var compName = component.constructor.name.replace('Component', '');
            compName = Helper.DecapitalizeFirstLetter(compName);
            componentsRec[compName] = componentData;
        }

        return componentsRec;
    }

    SerializeComponent(component: Component): any
    {
        var componentData: any = {};
        var constructorVarNames = Helper.GetConstructorParamNames(component.constructor);
        
        // Loop through each constructor parameter name
        for (let i = 0; i < constructorVarNames.length; i++)
        {
            const paramName = constructorVarNames[i];
            const paramValue = component[paramName as keyof typeof component];
            componentData[paramName] = paramValue;
        }
        
        return componentData;
    }

    Clear(full: boolean = false)
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

export const levelHandler = BareEngine.RegisterControllerProxy(LevelHandler);