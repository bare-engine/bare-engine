import { keyboardController } from "../controllers/keyboardController";
import { sceneController } from "../controllers/sceneController";
import { GameMode, globalEvents } from "../globals";
import { Color, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import { ArcadeObject } from "../objects/arcadeObject";
import { EditorScene } from "../scenes/editorScene";
import { EditorUIScene } from "../scenes/editorUIScene";
import { EntityScene } from "../scenes/entityScene";
import { Scene } from "../scenes/scene";
import { OutlineShader } from "../shaders/outlineShader";
import { defaultSettingsData } from "../types/bareData";
import { BareEvent, Entity, EntityVarsNestedEntry, entityVarsNested, LevelData, Position, SaveData, Scalar, SettingsData } from "../types/bareTypes";
import { applyInspectorField, getButtons, getInspectorClasses, getInspectorClassNames, getInspectorFieldDescriptions, getInspectorFields } from "../utils/decorators";
import { Helper } from "../utils/helper";
import { SaveDataHandler } from "./SaveDataHandler";

// THIS PLUGIN CODE DOES NOT GET INCLUDED IN PRODUCTION

declare global {
  interface Window {
    __GAME_DEBUG_API__?: any;
  }
}

window.__GAME_DEBUG_API__ = {
    setPluginConnected(connected: boolean) {
        if (connected)
        {
            plugin.isPluginConnected = connected;
        }

        // REMOVED THE EditorUIScene WHEN PLUGIN BECOMES CONNECTED
        // COMMENTED OUT SINCE THE EditorUIScene KEPT BEING REMOVED HERE AND ADDED AT Check()
        // AND IT CAUSED ENTITY SCREEN TO RESET IN PLUGIN?
        /*if (__DEV__)
        if (connected)
            sceneController.Remove(EditorUIScene);*/
    },
    getShowEditorButton() {
        return !!sceneController.GetLevelScene();
    },
  clickedComponentButton(uid: string, compName: string, methodName: string)
  {
        const scene = plugin.GetCurrentScene();

      var obj = scene.object.GetById(uid);
      if (!obj)
        {
            console.error("Object not found");
            return false;
        }

      var compClass = bare.componentClasses[Helper.CapitalizeFirstLetter(compName) + "Component"];
      var comp = scene.component.Get(obj, compClass);
      if (!comp)
        {
            console.error("Component not found");
            return false;
        }

      comp[methodName]();
  },

  clickedObjectButton(uid: string, methodName: string)
  {
        const scene = plugin.GetCurrentScene();

      var obj = scene.object.GetById(uid);
      if (!obj)
        {
            console.error("Object not found");
            return false;
        }

      (obj as any)[methodName]();
  },

  selectedObject(uid: string)
  {
      var objs = sceneController.GetAllObjects();
      let selected: any = objs.find(o => o.uniqueID === uid);

        plugin.HandleClickObject(selected);

      if (!selected)
        return false;

      return true;
  },

  unselectedObject(uid: string)
  {
      var objs = sceneController.GetAllObjects();
      let selected: any = objs.find(o => o.uniqueID === uid) ?? null;

      if (!selected) return false;

      selected.RemoveShader(OutlineShader);

      return true;
  },

  // called by the game to notify the panel
  selectObjectInPlugin(uid: string, openObjectsTab: boolean = false, parentIds: string[] = [])
  {
    window.postMessage({ __fromGame: true, type: "selectObject", id: uid, openObjectsTab: openObjectsTab, parentIds }, "*");
  },

  gotoLevelView(levelPath: string) {
    sceneController.Remove(EditorScene); // REMOVES IT IF IT EXISTS
    sceneController.GetMainScene().LoadLevel(levelPath);
  },

  async gotoLevelEdit(levelPathOrData: string | LevelData) {
    //sceneController.DisableAll();

    if (typeof levelPathOrData === 'string')
    {
        levelPathOrData = bare.levelPath + "/" + levelPathOrData + ".json"
    }
    
    var scene = sceneController.GetMainScene(false); // WILL NOT ALWAYS FIND CORRECT ONE? TODO, CACHE IT, OR SEND IT ALONG
    sceneController.Add(EditorScene, {levelPathOrData: levelPathOrData, settingsHandler: scene.settingsHandler});
    //sceneController.Goto(EditorScene, {levelInput: levelPath});
  },


  getDebugActions() {
    return plugin.debugActions;
  },

  getCurrentScene() {
    return plugin.GetCurrentScene();
  },

  setCurrentScene(sceneClassString: string) {
    plugin.SetCurrentScene(sceneClassString);
  },

  getAllScenes() {
    var scenes = sceneController.GetAll();
    scenes = scenes.filter(s => s.enabled); // DON'T SHOW DISABLED SCENES IN PLUGIN
    var sceneStrings = scenes.map(s => s.constructor.name);

    sceneStrings = sceneStrings.reverse(); //

    return sceneStrings;
  },

  // SCENE INSPECTOR - SHOWS THE @InspectorField / @InspectorButton DECORATED MEMBERS ON A SCENE
  // SAME SHAPE AS getObject's __fields / __buttons, SO THE PLUGIN RENDERS IT THE SAME WAY AS COMPONENTS
  getScene(sceneClassString: string) {
    var scene = sceneClassString ? plugin.GetScene(sceneClassString) : plugin.GetCurrentScene();
    if (!scene)
        return null;

    var data: any = { name: scene.constructor.name, isScene: true };

    var buttons = getButtons(scene.constructor as any);
    if (buttons.length > 0)
        data.__buttons = buttons.map(b => ({ label: b.label, method: b.methodKey }));

    var fields = getInspectorFields(scene);
    if (fields.length > 0)
        data.__fields = fields;

    // @InspectorClass MEMBERS (eg scene.object) - SHOWN AS COLLAPSIBLE GROUPS, LIKE COMPONENTS
    var inspectorClasses = getInspectorClasses(scene);
    if (inspectorClasses.length > 0)
        data.__inspectorClasses = inspectorClasses;

    return data;
  },

  async setScene(sceneClassString: string, props: Record<string, any>) {
    var scene = sceneClassString ? plugin.GetScene(sceneClassString) : plugin.GetCurrentScene();
    if (!scene)
        return false;

    var inspectorClassNames = new Set(getInspectorClassNames(scene));

    for (let prop in props)
    {
        if (prop.startsWith("__"))
            continue;

        // NESTED @InspectorClass EDIT - props[prop] IS A { field: value } MAP FOR scene[prop]
        if (inspectorClassNames.has(prop) && props[prop] && typeof props[prop] === "object")
        {
            var instance = (scene as any)[prop];
            if (instance)
            {
                for (let sub in props[prop])
                {
                    if (sub.startsWith("__"))
                        continue;

                    if (await applyInspectorField(instance, sub, props[prop][sub]))
                        continue;

                    instance[sub] = props[prop][sub];
                }
            }
            continue;
        }

        if (await applyInspectorField(scene, prop, props[prop]))
            continue;

        (scene as any)[prop] = props[prop];
    }

    return true;
  },

  clickedSceneButton(sceneClassString: string, methodName: string, className?: string) {
    var scene = sceneClassString ? plugin.GetScene(sceneClassString) : plugin.GetCurrentScene();
    if (!scene)
        return false;

    // className TARGETS A BUTTON ON AN @InspectorClass MEMBER (eg scene.object)
    var target = className ? (scene as any)[className] : scene;
    if (!target)
        return false;

    (target as any)[methodName]();
    return true;
  },

  getAllObjects() {
    const scene = plugin.GetCurrentScene();

    return scene.object
                .GetLayers()
                .flat()
                .filter(o => o.customName !== 'ignoreInPlugin')
                .map(o => ({
                    id: o.uniqueID,
                    name: o.pluginName ? o.pluginName : o.name,
                    hasChildren: (o.children.length > 0)
                }))
  },

  async GetLevelFiles() {
    if (!bare)
      return [];
    
    var l = await Helper.GetFilesInFolder(`${bare.levelPath}/`, false);
    return l;
  },

  async GetLevelData(levelStr: string): Promise<LevelData> {
     return await Helper.loadJSON<LevelData>(`${bare.levelPath}/${levelStr}.json`);
  },

  getBaseClassValues() {
    var values = Object.keys(bare.registeredClasses);
    return values;
  },

  getFieldInfo()
  {
    var info:Record<string, string> = {};
    info.baseClass = "The GameObject class this entity will assign.\nAdd it with bareEngine.AddClass(CustomGameObjectClass); to make it appear in the dropdown.";
    info.baseEntity = "The entity this entity will inherit from.";
    info.imagePath = `Where to find the image. Looks in bareEngine.imagePath: ${bare.imagePath}/[imagePath]`;
    info.texture = "The texture to use for the entity. Overrides entity.name, which is used as the default texture name.";
    info.pivot = "The pivot point of the entity. 0,0 is the top left corner. Can also supply percentual values.";
    info.hitbox = "Hitbox defined as x1,x2,y1,y2, not x/y/width/height. Can supply percentual values. Can also supply a string to use a pre-defined hitbox, eg: FULL";

    const addDescriptions = (prefix: string | null, descriptions: Record<string, string>) => {
        for (var fieldName in descriptions)
        {
            const description = descriptions[fieldName];
            info[fieldName] ??= description;

            if (prefix)
                info[`${prefix}.${fieldName}`] = description;
        }
    };

    for (var className in bare.registeredClasses)
        addDescriptions(className, getInspectorFieldDescriptions(bare.registeredClasses[className]));

    // FOR COMPONENTS, NOT WORKING YET
    /*for (var componentClassName in bareEngine.componentClasses)
    {
        var componentClass = bareEngine.componentClasses[componentClassName];
        var componentName = Helper.DecapitalizeFirstLetter(componentClassName.replace("Component", ""));
        addDescriptions(`components.${componentName}`, getInspectorFieldDescriptions(componentClass));
    }*/

    return info;
  },

  onBaseClassChange(baseClass: string): string[]
  {
    // GET CURRENT ENTITY KEYS
    var scene = (plugin.GetCurrentScene() as EntityScene);
    var name = scene.objectName;
    var isBase = scene.isBase;
    var raw = scene.settingsHandler.GetRaw();
    var entity = (isBase ? raw.baseEntities[name] : raw.entities[name]);
    var entityKeys = Object.keys(entity);

    // GET EXTRA KEYS
    var extraKeys = plugin.GetExtraKeys(entityKeys, baseClass);
    return extraKeys;

    // IF EXTRA KEYS > 0, PLUGIN WILL WILL ASK FOR CONFIRMATION YES/NO
  },

  async onPressYesChangeBaseClass(extraKeys: string[])
  {
    // REMOVE FROM ENTITY EXTRA KEYS
    var scene = (plugin.GetCurrentScene() as EntityScene);
    var name = scene.objectName;
    var isBase = scene.isBase;
    var raw = scene.settingsHandler.GetRaw();
    var entity = (isBase ? raw.baseEntities[name] : raw.entities[name]);

    for (var key of extraKeys)
        delete entity[key];

    await plugin.SaveSettingsData(raw);
  },
  
  async gotoEntity(name: string, isBase: boolean = false)
  {
    window.postMessage({ __fromGame: true, type: "lockObjectsTab", flag: true }, "*");

    // Remember it so setPluginConnected can re-open it after a recompile/restart.
    plugin.lastEntity = { name, isBase };

    /*const levelController = getLevelController();
    if (levelController && levelController.currentLevel && levelController.currentLevel.name == name)
    {
        return;
    }*/

    const sceneMain = sceneController.GetMainScene();
    
    if (!sceneController.Get(EntityScene))
        sceneController.Remove(EditorScene); // WILL REMOVE LEVEL EDITOR IF EXISTS

    plugin.notifyLeaveEntity = false;
    var entityScene = await sceneController.Add(EntityScene, {name: name, isBase: isBase, settingsHandler: sceneMain.settingsHandler});
    //sceneController.Add(HitboxScene, {name: name, settingsHandler: plugin.GetCurrentScene().settingsHandler});
    plugin.notifyLeaveEntity = true;

    var entity:Entity;
    var raw = entityScene.settingsHandler.GetRaw();
    if (isBase)
        entity = raw.baseEntities[name];
    else
        entity = raw.entities[name];

    var processed = entityScene.settingsHandler.Get();
    var processedEntity:Entity;
    if (isBase)
        processedEntity = processed.baseEntities[name];
    else
        processedEntity = processed.entities[name];

    /*var processedEntityCopy = {...processedEntity};

    // REMOVE KEYS THAT ARE NOT IN baseClass
    var extraKeys = plugin.GetExtraKeys(Object.keys(processedEntityCopy), processedEntityCopy.baseClass || "GameObject");
    for (var key of extraKeys)
    {
        delete processedEntityCopy[key];
    }*/

    var entityWithLog = plugin.BuildExtendDataLog(entity, name, processedEntity, raw, processed);

    // WE'VE SET entity.baseEntity = "ANY_ENTITY"; WHEN CONSTRUCTING ENTITY, BUT DON'T WANT TO SHOW THIS IN PLUGIN (NOT USER VALUE)
    // ALONG WITH THE VALUES ANY_ENTITY SETS (EG: baseClass)
    // PASSING THIS INFO TO __defaultFieldsToIgnore__
    var defaultFieldsToIgnore = [];
    entityWithLog["__defaultFieldsToIgnore__"] = defaultFieldsToIgnore;

    if (!isBase)
    {
        if (entityWithLog.baseEntity == "ANY_ENTITY")
        {
            //entityWithLog["__defaultFieldsToIgnore__"] = ["baseEntity"];

            var defaultBaseClass = defaultSettingsData.baseEntities.ANY_ENTITY.baseClass;
            if (entityWithLog.baseClass == defaultBaseClass)
            {
                entityWithLog["__defaultFieldsToIgnore__"].push("baseClass");
            }
        }
    }

    // BUILD THE ENTITY TO PASS TO PLUGIN RIGHT AWAY
    //var levelEntityWithDefaultValues = scene.GetEntityWithDefaultValues(entityWithLog, scene.settingsData, {fillPresets: false});
    //levelEntityWithDefaultValues.name = name;

    var obj = entityScene.object.GetByName(name);
    if (obj)
        plugin.AddInspectorDataToObject(entityWithLog, obj, true);

    return entityWithLog;
  },

  getObject(id: string) {
    var scene = plugin.GetCurrentScene();
    const o = scene.object.GetById(id);

    if (!o)
        return null;

    //var constructedEntity = scene.ConstructEntity(o.levelEntity);

    var AddExtraPropsToData = (data: any, o: GameObject) => {
        data.id = o.uniqueID;
        data.name = o.name;
        data.x = o.x;
        data.y = o.y;
        data.scaleX = o.scaleX;
        data.scaleY = o.scaleY;
        data.innerX = o.innerTransform.position.x;
        data.innerY = o.innerTransform.position.y;
        data.innerScaleX = o.innerScale.x;
        data.innerScaleY = o.innerScale.y;
        data.persistent = o.persistent;

        plugin.AddInspectorDataToObject(data, o);

        if (data.children)
        {
            for (var i = 0; i < data.children.length; i++)
            {
                AddExtraPropsToData(data.children[i], o.children[i]);
            }
        }
    }

    var data = plugin.GetCurrentScene().level.SerializeObjectFully(o, true) as any;
    AddExtraPropsToData(data, o);
    
    // ROUND NUMBERS
    var maxDecimals = 3;
    var maxTotalNumbers = 5;
    for (var propName in data)
    {
        var isNumber = !isNaN(parseInt(data[propName]));
        if (isNumber)
        {
            var value = parseFloat(data[propName]);
            var wholeNumberDigits = Math.trunc(Math.abs(value)).toString().length;
            var decimalPlaces = Math.max(0, Math.min(maxDecimals, maxTotalNumbers - wholeNumberDigits));
            data[propName] = parseFloat(value.toFixed(decimalPlaces));
        }
    }

    return data;

    var serializeChildren = (children: GameObject[]) => {
        return children.map(c => serializeGameObject(c));
    }

    /*baseClass?: string;
    baseEntity?: string;
    imagePath?: string;
    texture?: string;
    hitbox?: any; //Rectangle2Vec | String;*/

    var serializeGameObject = (o: GameObject) => {
        // VALUES
        var data = {
            id: o.uniqueID,
            name: o.name || "noName",
            customName: o.customName,

            x: o.x,
            y: o.y,
            scaleX: o.scaleX,
            scaleY: o.scaleY,
            rotation: o.rotation,

            innerX: o.innerTransform.position.x,
            innerY: o.innerTransform.position.y,
            innerScaleX: o.innerScale.x,
            innerScaleY: o.innerScale.y,
            innerRotation: o.innerTransform.rotation,

            pivot: {x: o.pivot.x, y: o.pivot.y},
            //pivotBasedOnHitbox: {x: o.pivotBasedOnHitbox.x, y: o.pivotBasedOnHitbox.y},
            flipped: o.flipped,
            
            visible: o.visible,
            persistent: o.persistent,
            save: o.save,
            tags: JSON.stringify(o.tags),
            color: o.color.toHex(),
            alpha: o.alpha,

            customData: JSON.stringify(o.customData),

            children: serializeChildren(o.children),
        };

        // COMPONENTS
        {
            let comps = o.scene.component.GetAllFrom(o);
            let components = o.scene.level.SerializeComponents(comps, false);

            for (var c of comps)
            {
                var buttons = getButtons(c);
                if (buttons.length > 0)
                {
                    var compName = Helper.DecapitalizeFirstLetter(c.constructor.name.replace("Component", ""));
                    if (components[compName])
                    {
                        (components[compName] as any).__buttons = buttons.map(b => ({ label: b.label, method: b.methodKey }));
                    }
                }
            }

            data.components = components;
        }

        /*
        tapHitbox: Hitbox | null = null;
        customData: Record<string, any> = {};
        */

        return data;
    }

    var s = serializeGameObject(o);
    return s;
  },

  // GIVES SUGGESTION FIELDS, TAKES OFF ONES THAT ARE LOCKED/ALREADY IN HUSE
  getFieldsSuggestions(entityName: string, childPath: string[]): string[]
  {
    var suggestions = [
        "baseEntity",
        "baseClass",
        "imagePath",
        "texture",
        "pivot",
        "alpha",
        "visible",
        "scale",
        "rotation",
        "hitbox",
    ];
    var limitNumber = 5;

    var possibleVarsNested = window.__GAME_DEBUG_API__.getNestedEntityVars(entityName, childPath);
    var lockedVars = new Set<string>();

    var addLockedVar = (field: string) => {
        if (field.endsWith(":locked"))
            lockedVars.add(field.slice(0, -":locked".length));
    };

    for (var entry of possibleVarsNested)
    {
        if (typeof entry === "string")
        {
            addLockedVar(entry);
            continue;
        }

        for (var keys of Object.values(entry) as string[][])
            for (var key of keys)
                addLockedVar(key);
    }

    var finalSuggestions = suggestions.filter(suggestion => !lockedVars.has(suggestion));
    finalSuggestions = finalSuggestions.slice(0, limitNumber);
    
    return finalSuggestions;
  },

  getNestedEntityVars(entityName: string, childPath: string[])
  {
        var entity = plugin.GetCurrentEntityProcessed();
        
        // GET THE CHILD
        if (childPath.length > 0)
        {
            for (var i = 0; i < childPath.length; i++)
            {
                entity = entity.children[childPath[i]];
            }
        }

        var baseClass = entity.baseClass || "GameObject";
        var allPossibleEntityKeys = plugin.GetAllPossibleEntityKeys(baseClass);

        // WANT POSITION LOCKED FOR ENTIY WITH NO CHILDREN
        // BUT CHILD CAN HAVE POSITION
        var includePosition = (childPath.length > 0);
        if (!includePosition)
        {
            var i = allPossibleEntityKeys.indexOf("position");
            allPossibleEntityKeys.splice(i, 1);
        }

        // TAKE OFF CURRENT FROM ALL POSSIBLE
        var keys = Object.keys(entity);
        allPossibleEntityKeys = allPossibleEntityKeys.filter(key => !keys.includes(key));

        var lockIfUnavailable = (key: string): string => {
            return allPossibleEntityKeys.includes(key) ? key : `${key}:locked`;
        };

        var varsPluginHideApplied: EntityVarsNestedEntry[] = [];

        // GET parentClassNames, TO CHECK IF GROUP IS NOT IN HERE
        // THEN LOCK THE WHOLE GROUP, EG: RigidBody, ArcadeObject
        var cls = bare.registeredClasses[baseClass];
        var parentClassNames = Helper.GetParentClasses(cls);
        parentClassNames.push(baseClass);

        for (var entry of entityVarsNested)
        {
            if (typeof entry === "string")
            {
                varsPluginHideApplied.push(lockIfUnavailable(entry));
                continue;
            }

            var groupEntries = Object.entries(entry)
                .filter(([groupName]) => groupName !== "HideInPlugin")
                .map(([groupName, keys]) => {
                    var isGeneralGroup = groupName == "General" || groupName == "Misc";
                    var groupUnavailable = !isGeneralGroup && !parentClassNames.includes(groupName);
                    var lockedKeys = groupUnavailable ? keys.map(key => `${key}:locked`) : keys.map(lockIfUnavailable);
                    var groupLocked = groupUnavailable || keys.every(key => !allPossibleEntityKeys.includes(key));
                    var lockedGroupName = groupLocked ? `${groupName}:locked` : groupName;

                    return [lockedGroupName, lockedKeys];
                });

            if (groupEntries.length > 0)
                varsPluginHideApplied.push(Object.fromEntries(groupEntries));
        }

        return varsPluginHideApplied;
  },

  async removeFieldFromEntity(entiyName: string, childPath: string[], field: string)
  {
        var scene = plugin.GetCurrentScene();
        let entityScene = scene as EntityScene;
        
        var rawSettingsData = entityScene.settingsHandler.GetRaw();

        rawSettingsData.baseEntities.ANY ??= {};
        rawSettingsData.baseEntities.ANY_ENTITY ??= {};

        var entity:Entity;
        if (entityScene.isBase)
            entity = rawSettingsData.baseEntities[entityScene.objectName];
        else
            entity = rawSettingsData.entities[entityScene.objectName];

        // GET THE CHILD
        if (childPath.length > 0)
        {
            for (var i = 0; i < childPath.length; i++)
            {
                entity = entity.children[childPath[i]];
            }
        }

        delete entity[field];

        await entityScene.settingsHandler.Process();

        var entityData = await window.__GAME_DEBUG_API__.gotoEntity(entityScene.objectName, entityScene.isBase);
        
        await plugin.SaveSettingsData(rawSettingsData);

        return entityData;
  },

  getDefaultValueForEntityField(entityName: string, field: string)
  {
    if (field == "pivotBasedOnHitbox")
        return {x: 0, y: 0};

    var scene = plugin.GetCurrentScene();
    let entityScene = scene as EntityScene;
    
    var rawSettingsData = entityScene.settingsHandler.GetRaw();

    var entity:Entity;
    if (entityScene.isBase)
        entity = rawSettingsData.baseEntities[entityScene.objectName]; // USE id?
    else
        entity = rawSettingsData.entities[entityScene.objectName];
    
    // COMMENTED OUT, SINCE I WANT TO KEEP VALUE IN PLUGIN, EVEN IF IT'S DEFAULT
    var entityWithDefaultValues = scene.GetEntityWithDefaultValues(entity, scene.settingsData) as any;
    if (entityWithDefaultValues.position)
    {
        entityWithDefaultValues.x = entityWithDefaultValues.position.x;//
        entityWithDefaultValues.y = entityWithDefaultValues.position.y;//
    }
    entityWithDefaultValues.scaleX = entityWithDefaultValues.scale.x;
    entityWithDefaultValues.scaleY = entityWithDefaultValues.scale.y;
    entityWithDefaultValues.innerX = entityWithDefaultValues.innerPosition.x;
    entityWithDefaultValues.innerY = entityWithDefaultValues.innerPosition.y;
    entityWithDefaultValues.innerScaleX = entityWithDefaultValues.innerScale.x;
    entityWithDefaultValues.innerScaleY = entityWithDefaultValues.innerScale.y;

    var defaultValue = entityWithDefaultValues[field];

    return defaultValue;
  },

    async setEntityField(name: string, props: Record<string, any>, childPath: number[], save:boolean = false)
    {
        if (!save)
            return;
        
        let entityScene = sceneController.Get(EntityScene);

        var rawSettingsData = entityScene.settingsHandler.GetRaw();

        // MAKE SURE ANY OR ANY_ENTITY EXISTS, IF WE'RE GONNA WRITE TO IT
        //if (entityScene.isBase)
        {
            //if (entityScene.objectName == "ANY")
                rawSettingsData.baseEntities.ANY ??= {};
            
            //if (entityScene.objectName == "ANY_ENTITY")
                rawSettingsData.baseEntities.ANY_ENTITY ??= {};
        }

        // WRITE ENTITY PROPS TO RAW 
        var entity:Entity;
        if (entityScene.isBase)
            entity = rawSettingsData.baseEntities[entityScene.objectName]; // USE id?
        else
            entity = rawSettingsData.entities[entityScene.objectName];

        // GET THE CHILD
        if (childPath.length > 0)
        {
            for (var i = 0; i < childPath.length; i++)
            {
                entity = entity.children[childPath[i]];
            }
        }
        
        var entityCopy = Object.assign({}, entity);

        // MERGE COMPONENTS, ELSE Object.assign WOULD OVERWRITE THE EXISTING COMPONENTS, SINCE THEY'RE NESTED
        if (props.components)
        {
            entity.components = entityScene.MergeComponents(entity.components, props.components);
            delete props.components;
        }

        Object.assign(entity, props);

        // GET ENTITY WITH DEFAULT VALUES
        for (var key in props)
        {
            delete entityCopy[key];
        }

        // COMMENTED OUT, SINCE I WANT TO KEEP VALUE IN PLUGIN, EVEN IF IT'S DEFAULT
        /*var entityWithDefaultValues = scene.GetEntityWithDefaultValues(entityCopy, scene.settingsData) as any;
        entityWithDefaultValues.x = entityWithDefaultValues.position.x;
        entityWithDefaultValues.y = entityWithDefaultValues.position.y;
        entityWithDefaultValues.scaleX = entityWithDefaultValues.scale.x;
        entityWithDefaultValues.scaleY = entityWithDefaultValues.scale.y;
        entityWithDefaultValues.innerX = entityWithDefaultValues.innerPosition.x;
        entityWithDefaultValues.innerY = entityWithDefaultValues.innerPosition.y;
        entityWithDefaultValues.innerScaleX = entityWithDefaultValues.innerScale.x;
        entityWithDefaultValues.innerScaleY = entityWithDefaultValues.innerScale.y;

        // DELETE ANY PROPS FROM ENTITY THAT HAVE SAME VALUE AS DEFAULT, THEY'RE NOT NEEDED
        // EG: YOU SET scaleX TO 2, THEN BACK TO 1, IT WILL REMOVE THE scaleX PROPERTY
        for (var key in props)
        {
            var val = props[key];
            var defaultVal = entityWithDefaultValues[key];
            if (val == defaultVal)
                delete entity[key];
        }*/
        
        // SINCE WE JUST MODIFIED THE RAW ENTITY, WE RE-PROCESS THE settingsData AGAIN, SO IT'S UP TO DATE 
        await entityScene.settingsHandler.Process(rawSettingsData);

        var entityData;

        // SAVE TO FILE
        if (save)
        {
            entityData = await window.__GAME_DEBUG_API__.gotoEntity(entityScene.objectName, entityScene.isBase);
            
            await plugin.SaveSettingsData(rawSettingsData);
        }

        // ADD DEFAULTS TO RAW SETTINGS AGAIN, SO PROPS CAN BE ADDED TO IT
        rawSettingsData.baseEntities.ANY ??= {...defaultSettingsData.baseEntities.ANY};
        rawSettingsData.baseEntities.ANY_ENTITY ??= {...defaultSettingsData.baseEntities.ANY_ENTITY};

        return entityData;
    },

    async setObject(id: string, props: Record<string, any>, save:boolean = false)
    {
        var scene = plugin.GetCurrentScene();

        var o:GameObject;
        
        var idIsInt = !isNaN(parseInt(id));
        if (idIsInt)
            o = plugin.GetCurrentScene().object.GetById(id); // OBJECT - EG id = 0
        else
            o = plugin.GetCurrentScene().object.GetByName(id); // ENTITY - EG id = "player"
        
        if (!o)
            return false;

        // APPLY @InspectorField DECORATED FIELDS DECLARED ON THE OBJECT ITSELF
        // applyInspectorField is a no-op (returns false) for props that aren't registered inspector fields,
        // so the explicit transform/prop handling below is unaffected.
        for (let prop in props)
        {
            if (prop.startsWith("__"))
                continue;

            await applyInspectorField(o, prop, props[prop]);
        }

        // APPLY PROPS TO OBJECT
        if (props.customName !== undefined) o.customName = props.customName;

        if (props.x !== undefined) o.x = props.x;
        if (props.y !== undefined) o.y = props.y;
        if (props.scaleX !== undefined) o.scaleX = props.scaleX;
        if (props.scaleY !== undefined) o.scaleY = props.scaleY;
        if (props.rotation !== undefined) o.rotation = props.rotation;

        if (props.innerX !== undefined) o.innerTransform.position.x = props.innerX;
        if (props.innerY !== undefined) o.innerTransform.position.y = props.innerY;
        if (props.innerScaleX !== undefined) o.innerScale.x = props.innerScaleX;
        if (props.innerScaleY !== undefined) o.innerScale.y = props.innerScaleY;
        if (props.innerRotation !== undefined) o.innerTransform.rotation = props.innerRotation;

        if (props.pivot !== undefined) { 
            if ((props.pivot.x >= 0 && props.pivot.x < 1) || (props.pivot.y >= 0 && props.pivot.y < 1))
            {
                scene.ApplyEntityToGameObject(props as Entity, o, false);
            }
            o.entity.pivot = props.pivot; //
        }
        if (props.hitbox !== undefined) { 
            if ((props.hitbox.x >= 0 && props.hitbox.x < 1) || (props.hitbox.y >= 0 && props.hitbox.y < 1) ||
                (props.hitbox.width >= 0 && props.hitbox.width < 1) || (props.hitbox.height >= 0 && props.hitbox.height < 1))
            {
                scene.ApplyEntityToGameObject(props as Entity, o, false);
            }
            o.entity.hitbox = props.hitbox; //
        }
        if (props.hitbox !== undefined) { 
            
        }

        //if (props.pivotBasedOnHitbox !== undefined) { o.pivotBasedOnHitbox.x = props.pivotBasedOnHitbox.x; o.pivotBasedOnHitbox.y = props.pivotBasedOnHitbox.y; }
       
        if (props.flipped !== undefined) o.flipped = props.flipped;
        if (props.visible !== undefined) o.visible = props.visible;
        if (props.persistent !== undefined) o.persistent = props.persistent;
        if (props.save !== undefined) o.save = props.save;
        if (props.tags !== undefined) o.tags = JSON.parse(props.tags);
        if (props.color !== undefined) o.color = Color.fromHex(props.color);
        if (props.alpha !== undefined) o.alpha = props.alpha;
        if (props.customData !== undefined) o.customData = JSON.parse(props.customData);

        if (props.children !== undefined)
        {
            // ADD CHILDREN
            for (var i = 0; i < props.children.length; i++)
            {
                o.AddChild(props.children[i]);
            }
        }

        // UPDATE OR ADD COMPONENTS
        if (props.components !== undefined)
        {
            for (let compName in props.components)
            {
                var compClass = bare.componentClasses[Helper.CapitalizeFirstLetter(compName) + "Component"];
                var comp = o.scene.component.Get(o, compClass);

                if (comp)
                {
                    // WE APPLY THE COMPONENTS VALUES FROM THE PLUGIN TO THE ONES INGAME
                    // BUT ALSO CALL OnRemoved() AND Added() AROUND IT, TO RESET THE COMPONENT AND LET THE NEW VALUES BE REPROCESSED IN Added()/OnAdded()
                   
                    if (bare.gameMode == GameMode.Game)
                        comp.OnRemoved?.();

                    var compData:Record<string, Scalar> = props.components[compName];
                    for (let compProp in compData)
                    {
                        if (compProp.startsWith("__"))
                            continue;

                        if (await applyInspectorField(comp, compProp, compData[compProp]))
                            continue;

                        comp[compProp] = compData[compProp];
                    }

                    if (bare.gameMode == GameMode.Game)
                        comp.Added(comp.go); // CALLS OnAdded() AS WELL
                }
                else
                {
                    // JUST CREATED A COMPONENT
                    o.AddComponent(compClass);
                }

                // COULD ALSO NOT GO THAT ROUTE, AND INSTEAD, CALL OnStart(), AFTER SETTING THE COMPONENT VALUES
                // BUT THE COMPONENT'S CODE SHOULD THEN BE MUCH STRICTER WITH WHAT IT INITS AT OnAdded() and OnStart() TO MAKE THIS WORK - SEEMS ANNOYING
            }
        }

        // ALIGN ALL THE VARS WITH THE LEVEL ENTITY, FOR GETOBJECT()... todo

        if (scene instanceof EntityScene)
        {
            let entityScene = scene as EntityScene;
            
            var rawSettingsData = entityScene.settingsHandler.GetRaw();

            // MAKE SURE ANY OR ANY_ENTITY EXISTS, IF WE'RE GONNA WRITE TO IT
            //if (entityScene.isBase)
            {
                //if (entityScene.objectName == "ANY")
                    rawSettingsData.baseEntities.ANY ??= {...defaultSettingsData.baseEntities.ANY};
                
                //if (entityScene.objectName == "ANY_ENTITY")
                    rawSettingsData.baseEntities.ANY_ENTITY ??= {...defaultSettingsData.baseEntities.ANY_ENTITY};
            }
            
            // UNDO DEFAULT ADDITIONS TO ANY AND ANY_ENTITY AGAIN, DON'T WANT TO SAVE THEM
            // THIS IS ALSO ADDED AT getEntityData
            //if (entityScene.objectName == "ANY" || entityScene.objectName == "ANY_ENTITY")
            //if (entityScene.isBase)
            {
                var propKeys = Object.keys(props);

                //if (entityScene.objectName == "ANY")
                {
                    var anyKeys = Object.keys(defaultSettingsData.baseEntities.ANY);
                    for (var key of anyKeys)
                    {
                        if (rawSettingsData.baseEntities.ANY[key] == defaultSettingsData.baseEntities.ANY[key]) // IF SAME AS DEFAULT
                        if (entityScene.objectName != "ANY" || !propKeys.includes(key))
                            delete rawSettingsData.baseEntities.ANY[key];
                    }

                    if (Object.keys(rawSettingsData.baseEntities.ANY).length == 0)
                        delete rawSettingsData.baseEntities.ANY;
                }

                //if (entityScene.objectName == "ANY_ENTITY")
                {
                    var anyEntityKeys = Object.keys(defaultSettingsData.baseEntities.ANY_ENTITY);
                    for (var key of anyEntityKeys)
                    {
                        if (rawSettingsData.baseEntities.ANY_ENTITY[key] == defaultSettingsData.baseEntities.ANY_ENTITY[key])
                        if (entityScene.objectName != "ANY_ENTITY" || !propKeys.includes(key))
                            delete rawSettingsData.baseEntities.ANY_ENTITY[key];
                    }

                    if (Object.keys(rawSettingsData.baseEntities.ANY_ENTITY).length == 0)
                        delete rawSettingsData.baseEntities.ANY_ENTITY;
                }
            }

            // SHOULD STILL APPLY PROPS TO rawSettingsData - TODO
            // SO YOU CAN EDIT BASE ENTITY, AND IT'S FOUND IN ENTITY SCENE SAVE
            
            if (save)
            {
                await (o.scene as EditorScene).saveLevelCallback?.();
                await window.__GAME_DEBUG_API__.gotoEntity(entityScene.objectName, entityScene.isBase);
            }

            // ADD DEFAULTS TO RAW SETTINGS AGAIN, SO PROPS CAN BE ADDED TO IT
            rawSettingsData.baseEntities.ANY ??= {...defaultSettingsData.baseEntities.ANY};
            rawSettingsData.baseEntities.ANY_ENTITY ??= {...defaultSettingsData.baseEntities.ANY_ENTITY};
        }
        else
        {
            (o.scene as EditorScene).saveLevelCallback?.();
        }

        return true;
    },

    removeObject(id: string) {
        const scene = plugin.GetCurrentScene();
        const root = scene.object.GetById(id);
        if (!root) return false;

        root.Remove();

        return true;
    },

    removeComponent(id: string, comp: string) {
        const o = plugin.GetCurrentScene().object.GetById(id);
        if (!o) return false;

        var compRef = bare.componentClasses[Helper.CapitalizeFirstLetter(comp) + "Component"];
        o.RemoveComponent(compRef);
    },

    getAllComponentNames():string[] {
        return Object.keys(bare.componentClasses).map(c =>
            Helper.DecapitalizeFirstLetter(
                c.replace(/Component$/, "")
            )
        );
    },

  getEntityData():SettingsData {
    const scene = sceneController.GetMainScene();
    var settingsData = scene.settingsHandler.GetRaw();

    //return settingsData; // ADDED TO MAKE DEFAULT GAME NOT HAVE BELOW
    // SHOULD HAVE IT AGAIN WHEN I START WORK ON PLUGIN ENTITIES

    // ADD DEFAULTS - SAME AS defaultSettingsData - REBUILD TO ADD IN FRONT
    settingsData.baseEntities ??= {};

    const {
        ANY,
        ANY_ENTITY,
        NONE,
        ...rest
    } = settingsData.baseEntities;

    settingsData.baseEntities = {
        ANY: ANY ?? defaultSettingsData.baseEntities.ANY,
        ANY_ENTITY: ANY_ENTITY ?? defaultSettingsData.baseEntities.ANY_ENTITY,
        NONE: defaultSettingsData.baseEntities.NONE,
        ...rest
    };

    return settingsData;
  },

  async addNewEntity(name: string, isBase: boolean = true, newRawData: SettingsData)
  {
    /*var scene = plugin.GetCurrentScene();

    var newRawData = scene.settingsHandler.GetRaw();

    if (isBase)
    {
        newRawData.baseEntities[name] = defaultSettingsData.baseEntities[name];
    }
    else
    {
        newRawData.entities[name] = defaultSettingsData.entities[name];
    }*/

    plugin.GetCurrentScene().settingsHandler.SetRaw(newRawData);
    plugin.GetCurrentScene().settingsHandler.Process(newRawData);

    try {
        const res = await fetch('/api/save-entity-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: bare.dataPath,
            settingsData: newRawData,
            skipReload: true
        })
        });
        const json = await res.json().catch(() => null);
    
        // TELL THE PLUGIN
        //window.__GAME_DEBUG_API__.notifyEntityDataChanged(newRawData)

        return { ok: res.ok, saved: res.ok, response: json };
    } catch (error: any) {
        console.error('Failed to save entity data', error);
        //return { ok: false, error: error?.message ?? String(error) };
    }

    //window.__GAME_DEBUG_API__.gotoEntity(name, isBase);
  },

  removeEntity(name: string, isBase: boolean = true, newRawData: SettingsData)
  {
    var scene = plugin.GetCurrentScene();

    scene.settingsHandler.SetRaw(newRawData);
    scene.settingsHandler.Process(newRawData);
  },

  async setEntityData(newData: SettingsData)
  {
    await plugin.SaveSettingsData(newData);
  },

  notifyEntityDataChanged(newData) {
    //window.postMessage({ __fromGame: true, type: "entityDataChanged" }, "*");
    if (plugin.doNotifyAfterSave)
      window.postMessage({ __fromGame: true, type: "settingsData", data: newData }, "*");
  },

  notifyLeaveEntity() {
    window.postMessage({ __fromGame: true, type: "notifyLeaveEntity2" }, "*");
  },

  refreshLevelFiles() {
    window.postMessage({ __fromGame: true, type: "refreshLevelFiles" }, "*");
  },

  gameStartedNotify() {
    window.postMessage({ __fromGame: true, type: "gameStartedNotify" }, "*");
  },

  refreshScenes() {
    window.postMessage({ __fromGame: true, type: "refreshScenes" }, "*");
  },

  async createComponent(name: string, attach?: any) {
      // Arm a one-shot: the recompile this triggers restarts the game back to the main
      // scene, so when it restarts, ask the panel to re-open the entity we were editing.
      // Done as the same flow as clicking the entity in the list, so the panel re-syncs.
      if (plugin.lastEntity)
      {
          globalEvents.persistent.once(BareEvent.game_started, () => {
              if (plugin.lastEntity && !sceneController.Get(EntityScene))
              {
                  window.postMessage({ __fromGame: true, type: "gotoEntity", name: plugin.lastEntity.name, isBase: plugin.lastEntity.isBase }, "*");
              }
          });
      }

      try {
          const res = await fetch('/api/create-component', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, attach })
        });
        const json = await res.json().catch(() => null);

        // THE VITE DEV SERVER WRITES THE COMPONENT FILE TO src/components/ AND THE
        // bare:auto-register-classes PLUGIN PICKS IT UP, INJECTS bare.AddClass(...)
        // AND TRIGGERS A FULL RELOAD - SO NOTHING ELSE TO DO HERE
        return { ok: res.ok, response: json };
      } catch (error: any) {
        console.error('Failed to create component', error);
        return { ok: false, error: error?.message ?? String(error) };
      }
  },

  async createLevel(levelName: string) {
      try {
          var levelData: LevelData = { name: levelName, dimensions: { width: 800, height: 600 }, entitiesByLayer: {} };
          var path = `${bare.levelPath}/${levelName}.json`;
          const res = await fetch('/api/create-level', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              path: path,
              levelData: levelData
          })
        });
        const json = await res.json().catch(() => null);

        // GO TO THE LEVEL EDITOR
        window.__GAME_DEBUG_API__.gotoLevelEdit(levelData);
        return { ok: res.ok, saved: res.ok, response: json, level: levelData };
      } catch (error: any) {
        console.error('Failed to create level', error);
        return { ok: false, error: error?.message ?? String(error) };
      }
  },

  async removeLevel(levelName: string) {
      try {
          var path = `${bare.levelPath}/${levelName}.json`;
          const res = await fetch('/api/remove-level', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              path: path
          })
        });
        const json = await res.json().catch(() => null);

        if (SaveData.currentLevelStr == levelName)
        {
            SaveData.currentLevelStr = '';
            sceneController.Remove(EditorScene); // REMOVES IT, IN CASES WE'RE IN THERE. ELSE WE RESTART BACK INTO IT
            plugin.GetCurrentScene().Restart(); // DON'T HAVE LEVEL TO GO TO, SINCE WE JUST REMOVED IT, SO JUST RESTART GAME
        }
        return { ok: res.ok, saved: res.ok, response: json };
      } catch (error: any) {
        console.error('Failed to remove level', error);
        return { ok: false, error: error?.message ?? String(error) };
      }
  },
        
    async updateLevelData(changes: { name?: string, width?: number, height?: number, backgroundColor?: string }) {
        try {
            var levelHandler = sceneController.GetLevelScene().level;
            var data = levelHandler.currentLevel;
            levelHandler.Serialize(data);

            if (changes.width !== undefined || changes.height !== undefined) {
                data.dimensions = data.dimensions ?? { width: 800, height: 600 };
                if (changes.width !== undefined) data.dimensions.width = changes.width;
                if (changes.height !== undefined) data.dimensions.height = changes.height;
                return { ok: true };
            }
            if (changes.backgroundColor !== undefined) {
                data.backgroundColor = changes.backgroundColor;
                return { ok: true };
            }

            //sceneController.Add(EditorScene, {levelPathOrData: data});
            return { ok: true };
        } catch (error: any) {
            console.error('Failed to update level data', error);
            return { ok: false, error: error?.message ?? String(error) };
        }
    },

    async saveLevelData(levelName: string, changes: { name?: string, width?: number, height?: number, backgroundColor?: string }) {
        try {
            var levelHandler = sceneController.GetLevelScene().level;
            var data = levelHandler.currentLevel;
            levelHandler.Serialize(data);

            if (changes.width !== undefined || changes.height !== undefined) {
                data.dimensions = data.dimensions ?? { width: 800, height: 600 };
                if (changes.width !== undefined) data.dimensions.width = changes.width;
                if (changes.height !== undefined) data.dimensions.height = changes.height;
            }
            if (changes.backgroundColor !== undefined) {
                data.backgroundColor = changes.backgroundColor;
            }

            var oldPath = `${bare.levelPath}/${levelName}.json`;

            if (changes.name && changes.name !== levelName) {
                data.name = changes.name;
                var newPath = `${bare.levelPath}/${changes.name}.json`;
                await fetch('/api/save-level', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ levelPath: newPath, levelData: data })
                });
                await fetch('/api/remove-level', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: oldPath })
                });
                window.__GAME_DEBUG_API__.refreshLevelFiles();

                // GO TO THE LEVEL EDITOR
                window.__GAME_DEBUG_API__.gotoLevelEdit(changes.name);

            } else {
                await fetch('/api/save-level', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ levelPath: oldPath, levelData: data })
                });
            }

            return { ok: true };
        } catch (error: any) {
            console.error('Failed to save level data', error);
            return { ok: false, error: error?.message ?? String(error) };
        }
    },

    selectLevel(levelName: string) {
        if (levelName != "data")
            window.postMessage({ __fromGame: true, type: "selectLevel", levelName: levelName }, "*");
    },

    async clickedOpenEditorInPlugin() {
        if (SaveData.currentLevelStr === '')
        {
            console.warn('[Bare Engine] No level loaded, cannot open editor');
            var levels = await window.__GAME_DEBUG_API__.GetLevelFiles();
            if (levels.length == 0)
            {
                console.warn('[Bare Engine] No levels found, creating one called "level"');
                var res = await window.__GAME_DEBUG_API__.createLevel('level');
                var level = res.level;
                //sceneController.Add(EditorScene, {levelPathOrData: level}); // OVERWRITES THE SETTINGSDATA WITH DEFAULT, NO GOOD
            }
            return;
        }

        sceneController.Add(EditorScene);
    },
};

