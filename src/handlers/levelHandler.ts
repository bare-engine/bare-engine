
import { objectController } from "../controllers/objectController";
import type { Component } from "../controllers/componentController";
import { GameMode, MakePathForEntity, RegisterController } from "../globals";
import { Color, Texture, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import { Scene } from "../scenes/scene";
import { defaultSettingsData } from "../types/bareData";
import { BareEvent, BareEventPayload, ConstructEntityOptions, Entity, entityVars, LevelData, SaveData, Scalar, SettingsData } from '../types/bareTypes';
import { Hitbox } from "../types/hitbox";
import { getSaveFields } from "../utils/decorators";
import { Helper } from "../utils/helper";
import { assetsHandler } from "./assetsHandler";
import { SettingsHandler } from "./settingsHandler";

export class LevelHandler
{
    static levelCache: Map<string, LevelData> = new Map();
    
    currentLevel: LevelData;
    
    public scene: Scene;
    backgroundColor: Color | null = null;
    
    constructor(scene: Scene)
    {
        this.scene = scene;

        if (bare.preloadedLevels)
        {
            LevelHandler.levelCache = new Map(bare.preloadedLevels);
            bare.preloadedLevels = null;
        }

        defaultSettingsData.saveVars.GameObject.push("save");

        this.scene.events.on(BareEvent.game_objectAdded, this.OnGameObjectAdded.bind(this));
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
        return objectController.GetLayerByName("objects");
    }

    async LoadData(levelStr: string): Promise<LevelData>
    {
        var level: LevelData;

        var hasCachedLevel = SaveData.levelCache.has(levelStr);

        if (hasCachedLevel)
        {
            level = SaveData.levelCache.get(levelStr)!;
        }
        else
        {
            if (LevelHandler.levelCache.has(levelStr))
            {
                level = LevelHandler.levelCache.get(levelStr)!;
            }
            else
            {
                try
                {
                    level = await Helper.loadJSON<LevelData>(`${bare.levelPath}/${levelStr}.json`);
                    LevelHandler.levelCache.set(levelStr, level);
                }
                catch (error)
                {
                    throw new Error(`Failed to load level "${levelStr}": ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }

        return level;
    }

    async LoadCurrent(): Promise<LevelData>
    {
        if (SaveData.currentLevelStr == '')
            return; // NO CURRENT LEVEL

        return this.Load(SaveData.currentLevelStr);
    }

    async Restart(): Promise<LevelData>
    {
        return this.LoadCurrent();
    }

    async Load(levelInput: string | LevelData = ""):Promise<LevelData>
    {
        // WHEN IN PRODUCTION, WE DON'T LOAD LEVELS FROM DISK INITIALLY
        // BUT ONCE PLAYER EDITS IT IN LEVEL EDITOR, IT'S LOADED FROM CACHE (SINCE IN PROD WE CAN'T SAVE EDITS TO DISK)
        if (!window.isLocalhost)
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
        
        this.scene.doRender = false;

        var level: LevelData;
        try
        {
            level = await this.LoadOnly(levelInput || SaveData.currentLevelStr); // IF NO LEVEL SUPPLIED, RELOAD CURRENT LEVEL
        }
        catch (error: any)
        {
            console.error('Failed to load level', error);
            return;
        }

        this.scene.doRender = true;
        this.scene.PostLoadLevel(level, persistenObjUIDs);
        
        bare.SendEvent(BareEvent.level_loaded, {levelStr: SaveData.currentLevelStr, level: this.currentLevel});

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
        //     levelPathOrData: "data/levels/map.json",
        //     settingsHandler: game.mapSettingsHandler,
        // });
        if (level.settingsData && level.settingsData != this.scene.settingsData.name)
            await this.LoadSettingsData(level.settingsData);

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
        for (var layerName in level.entitiesByLayer) {
            var entities = level.entitiesByLayer[layerName];
            for(var levelEntity of entities)
            {
                var gameObject = this.scene.AddGameObject(levelEntity, layerName);

                // WHEN IN EDITOR, WE WANT TO USE levelEntity
                // BUT IT'S KIND OF MESSED UP AND CONSTRUCTED BY ABOVE NOW
                // SO HERE WE ALIGN IT AGAIN TO ITS CHILDREN
                //this.AssignEntityToChildren(gameObject, levelEntity);
                
                gameObject.levelEntity = levelEntity;
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

    LoadTextures(level: LevelData): Promise<Texture>[]
    {
        var promisesAr: Array<Promise<Texture>> = [];
        var texturesFound = new Set<string>();

        var collectTextures = (entity: any) => {
            var entityConstructed = this.scene.ConstructEntity(entity);

            if (entityConstructed.texture != "NONE")
            {
                var fullPath = MakePathForEntity(entityConstructed);

                if (!texturesFound.has(fullPath) && !assetsHandler.HasTexture(fullPath))
                {
                    promisesAr.push(assetsHandler.GetTexturePromise(fullPath));
                    texturesFound.add(fullPath);
                }
            }

            // ALSO PRELOAD CHILDREN TEXTURES
            if (entityConstructed.children)
            {
                for (const child of entityConstructed.children)
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

    async Save()
    {
        //events.emit(BareEvent.level_preSave, {levelStr: SaveData.currentLevelStr});
        bare.SendEvent(BareEvent.level_preSave, {levelStr: SaveData.currentLevelStr});
        
        const level = this.currentLevel;
        this.Serialize(level);

        //events.emit(BareEvent.level_postSave, {levelStr: SaveData.currentLevelStr, level: level});
        bare.SendEvent(BareEvent.level_postSave, {levelStr: SaveData.currentLevelStr, level: level});

        return level;
    }

    // THIS JUST REPOPULATES THE entitiesByLayer OF THE LEVEL
    Serialize(level: LevelData)
    {
        var gameLayers = objectController.GetLayers();
        var layersSettings = this.scene.settingsData.layers;
        for (var i = 0; i < gameLayers.length; i++)
        {
            var layerName = layersSettings[i];
            var layerInfo = this.scene.settingsData.layersInfo[layerName];

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

                    // IF HAS PIVOT HAS BEEN SET IN CODE, BUT WANT TO KEEP SAVING AT ORIGINAL POSITION, THIS REVERTS THE PIVOT
                    if (obj.revertPivotOnSave)
                    {
                        obj.x -= obj.pivotX;
                        obj.y -= obj.pivotY;
                    }
                    
                    var entity = this.SerializeObject(obj);

                    // POSITION HAS BEEN STORED, CAN APPLY PIVOT AGAIN
                    if (obj.revertPivotOnSave)
                    {
                        obj.x += obj.pivotX;
                        obj.y += obj.pivotY;
                    }
                    return entity;
                });
        }
    }

    SerializeObjectFully(obj: GameObject, forceAllEntityVars:boolean = false): Entity
    {
        var entity:Entity = {
            //name: obj.name,
        };

        // GET VARS TO SAVE
        var varsToSave: string[] = [];

        if (bare.gameMode == GameMode.Game && !forceAllEntityVars)
        {
            var saveVars = this.scene.settingsData.saveVars;
            if (saveVars) // WILL ALWAYS BE THERE REALLY
            {
                var constructorName = this.scene.GetContructorName(obj);

                if (saveVars[constructorName])
                {
                    varsToSave = saveVars[constructorName];
                }
                else
                {
                    if (constructorName == "GameObject")
                        varsToSave = defaultSettingsData.saveVars!["GameObject"];
                    else
                        console.warn("NO VARS TO SAVE FOR " + constructorName);
                }
            }

            varsToSave = varsToSave.slice();

            // CHECK levelEntity TO SEE IF THERE ARE ADDITIONAL VARS TO SAVE
            // EG: IF A LEVEL ENTITY WITH ALPHA 0.5 IS DEFINED IN A LEVEL,
            // WE WANT TO SAVE THAT, EVEN THOUGH IT MIGHT NOT BE SET IN saveVars
            if (obj.levelEntity)
            {
                for (var varName in obj.levelEntity)
                {
                    if (varName == "name")
                        continue;

                    if (!varsToSave.includes(varName))
                        varsToSave.push(varName);
                }
            }
        }
        else
        if (bare.gameMode == GameMode.Editor || forceAllEntityVars)
        {
            varsToSave = entityVars.slice();
            //varsToSave.splice(varsToSave.indexOf("position"), 1);
            varsToSave.splice(varsToSave.indexOf("tapHitbox"), 1);
            //varsToSave.splice(varsToSave.indexOf("save"), 1);
        }

        // EDGE CASE, WANT TO ALWAYS SAVE (TOP LEVEL) OBJECT WITHOUT A PARENT, NO NEED TO SUPPLY THE SAVE PROPERTY
        // CHILDREN DO NEED IT
        if (!obj.parent)
            varsToSave.splice(varsToSave.indexOf("save"), 1);

        // 
        var customSerialize:Record<string, (currentValue) => any> = {};
    
        customSerialize["pivot"] = (pivot:Vec2) => {
            if (obj.entity?.pivot)
                return obj.entity.pivot;
            else
                return pivot;
        };

        customSerialize["hitbox"] = (physicsHitbox:Hitbox) => {
            if (obj.entity?.hitbox)
                return obj.entity.hitbox;
            else
                return {x: physicsHitbox.rectangle.x, y: physicsHitbox.rectangle.y, width: physicsHitbox.rectangle.width, height: physicsHitbox.rectangle.height};
        };

        customSerialize["texture"] = (currentValue:Texture) => { return currentValue.texturePath; };

        customSerialize["color"] = (currentValue:Color) => { return currentValue.toHex(); };

        customSerialize["children"] = (currentValue:GameObject[]):Entity[] => { 
            var children:Entity[] = [];
            for (var child of currentValue)
            {
                if ((!child.persistent && child.save) || forceAllEntityVars)
                    children.push(this.SerializeObjectFully(child));
            }
            return children;
        };

        customSerialize["components"] = (currentValue:Component[]):Record<string, any> => {
            var comps = {}
            for (var comp of currentValue)
            {
                if (comp.save || forceAllEntityVars)
                {
                    var compData = this.SerializeComponent(comp);
                    var name = bare.GetComponentNameFromClassName(comp.constructor.name);
                    comps[name] = compData;
                }
            }
            return comps;
        };

        for (var varName of varsToSave)
        {
            const key = (varName as keyof GameObject);
            var serializedValue;

            var objValue = obj[key];

            if (customSerialize[varName] && objValue)
                serializedValue = customSerialize[varName](objValue);
            else
                serializedValue = this.scene.GetSerializedValueFromObject(obj, key);

            entity[varName] = serializedValue;
        }

        return entity;
    }

    // SERIALIZE OBJECT DIFF
    // THIS IS A VERY INEFFICIENT WAY TO IT, BUT... EASY TO FOLLOW AND IN ONE PLACE
    // COME BACK LATER TO OPTIMIZE/CACHE - TODO
    // USED levelEntity BEFORE, KEEPING TRACK CHANGES, BUT KEPT GETTING EDGE CASES ALL OVER
    SerializeObject(obj: GameObject, options: ConstructEntityOptions = { propsToIgnoreInEntity: [], fillPresets: true }): Entity
    {
        var entity:Entity = {
            name: obj.name,
        };

        var origEntity = this.scene.GetAppliedEntityWithDefaultValues(obj.name, this.scene.settingsData, options);
        var fullEntity = this.SerializeObjectFully(obj);
        var diffEntity = this.GetEntitiesDiff(origEntity, fullEntity);

        if (diffEntity)
        {
            // ROUND POSITION
            if (diffEntity.position)
            {
                if (diffEntity.position.x)
                    diffEntity.position.x = Math.round(diffEntity.position.x);
                if (diffEntity.position.y)
                    diffEntity.position.y = Math.round(diffEntity.position.y);
            }

            // APPLY DIFF TO entity
            Object.assign(entity, diffEntity);
        }

        return entity;
    }

    GetEntitiesDiff(orig: Entity, updated: Entity): any
    {
        var diff = this.GetObjectDiff(orig, updated) ?? {};

        this.AddRemovedComponents(orig, updated, diff);

        return Object.keys(diff).length > 0 ? diff : undefined;
    }

    AddRemovedComponents(orig: Entity, updated: Entity, diff: any)
    {
        if (orig.components)
        {
            const updatedComps = updated.components ?? {};
            const removed = Object.keys(orig.components).filter(key => !(key in updatedComps));
            if (removed.length > 0)
                diff.componentsRemoved = removed;
        }

        if (orig.children && updated.children)
        {
            for (let i = 0; i < Math.min(orig.children.length, updated.children.length); i++)
            {
                diff.children ??= [];
                diff.children[i] ??= {};
                this.AddRemovedComponents(orig.children[i], updated.children[i], diff.children[i]);
            }
        }
    }

    GetGenericDiff(orig: any, updated: any): any
    {
        if (orig === updated)
            return undefined;

        if (Array.isArray(orig) && Array.isArray(updated))
            return this.GetArrayDiff(orig, updated);

        if (this.IsPlainObject(orig) && this.IsPlainObject(updated))
            return this.GetObjectDiff(orig, updated);

        if (this.IsEmpty(updated))
            return this.IsEmpty(orig) ? undefined : updated;

        return updated;
    }

    GetArrayDiff(orig: any[], updated: any[]): any
    {
        const diff: any[] = [];
        let hasDiff = false;

        for (let i = 0; i < Math.max(orig.length, updated.length); i++)
        {
            let value: any = undefined;

            if (i >= orig.length)
                value = updated[i];
            else if (i >= updated.length)
                continue;
            else
                value = this.GetGenericDiff(orig[i], updated[i]) ?? {};

            diff.push(value);

            if (value !== undefined && !(typeof value === "object" && value && Object.keys(value).length === 0))
                hasDiff = true;
        }

        return hasDiff ? diff : undefined;
    }

    GetObjectDiff(orig: Record<string, any>, updated: Record<string, any>): any
    {
        const diff: Record<string, any> = {};

        for (const key in updated)
        {
            if (!(key in orig))
            {
                diff[key] = updated[key];
                continue;
            }

            const subDiff = this.GetGenericDiff(orig[key], updated[key]);
            if (subDiff !== undefined)
                diff[key] = subDiff;
        }

        return Object.keys(diff).length > 0 ? diff : undefined;
    }

    IsPlainObject(value: any): boolean
    {
        return !!value && typeof value === "object" && !Array.isArray(value);
    }

    IsEmpty(value: any): boolean
    {
        if (Array.isArray(value)) return value.length === 0;
        if (this.IsPlainObject(value)) return Object.keys(value).length === 0;
        return value === undefined || value === null;
    }

    GetChangedValues(gameObject: GameObject, origEntity: Entity): any
    {
        const obj: Record<string, any> = {};

        // GET VARS TO SAVE
        var varsToSave: string[] = []
        var specialCompare:Record<string, (currentValue, origValue) => boolean> = {};
        var specialValue:Record<string, (currentValue) => any> = {};

        if (bare.gameMode == GameMode.Game)
        {
            var saveVars = this.scene.settingsData.saveVars;
            if (saveVars) // WILL ALWAYS BE THERE REALLY
            {
                var constructorName = this.scene.GetContructorName(gameObject);

                if (saveVars[constructorName])
                {
                    varsToSave = saveVars[constructorName]; // MERGE THIS WITH defaultSettingsData.saveVars!["GameObject"]? TODO
                }
                else
                {
                    if (constructorName == "GameObject")
                        varsToSave = defaultSettingsData.saveVars!["GameObject"];
                    else
                        console.warn("NO VARS TO SAVE FOR " + constructorName);
                }

                varsToSave = varsToSave.slice();
            }
        }
        else
        if (bare.gameMode == GameMode.Editor)
        {
            varsToSave = entityVars.slice();
            //varsToSave.splice(varsToSave.indexOf("position"), 1);
            varsToSave.splice(varsToSave.indexOf("tapHitbox"), 1);
            //varsToSave.splice(varsToSave.indexOf("save"), 1);
        }

        // EDGE CASE, WANT TO ALWAYS SAVE (TOP LEVEL) OBJECT WITHOUT A PARENT, NO NEED TO SUPPLY THE SAVE PROPERTY
        // CHILDREN DO NEED IT
        if (!gameObject.parent && varsToSave.includes("save"))
            varsToSave.splice(varsToSave.indexOf("save"), 1);

        // SETUP SPECIAL CASES - TO DIG DEEPER FOR PROPER COMPARISONS
        {
            specialCompare["texture"] = (currentValue:Texture, origValue:string) => { return currentValue.texturePath != origValue; };
            specialValue["texture"] = (currentValue:Texture) => { return currentValue.texturePath; };

            specialCompare["color"] = (currentValue:Color, origValue:string) => { 
                var colorOrig = Color.fromHex(origValue);
                // NOT INCLUDED a, SINCE ITS SAVED AS ALPHA. ?! TODO
                return (currentValue.r != colorOrig.r || currentValue.g != colorOrig.g || currentValue.b != colorOrig.b);
            };
            specialValue["color"] = (currentValue:Color) => { return currentValue.toHex(); };

            specialCompare["children"] = (currentValue:GameObject[], origValue:string) => { return true };
            specialValue["children"] = (currentValue:GameObject[]):Entity[] => { 
                var children:Entity[] = [];
                for (var child of currentValue)
                {
                    if (!child.persistent && child.save)
                        children.push(this.SerializeObject(child));
                }
                return children;
            };

            // specialCompare["components"] = (currentValue:Component[], origValue:string) => { return true };
            // specialValue["components"] = (currentValue:Component[]):Entity[] => { 
            //     var children:Entity[] = [];
            //     for (var comp of currentValue)
            //     {
            //         if (comp.save)
            //             children.push(this.SerializeObject(child));
            //     }
            //     return children;
            // };
        }

        // COMPARE EACH SAVE VAR WITH ORIGINAL ENTITY AND STORE IF IT IS DIFFERENT
        for (var varName of varsToSave)
        {
            const key = (varName as keyof GameObject);
            const currentValue = gameObject[key];
            const origValue = origEntity[key]; //gameObject.entity?.[varName];

            if (origValue !== undefined && currentValue !== undefined)
            {
                if (origValue == currentValue)
                {
                    continue;
                }

                // COMPARE PROPERLY DEPENDING ON TYPE
                let isChanged = false;

                if (specialCompare[varName])
                {
                    isChanged = specialCompare[varName](currentValue, origValue);
                    if (isChanged)
                    {
                        var value = currentValue;

                        if (specialValue[varName])
                            value = specialValue[varName](currentValue);

                        if (Array.isArray(value) && value.length == 0)
                            continue;

                        Object.assign(obj, {[varName]: value});
                    }

                    continue;
                }

                if (typeof currentValue === 'object')
                {
                    // X/Y VECTOR
                    if ('x' in currentValue && 'y' in currentValue)
                        isChanged = (currentValue.x !== origValue.x || currentValue.y !== origValue.y);
                    else
                        isChanged = (JSON.stringify(currentValue) !== JSON.stringify(origValue));
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

        // LITTLE HACK TO FIX DUPLICATE SCALING ENTRIES
        if (obj.scale)
        {
            if (obj.scaleX)
                delete obj.scaleX;
            if (obj.scaleY)
                delete obj.scaleY;
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

    SerializeComponents(components: Component[], checkSave: boolean = true): Record<string, Record<string, Scalar>>
    {
        if (!components)
            return null;

        var componentsRec: Record<string, Record<string, Scalar>> = {};
        for (var i = 0; i < components.length; i++)
        {
            var component = components[i];

            if (checkSave && component.save === false)
                continue;
            
            var componentData = this.SerializeComponent(component);
            var compName = component.constructor.name.replace('Component', '');
            compName = Helper.DecapitalizeFirstLetter(compName);
            componentsRec[compName] = componentData;
        }

        return componentsRec;
    }

    SerializeComponent(component: Component): Record<string, Scalar>
    {
        var componentData: Record<string, Scalar> = {};
        var constructorVarNames = getSaveFields(component);
        if (constructorVarNames.length == 0)
            constructorVarNames = (component as any).__paramNames || Helper.GetConstructorParamNames(component.constructor);
        
        var className = Helper.GetNameFromClass(component.constructor);
        var defaultValues = bare.componentDefaulValues[className];

        // GET VALUE FROM EACH KEY OF CONSTRUCTOR PARAMS
        for (let i = 0; i < constructorVarNames.length; i++)
        {
            const paramName = constructorVarNames[i];
            const paramValue = component[paramName as keyof typeof component] as any; // SHOULD BE STRING, NUMBER OR BOOLEAN

            // SKIP SCENE
            if (paramName == "scene" || paramValue instanceof Scene)
                continue;

            // SKIP IF DEFAULT
            var defaultValue = defaultValues[paramName];
            if (paramValue === defaultValue)
                continue;

            componentData[paramName] = paramValue;
        }
        
        return componentData;
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
        if (this.backgroundColor)
            rapid.drawRect({ width: this.currentLevel.dimensions.width, height: this.currentLevel.dimensions.height, color: this.backgroundColor });
    }

    Clear()
    {
        this.backgroundColor = null;
        this.currentLevel = null;
    }

    static ClearCache()
    {
        LevelHandler.levelCache = new Map();
    }
}

export var levelHandler:LevelHandler;
RegisterController(LevelHandler);
