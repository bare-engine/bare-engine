
import { BareEngine } from "../bareEngine";
import { objectController } from "../controllers/objectController";
import { sceneController } from "../controllers/sceneController";
import { PivotComponent } from "../editorComponents/pivotComponent";
import { PivotRemoveComponent } from "../editorComponents/pivotRemoveComponent";
import { PositionPivotComponent } from "../editorComponents/positionPivotComponent";
import { ResizableComponent } from "../editorComponents/resizableComponent";
import { ResizableRemoveComponent } from "../editorComponents/resizableRemoveComponent";
import { Color, Texture } from "../libraries/rapid-render";
import { GameMode, MakePath, Scene } from "../main";
import { GameObject } from "../objects/gameObject";
import { EditorUIScene } from "../scenes/editorUIScene";
import { defaultEntityData } from "../types/bareData";
import { BareEvent, Component, Entity, entityVars, LevelData, SaveData, Scalar, SettingsData } from '../types/bareTypes';
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

        defaultEntityData.saveVars.GameObject.push("save");

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
        // AAAAH REMOVE THIS - TODO
        // CURRENTLY NEEDED FOR HACKY DUMMY CREATION
        this.scene.AddClass(PivotComponent);
        this.scene.AddClass(PivotRemoveComponent);
        this.scene.AddClass(ResizableComponent);
        this.scene.AddClass(ResizableRemoveComponent);
        this.scene.AddClass(PositionPivotComponent);

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
        //     settingsHandler: game.mapSettingsHandler,
        // });
        if (level.settingsData && level.settingsData != this.scene.settingsData.name)
            await this.LoadSettingsData(level.settingsData);

        this.currentLevel = level;

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

                // WHEN IN EDITOR, WE WANT TO USE levelEntity
                // BUT IT'S KIND OF MESSED UP AND CONSTRUCTED BY ABOVE NOW
                // SO HERE WE ALIGN IT AGAIN TO THE OBJECT AND ALL ITS CHILDREN
                //this.ApplyLevelEntityToGameObjectAndChildren(gameObject, levelEntity);
                
                gameObject.save = true;
            }
        }

        trace('Level loaded:', levelStr);
        
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

        if (bareEngine.gameMode == GameMode.Game && !forceAllEntityVars)
        {
            var saveVars = this.scene.settingsData.saveVars;
            if (saveVars) // WILL ALWAYS BE THERE REALLY
            {
                var constructorName = this.scene.GetContructorName(obj);

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

                varsToSave = varsToSave.slice();
            }
        }
        else
        if (bareEngine.gameMode == GameMode.Editor || forceAllEntityVars)
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
                    var name = Helper.DecapitalizeFirstLetter(comp.constructor.name.replace('Component', ''));
                    comps[name] = compData;
                }
            }
            return comps;
        };

        for (var varName of varsToSave)
        {
            const key = (varName as keyof GameObject);
            const currentValue = obj[key];
            
            var value = currentValue;

            if (customSerialize[varName])
                value = customSerialize[varName](currentValue);

            entity[varName] = value;
        }

        return entity;
    }

    // SERIALIZE OBJECT DIFF
    // THIS IS A VERY INEFFICIENT WAY TO IT, BUT... EASY TO FOLLOW AND AT ONE PLACE
    // COME BACK LATER TO OPTIMIZE/CACHE - TODO
    // USED levelEntity BEFORE, BUT KEPT GETTING EDGE CASES ALL OVER
    SerializeObject(obj: GameObject): Entity
    {
        var entity:Entity = {
            name: obj.name,
        };

        var origEntity = this.scene.GetDummpyDataFromEntity2(obj.name, this.scene.settingsData); // COULD ALSO GET THIS FROM PROCCESSED ENTITYDATA? IF I CONTRUCT ALL ENTITITES - TODO
        var fullEntity = this.SerializeObjectFully(obj);
        var diffEntity = this.GetEntitiesDiff(origEntity, fullEntity);

        if (diffEntity.position)
        {
            diffEntity.position.x = Math.round(diffEntity.position.x);
            diffEntity.position.y = Math.round(diffEntity.position.y);
        }

        if (diffEntity)
            Object.assign(entity, diffEntity); // APPLY DIFF TO entity

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
                if (!this.IsEmpty(updated[key]))
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

    /*GetChangedValues(gameObject: GameObject, origEntity: Entity): any
    {
        const obj: Record<string, any> = {};

        // GET VARS TO SAVE
        var varsToSave: string[] = []
        var specialCompare:Record<string, (currentValue, origValue) => boolean> = {};
        var specialValue:Record<string, (currentValue) => any> = {};

        if (bareEngine.gameMode == GameMode.Game)
        {
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

                varsToSave = varsToSave.slice();
            }
        }
        else
        if (bareEngine.gameMode == GameMode.Editor)
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
    }*/

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

    ApplyLevelEntityToGameObjectAndChildren(gameObject: GameObject, levelEntity: Entity)
    {
        gameObject.levelEntity = levelEntity;

        for (var i = 0; i < gameObject.children.length; i++)
        {
            this.ApplyLevelEntityToGameObjectAndChildren(gameObject.children[i], levelEntity.children[i]);
        }
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