export class PluginHandler
{
    lastRightClickedObject: GameObject;

    public openEditorButtonPosition: Position;
    
    public isPluginConnected: boolean = false;

    debugActions: Array<{label?: string, callback?: () => void}> = [];
    movingObj: GameObject;
    draggedObjData: { obj: GameObject; offset: Vec2; hasMovedAwayEnough: boolean };
    doNotifyAfterSave: boolean = true;
    notifyLeaveEntity: boolean = true;
    currentSceneClassString: string = "";
    // The entity being edited, remembered across a recompile/restart so setPluginConnected
    // can re-open it (the restart drops back to the main scene).
    lastEntity: { name: string, isBase: boolean } | null = null;

    static Init(showEditorButton: boolean, editorButtonPosition: Position)
    {
        plugin = new PluginHandler(showEditorButton, editorButtonPosition);
        globalThis.plugin = plugin;
    }

    constructor(showEditorButton: boolean, editorButtonPosition: Position)
    {
        this.openEditorButtonPosition = editorButtonPosition;;

        // HIDE OR SHOW EditorUIScene
        // SHOWS WHEN NO PLUGIN/CONNECTION
        // HIDES WHEN THERE IS - CAN PRESS THE BUTTON IN THE PLUGIN
        var check = async () => {
            if (this.isPluginConnected && showEditorButton === false)
            {
                sceneController.Remove(EditorUIScene);
                return;
            }

            var levelScene = sceneController.GetLevelScene();
            if (levelScene)
            {
                var _showEditorButton = true;

                if (showEditorButton)
                    _showEditorButton = true;

                if (showEditorButton != true && this.isPluginConnected)
                    _showEditorButton = false;

                if (showEditorButton == false)
                    _showEditorButton = false;

                if (!sceneController.Has(EditorUIScene) && _showEditorButton)
                {
                    var scene = await sceneController.Add(EditorUIScene, {openEditorButtonPosition: this.openEditorButtonPosition});
                    sceneController.MoveToFront(scene);
                }
            }
            else
            {
                sceneController.Remove(EditorUIScene);
            }
        };
        check();
        globalEvents.on(BareEvent.scene_changed, check);

        globalEvents.persistent.once(BareEvent.game_started, () => {
            // RIGHT CLICK FOR PLUGIN SELECT
            document.addEventListener('pointerdown', this.OnRightClickPointerDown, false);
            
            window.__GAME_DEBUG_API__.gameStartedNotify();
            window.__GAME_DEBUG_API__.refreshLevelFiles();
        });

        globalEvents.persistent.on(BareEvent.scene_changed, ({ scene, type }) => {
            window.__GAME_DEBUG_API__.refreshScenes();

            // ADDED SCENE BECOMES CURRENTS SCENE (IF NOT EDITOR UI SCENE)
            if (type === "added"/* && this.currentSceneClassString == ""*/ && scene.constructor.name != "EditorUIScene")
                this.SetCurrentScene(scene.constructor.name);

            // IF REMOVED SCENE WAS CURRENT, PICK NEW ONE
            if (type === "removed" && this.currentSceneClassString == scene.constructor.name)
            {
                const scene = sceneController.GetMainScene();
                if (scene)
                    this.SetCurrentScene(scene.constructor.name);
            }

            var isAnyEntityScene = sceneController.Get(EntityScene);
            if (!isAnyEntityScene && plugin.notifyLeaveEntity)
            {
                window.__GAME_DEBUG_API__.notifyLeaveEntity();
                window.postMessage({ __fromGame: true, type: "lockObjectsTab", flag: false }, "*");
            }
        });

        globalEvents.persistent.on(BareEvent.editor_opened, ({ settingsDataName, levelName }) => {
            window.__GAME_DEBUG_API__.selectLevel(levelName);
        });

        globalEvents.persistent.on(BareEvent.scene_awake, ({ scene }) => {
            // REFRESHES THE ENTITIES
            window.postMessage({ __fromGame: true, type: "entityDataChanged" }, "*");
        });

        /*globalEvents.persistent.on(BareEvent.level_loaded, ({ levelStr }) => {
            window.__GAME_DEBUG_API__.selectLevel(levelStr);
        });*/

        // RESTART
        this.AddDebugAction("Restart Game", () => bare.Restart());
        //this.AddDebugAction("Restart Level", () => sceneController.Get(LevelScene).Restart()); //
        this.AddDebugAction("Clear Save Data", () => SaveDataHandler.Clear());
        this.AddDebugBreak();

        // DEBUG
        this.AddDebugAction("Toggle Debug Visuals", () => window.debug = !window.debug);
        this.AddDebugBreak();
        this.AddDebugBreak();
    }

    HandleClickObject(obj: GameObject)
    {
        var editorScene = sceneController.Get(EditorScene);
        if (editorScene)
        {
            editorScene.editorControlsHandler.SelectGameObjects([obj]);
            return;
        }

        // REMOVE OUTLINE SHADER FOR LAST SELECTED OBJECT
        if (this.lastRightClickedObject)
        {
            this.lastRightClickedObject.RemoveShader(OutlineShader);
        }

        if (obj)
        {
            plugin.TraceObject(obj);

            // ENABLE OUTLINE SHADER FOR SELECTED OBJECT
            if (!obj.HasShader(OutlineShader))
                obj.AddShader(OutlineShader, { color: [0.867, 0.631, 0.071, 1.0], width: 8.0 });

            this.lastRightClickedObject = obj;
        }
    }

    private OnRightClickPointerDown = async (ev: PointerEvent) =>
    {
      if (bare.levelEditorOpen)
          return;

      if (ev.button === 2)
      {
        var isControlDown = keyboardController.IsKeyDown("control");
          const obj = isControlDown ? this.CheckClickDeepChild(ev) : this.CheckClickGameObject(ev);
        
          plugin.HandleClickObject(obj);
          
          if (obj)
          {
              var parentIds = [];
              if (isControlDown)
              {
                  var parent = obj.parent;
                  while (parent)
                  {
                      parentIds.push(parent.uniqueID);
                      parent = parent.parent;
                  }
              }  
              var openObjectsTab = obj.scene.settingsData.selectionEnabled !== false;
              this.SelectObjectInPlugin(obj.uniqueID, openObjectsTab, parentIds);

              var mouseWorldAtClick = obj.scene.ScreenToWorldPos(bare.GetCanvasScreenPosition(ev.clientX, ev.clientY));
              var mouseLocalAtClick = obj.parent ? obj.parent.ToLocal(mouseWorldAtClick) : mouseWorldAtClick;

              this.draggedObjData = {
                  obj,
                  offset: obj.position.subtract(mouseLocalAtClick),
                  hasMovedAwayEnough: false
              };

              const updateDraggedObjectBound = this.UpdateDraggedObject.bind(this);
              obj.scene.events.on(BareEvent.scene_update, updateDraggedObjectBound);
              obj.scene.events.once(BareEvent.pointer_up_any, () => obj.scene.events.off(BareEvent.scene_update, updateDraggedObjectBound));
          }
      }

      ev.preventDefault();
      return false;
  };
    
    private UpdateDraggedObject(): void
    {
        var data = this.draggedObjData;

        var scene = this.GetCurrentScene();
        var mouseX = scene.mouse.screen.position.x;
        var mouseY = scene.mouse.screen.position.y;

        //mouseX = data.obj.scene.mouse.screen.position.x;
        //mouseY = data.obj.scene.mouse.screen.position.y;

        if (!this.draggedObjData.hasMovedAwayEnough)
        {
            var mouseScreen = data.obj.scene.mouse.screen;
            var dist = Helper.Distance(mouseScreen.position, mouseScreen.positionOnRightDown);
            if (dist > 10)
            {
                this.draggedObjData.hasMovedAwayEnough = true;
                //this.movingObjData.offset = this.movingObjData.obj.position.subtract(mouseController.worldMouse);
            }
            else
            {
                return;
            }
        }
        
        var worldPos = data.obj.scene.ScreenToWorldPos(new Vec2(mouseX, mouseY));
        var ref = data.obj.parent ? data.obj.parent.ToLocal(worldPos) : worldPos;
        data.obj.SetPosition(ref.x + data.offset.x, ref.y + data.offset.y);
        
        if (data.obj instanceof ArcadeObject)
            data.obj.ResetVelocity();

        //var worldPos = data.obj.scene.ScreenToWorldPos(new Vec2(mouseX, mouseY));
        //data.obj.SetPosition(worldPos.x + data.offset.x, worldPos.y + data.offset.y);
    }

    CheckClickGameObject(ev: PointerEvent): GameObject | null
    {
        //var objs = this.GetCurrentScene().object.GetAll();
        var foundObj:GameObject | null = null;
        var scenes = sceneController.GetAll();
        var p = bare.GetCanvasScreenPosition(ev.clientX, ev.clientY);
        for (var i = scenes.length - 1; i >= 0; i--)
        {
            var scene = scenes[i];
            var objs = scene.object.GetLayers().slice().reverse().flat();
            var pWorld = scene.ScreenToWorldPos(p);
            
            for (var j = objs.length - 1; j >= 0; j--)
            {
                var obj = objs[j];

                if (obj.customName == 'ignoreInPlugin')
                    continue;

                if (!obj.visible || !obj.visibleInEditor || obj.alpha == 0)
                    continue;

                if (!foundObj)
                {
                    var objRect = obj.GetBoundsWithChildren();
                    if (Helper.IsPointInRectangle(pWorld, objRect))
                    {
                        return obj;
                        foundObj = obj;

                        //break;
                    }
                }
            }
        }

        return foundObj;
    }

    CheckClickDeepChild(ev: PointerEvent): GameObject | null
    {
        //var objs = this.GetCurrentScene().object.GetAll();

        var scenes = sceneController.GetAll();
        var p = bare.GetCanvasScreenPosition(ev.clientX, ev.clientY);
        for (var i = scenes.length - 1; i >= 0; i--)
        {
            var scene = scenes[i];
            var objs = scene.object.GetAll();
        
            var pWorld = scene.ScreenToWorldPos(p);

            for (var j in objs)
            {
                var obj = objs[j];

                if (obj.customName == 'ignoreInPlugin')
                    continue;

                if (!obj.visible || !obj.visibleInEditor)
                    continue;

                var found = this.FindDeepestChildAtPoint(obj, pWorld);
                if (found)
                    return found;
            }
        }

        return null;
    }

    private FindDeepestChildAtPoint(obj: GameObject, pWorld: Vec2): GameObject | null
    {
        for (var i = obj.children.length - 1; i >= 0; i--)
        {
            var child = obj.children[i];

            if (!child.visible || !child.visibleInEditor)
                continue;

            var found = this.FindDeepestChildAtPoint(child, pWorld);
            if (found)
                return found;
        }

        var objRect = obj.GetBounds()

        if (Helper.IsPointInRectangle(pWorld, objRect))
            return obj;

        return null;
    }

    TraceObject(obj: GameObject)
    {
        trace('Bare Engine - Object Selected:', obj.name, obj);
    }

    SelectObjectInPlugin(uid: string, openObjectsTab: boolean = false, parentIds: string[] = [])
    {
        window.__GAME_DEBUG_API__.selectObjectInPlugin(uid, openObjectsTab, parentIds);
    }

    AddDebugAction(label: string, callback: () => void)
    {
        this.debugActions.push({label, callback});
    }

    AddDebugBreak()
    {
        this.debugActions.push({});
    }

    GetSceneClasses(): any[]
    {
        var sceneInstances = sceneController.GetAll();
        var sceneClasses = [];
        for (var i in sceneInstances)
        {
            var sceneInstance = sceneInstances[i];
            var sceneClass = sceneInstance.constructor as any;
            sceneClasses.push(sceneClass);
        }
        return sceneClasses;
    }

    SetCurrentScene(sceneClassString: string)
    {
        this.currentSceneClassString = sceneClassString;
    }

    GetCurrentScene(): Scene
    {
        return this.GetScene(this.currentSceneClassString);
    }

    private ResolveSceneByName(sceneClassString: string): Scene | null
    {
        if (!sceneClassString) return null;

        const scenes = sceneController.GetAll();
        const byName = scenes.find(s => s.constructor?.name === sceneClassString);
        if (byName) return byName;

        const sceneClass = (globalThis as any)[sceneClassString] as any;
        if (sceneClass) return sceneController.Get(sceneClass) ?? null;

        return null;
    }

    GetScene(sceneClassString: string): Scene
    {
        const resolved = this.ResolveSceneByName(sceneClassString);
        if (resolved) return resolved;

        const fallback = sceneController.GetMainScene();
        if (!fallback)
            throw new Error("PluginHandler.GetScene: no active scenes to resolve.");

        console.warn(`PluginHandler.GetScene: could not resolve '${sceneClassString}', falling back to '${fallback.constructor?.name ?? "unknown"}'.`);
        return fallback;
    }

    // FOR ALL ENTITIES IN SETTINGS,
    // FILL entity.baseEntityLog WITH DATA ABOUT WHAT PROPERTIES IT EXTENDS
    ProcessSettingsData(settings: SettingsData):void
    {
        // STORE ENTITES BASED ON HOW MANY TIMES THEY EXTEND DATA - COULD BE ARRAY? NEVER ANY GAP?
        var entitiesByExtendCount:Record<int, {entity: Entity, extendEntities: Array<Entity>}[]> = {};

        var entitiesCombined = {...settings.baseEntities, ...settings.entities};
        for (var entityName in entitiesCombined)
        {
            let entity = entitiesCombined[entityName];
            let extendCount = 0;

            let extendEntities = [];
            let baseEntity = entity.baseEntity;
            while (baseEntity)
            {
                extendCount++;
                extendEntities.push(settings.baseEntities[baseEntity]);
                baseEntity = settings.baseEntities[baseEntity]?.baseEntity;
            }

            entitiesByExtendCount[extendCount] ??= [];
            entitiesByExtendCount[extendCount].push({entity, extendEntities});
        }

        // FILL baseEntityLog OF ENTITIES 
        // STARTING FROM THE LEAST EXTENDED, TO MOST. THIS ALLOWS US TO REUSE THE LOG WE PROCESSED BEFORE
        for (var extendCount in entitiesByExtendCount)
        {
            var entityInfoAr = entitiesByExtendCount[extendCount];

            for (var entityInfo of entityInfoAr)
            {
                let entity = entityInfo.entity;
                let extendEntities = entityInfo.extendEntities;

                // FILL INFO ABOUT WHAT ENTITY PROPERTIES ARE EXTENDED BY WHY WHICH DATA
                let propsInThisEntity = Object.keys(entity);
                propsInThisEntity.splice(propsInThisEntity.indexOf("name"), 1);
                entity.baseEntityLog = {};
                entity.baseEntityLog[entity.name] = propsInThisEntity;

                var extendOrder = [entity.name];
                entity.baseEntityLog["__extendOrder__"] = extendOrder;

                for (var extendEntity of extendEntities)
                {
                    entity.baseEntityLog[extendEntity.name] = [];
                    for (var extendedEntityName of extendEntity.baseEntityLog["__extendOrder__"])
                    {
                        var propsExtended = extendEntity.baseEntityLog[extendedEntityName];
                        var propsExtendedFiltered = propsExtended.filter(p => !propsInThisEntity.includes(p));
                        entity.baseEntityLog[extendEntity.name] = propsExtendedFiltered;
                    }

                    extendOrder.push(extendEntity.name);
                }
            }
        }
    }

    // RETURNS A NEW ENTITY WITH baseEntityLog ADDED TOT IT
    // HOLDS DATA ABOUT WHAT PROPERTIES IT EXTENDS
    // SENDING ALONG PROCESSED ARGS, SO baseEntity IS ALWAYS SET
    BuildExtendDataLog(entity: Entity, entityName: string, processedEntity: Entity, settingsDataRaw: SettingsData, settingsDataProcessed: SettingsData): Entity
    {
        var newEntity = {...processedEntity}; // SHALLOW COPY, MORE IS NOT NEEDED, SINCE WE ONLY ADD baseEntityLog TO IT

        // GET BASE ENTITIES ALL THE WAY DOWN, PUSH IN extendOrder
        let baseEntity = processedEntity.baseEntity;

        var extendOrder = [entityName];
        newEntity.baseEntityLog = {};
        newEntity.baseEntityLog["__extendOrder__"] = extendOrder;

        while (baseEntity)
        {
            extendOrder.push(baseEntity);
            baseEntity = settingsDataProcessed.baseEntities[baseEntity]?.baseEntity;
        }

        // FILL INFO ABOUT WHAT ENTITY PROPERTIES ARE EXTENDED BY WHY WHICH DATA - USING extendOrder
        let propsInThisEntity = Object.keys(entity); // USING entity, NOT newEntity SINCE THAT CONTAINS ALL PROPS ALREADY
        if (propsInThisEntity.includes("name"))
            propsInThisEntity.splice(propsInThisEntity.indexOf("name"), 1);
        newEntity.baseEntityLog[entityName] = propsInThisEntity;

        var propsFound = propsInThisEntity.slice();

        for (var i = 1; i < extendOrder.length; i++) // START AT 1, ALREADY HANDLED 0 (SELF) ABOVE
        {
            // LOG EXTENDED PROPERTIES - SHOULD NOT HAVE BEEN FOUND BEFORE
            var extendEntityName = extendOrder[i];
            var extendEntity = settingsDataRaw.baseEntities[extendEntityName] || defaultSettingsData.baseEntities[extendEntityName];
            var propsExtended = Object.keys(extendEntity);
            var propsExtendedFiltered = propsExtended.filter(p => !propsFound.includes(p) && Helper.ObjectsAreEqual(extendEntity[p], processedEntity[p]));

            newEntity.baseEntityLog[extendEntityName] = propsExtendedFiltered;

            propsFound.push(...propsExtendedFiltered);
        }

        newEntity.baseEntityLog["__componentSources__"] = {
            components: {}
        };

        for (var componentType of ["components"])
        {
            var componentSources = newEntity.baseEntityLog["__componentSources__"][componentType];
            for (var sourceName of extendOrder)
            {
                var sourceEntity = sourceName == entityName
                    ? entity
                    : settingsDataRaw.baseEntities[sourceName] || defaultSettingsData.baseEntities[sourceName];
                var sourceComponents = sourceEntity?.[componentType];
                if (!sourceComponents) continue;

                for (var componentName in sourceComponents)
                {
                    if (!componentSources[componentName])
                        componentSources[componentName] = sourceName;
                }
            }
        }

        return newEntity;
    }

    // onlyFieldsInData: only enrich @InspectorField info for fields that are actually present in `data`
    // (used by the entity/gotoEntity path, whose data only carries the entity's own keys).
    AddInspectorDataToObject(data: any, o: GameObject, onlyFieldsInData: boolean = false): void
    {
        // ADD DATA FOR @InspectorButton AND @InspectorField DECORATORS ON THE OBJECT ITSELF
        var objButtons = getButtons(o.constructor as any);
        if (objButtons.length > 0)
            data.__buttons = objButtons.map(b => ({ label: b.label, method: b.methodKey }));

        var objFields = getInspectorFields(o);
        if (onlyFieldsInData)
            objFields = objFields.filter(f => Object.prototype.hasOwnProperty.call(data, f.name));
        if (objFields.length > 0)
            data.__fields = objFields;

        // ADD DATA FOR @InspectorButton AND @InspectorField DECORATORS
        if (data.components)
        {
            for (var compName in data.components)
            {
                var compData = data.components[compName];
                if (!compData)
                    continue;

                var fullCompName = Helper.CapitalizeFirstLetter(compName) + 'Component';
                var compCls = bare.componentClasses[fullCompName];
                if (!compCls)
                    continue;

                var buttons = getButtons(compCls);
                if (buttons.length > 0)
                    (compData as any).__buttons = buttons.map(b => ({ label: b.label, method: b.methodKey }));

                var comp = o.scene.component.Get(o, compCls);
                if (comp)
                {
                    var fields = getInspectorFields(comp);
                    if (fields.length > 0)
                        (compData as any).__fields = fields;
                }
            }
        }

        if (data.children)
        {
            for (var i = 0; i < data.children.length; i++)
            {
                var child = o.children[i];
                if (child)
                    this.AddInspectorDataToObject(data.children[i], child, onlyFieldsInData);
            }
        }
    }

    GetAllPossibleEntityKeys(baseClass: string): string[]
    {
        // GET ALL POSSIBLE KEYS, FROM CLASS AND INHEREITED CLASSES
        var cls = bare.registeredClasses[baseClass];
        var parentClassNames = Helper.GetParentClasses(cls);
        parentClassNames.push(baseClass);

        var allPossibleEntityKeys = new Set<string>();

        for (var entry of entityVarsNested)
        {
            if (typeof entry === "string")
            {
                allPossibleEntityKeys.add(entry);
                continue;
            }

            for (var [groupName, keys] of Object.entries(entry))
            {
                var isGeneralGroup = groupName == "General" || groupName == "HideInPlugin" || groupName == "Misc";
                if (isGeneralGroup || parentClassNames.includes(groupName))
                {
                    for (var key of keys)
                        allPossibleEntityKeys.add(key);
                }
            }
        }

        return Array.from(allPossibleEntityKeys);
    }

    //  GET KEYS IN entityKeys NOT IN allPossibleEntityKeys
    GetExtraKeys(entityKeys: string[], baseClass: string): string[]
    {
        var allPossibleEntityKeys:string[] = this.GetAllPossibleEntityKeys(baseClass);
        var keysToRemove = entityKeys.filter(k => !allPossibleEntityKeys.includes(k));
        return keysToRemove;
    }

    async SaveSettingsData(newData: SettingsData): Promise<void>
    {
        sceneController.GetMainScene().settingsHandler.FilterSettingsDataDefaults(newData);

        plugin.doNotifyAfterSave = false;

        //var scene = plugin.GetCurrentScene();
        const scene = sceneController.GetMainScene();
        if (scene instanceof EditorScene)
        {
            await (plugin.GetCurrentScene() as EditorScene).SaveEntityData(newData);
        }
        else
        {
            await fetch('/api/save-entity-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: bare.dataPath,
                    settingsData: newData,
                    skipReload: true
                })
            });

            scene.settingsHandler.SetRaw(newData);
            await scene.settingsHandler.Process(newData);
        }

        plugin.doNotifyAfterSave = true;

        /*if (bareEngine.levelEditorOpen)
        {
        await plugin.GetCurrentScene().Restart();//
        }
        else
        {
        await plugin.GetCurrentScene().Restart();
        }*/
    }

    GetCurrentEntity(): Entity
    {
        var scene = (plugin.GetCurrentScene() as EntityScene);
        var name = scene.objectName;
        var isBase = scene.isBase;
        var raw = scene.settingsHandler.GetRaw();
        var entity = (isBase ? raw.baseEntities[name] : raw.entities[name]);

        return entity;
    }

    GetCurrentEntityProcessed(): Entity
    {
        var scene = (plugin.GetCurrentScene() as EntityScene);
        var name = scene.objectName;
        var isBase = scene.isBase;
        var processed = scene.settingsHandler.Get();
        var entity = (isBase ? processed.baseEntities[name] : processed.entities[name]);

        return entity;
    }
}

export var plugin:PluginHandler;
