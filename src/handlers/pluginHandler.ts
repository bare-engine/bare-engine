import { keyboardController } from "../controllers/keyboardController";
import { sceneController } from "../controllers/sceneController";
import { GameMode, globalEvents } from "../globals";
import { Color, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import { PhysicsObjectBare } from "../objects/physicsObjectBare";
import { EditorScene } from "../scenes/editorScene";
import { EditorUIScene } from "../scenes/editorUIScene";
import { EntityScene } from "../scenes/entityScene";
import { Scene } from "../scenes/scene";
import { OutlineShader } from "../shaders/outlineShader";
import { defaultSettingsData } from "../types/bareData";
import { BareEvent, Entity, EntityVarsNestedEntry, entityVarsNested, LevelData, Position, SaveData, Scalar, SettingsData } from "../types/bareTypes";
import { applyInspectorField, getButtons, getInspectorFieldDescriptions, getInspectorFields } from "../utils/decorators";
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

        if (__DEV__)
        if (connected)
            sceneController.Remove(EditorUIScene);
    },
    getShowEditorButton() {
        return !!sceneController.GetLevelScene();
    },
  clickedComponentButton(uid: string, compName: string, methodName: string)
  {
        const scene = plugin.GetCurrentScene();

      var obj = scene.objectController.GetObjectById(uid);
      if (!obj)
        {
            console.error("Object not found");
            return false;
        }

      var compClass = bareEngine.componentClasses[Helper.CapitalizeFirstLetter(compName) + "Component"];
      var comp = scene.componentController.GetComponent(obj, compClass);
      if (!comp)
        {
            console.error("Component not found");
            return false;
        }

      comp[methodName]();
  },

  selectedObject(uid: string)
  {
      const outlineShader = plugin.outlineShader;

      var objs = sceneController.GetAllSceneObjects();
      let selected: any = objs.find(o => o.uniqueID === uid);

      plugin.TraceObject(selected);

      // CLEAR OUTLINE SHADERS ON ALL (across all scenes)
      for (const o of objs)
      {
          if (o.customName === 'ignoreInPlugin') continue;
          if (!o.visible || !o.visibleInEditor) continue;

          const idx = o.shaders.indexOf(outlineShader);
          if (idx !== -1)
          {
              outlineShader.stop(o);
              o.shaders.splice(idx, 1);
          }
      }

      if (!selected) return false;

      // ADD TO SELECTED
      outlineShader.start(selected, [1.0, 1.0, 1.0, 1.0], 8.0);
      selected.shaders.push(outlineShader);

      return true;
  },

  unselectedObject(uid: string)
  {
      const outlineShader = plugin.outlineShader;

      var objs = sceneController.GetAllSceneObjects();
      let selected: any = objs.find(o => o.uniqueID === uid) ?? null;

      if (!selected) return false;

      const idx = selected.shaders.indexOf(outlineShader);
      if (idx !== -1)
      {
          outlineShader.stop(selected);
          selected.shaders.splice(idx, 1);
      }

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
    //sceneController.DisableAllScenes();

    if (typeof levelPathOrData === 'string')
    {
        levelPathOrData = bareEngine.levelPath + "/" + levelPathOrData + ".json"
    }
    
    sceneController.Add(EditorScene, {levelPathOrData: levelPathOrData, settingsHandler: sceneController.GetMainScene().settingsHandler});
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
    var scenes = sceneController.GetAllScenes();
    var sceneStrings = scenes.map(s => s.constructor.name);

    sceneStrings = sceneStrings.reverse(); // 

    return sceneStrings;
  },

  getAllObjects() {
    const scene = plugin.GetCurrentScene();

    return scene.objectController
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
    var l = await Helper.GetFilesInFolder(`${bareEngine.levelPath}/`, false);
    return l;
  },

  async GetLevelData(levelStr: string): Promise<LevelData> {
     return await Helper.loadJSON<LevelData>(`${bareEngine.levelPath}/${levelStr}.json`);
  },

  getBaseClassValues() {
    var values = Object.keys(Scene.registeredClasses);
    return values;
  },

  getFieldInfo()
  {
    var info:Record<string, string> = {};
    info.baseClass = "The GameObject class this entity will assign.\nAdd it with bareEngine.AddClass(CustomGameObjectClass); to make it appear in the dropdown.";
    info.baseEntity = "The entity this entity will inherit from.";
    info.imagePath = `Where to find the image. Looks in bareEngine.imagePath: ${bareEngine.imagePath}/[imagePath]`;
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

    for (var className in Scene.registeredClasses)
        addDescriptions(className, getInspectorFieldDescriptions(Scene.registeredClasses[className]));

    // FOR COMPONENTS, NOT WORKING YET
    /*for (var componentClassName in bareEngine.componentClasses)
    {
        var componentClass = bareEngine.componentClasses[componentClassName];
        var componentName = Helper.DecapitalizeFirstLetter(componentClassName.replace("Component", ""));
        addDescriptions(`components.${componentName}`, getInspectorFieldDescriptions(componentClass));
    }*/

    return info;
  },
  
  async gotoEntity(name: string, isBase: boolean = false) {
    /*const levelController = getLevelController();
    if (levelController && levelController.currentLevel && levelController.currentLevel.name == name)
    {
        return;
    }*/
    
    plugin.notifyLeaveEntity = false;
    var scene = await sceneController.Add(EntityScene, {name: name, isBase: isBase, settingsHandler: plugin.GetCurrentScene().settingsHandler});
    //sceneController.Add(HitboxScene, {name: name, settingsHandler: plugin.GetCurrentScene().settingsHandler});
    plugin.notifyLeaveEntity = true;

    var entity:Entity;
    var raw = scene.settingsHandler.GetRaw();
    if (isBase)
        entity = raw.baseEntities[name];
    else
        entity = raw.entities[name];

    var processed = scene.settingsHandler.Get();
    var processedEntity:Entity;
    if (isBase)
        processedEntity = processed.baseEntities[name];
    else
        processedEntity = processed.entities[name];

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
            entityWithLog["__defaultFieldsToIgnore__"] = ["baseEntity"];

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
    
    return entityWithLog;
  },

  getObject(id: string) {
    var scene = plugin.GetCurrentScene();
    const o = scene.objectController.GetObjectById(id);

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

        // ADD DATA FOR @InspectorButton DECORATOR
        if (data.components)
        {
            for (var compName in data.components)
            {
                var fullCompName = Helper.CapitalizeFirstLetter(compName) + 'Component';
                var compCls = bareEngine.componentClasses[fullCompName];
                var comp = o.scene.componentController.GetComponent(o, compCls);
                var buttons = getButtons(compCls);
                if (buttons.length > 0)
                {
                    if (data.components[compName])
                    {
                        (data.components[compName] as any).__buttons = buttons.map(b => ({ label: b.label, method: b.methodKey }));
                    }
                }

                if (comp)
                {
                    var fields = getInspectorFields(comp);
                    if (fields.length > 0 && data.components[compName])
                    {
                        (data.components[compName] as any).__fields = fields;
                    }
                }
            }
        }

        if (data.children)
        {
            for (var i = 0; i < data.children.length; i++)
            {
                AddExtraPropsToData(data.children[i], o.children[i]);
            }
        }
    }

    var data = plugin.GetCurrentScene().levelHandler.SerializeObjectFully(o, true) as any;
    AddExtraPropsToData(data, o);
    
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
            let comps = o.scene.componentController.GetComponentsFrom(o);
            let components = o.scene.levelHandler.SerializeComponents(comps, false);

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

  getNestedEntityVars(entityName: string)
  {
      var varsPluginHideApplied: EntityVarsNestedEntry[] = [];

      for (var entry of entityVarsNested)
      {
          if (typeof entry === "string")
          {
              varsPluginHideApplied.push(entry);
              continue;
          }

          var groupEntries = Object.entries(entry).filter(([groupName]) => groupName !== "HideInPlugin");
          if (groupEntries.length > 0)
              varsPluginHideApplied.push(Object.fromEntries(groupEntries));
      }

      return varsPluginHideApplied;
  },

  async removeFieldFromEntity(entiyName: string, field: string)
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

        delete entity[field];

        var entityData = await window.__GAME_DEBUG_API__.gotoEntity(entityScene.objectName, entityScene.isBase);
        
        await entityScene.SaveEntityData(rawSettingsData);

        return entityData;
  },

  getDefaultValueForEntityField(entityName: string, field: string)
  {
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

    async setEntityField(name: string, props: Record<string, any>, save:boolean = false)
    {
        let entityScene = plugin.GetCurrentScene() as EntityScene;

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
        
        var entityCopy = Object.assign({}, entity);

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
            
            await entityScene.SaveEntityData(rawSettingsData);
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
            o = plugin.GetCurrentScene().objectController.GetObjectById(id); // OBJECT - EG id = 0
        else
            o = plugin.GetCurrentScene().objectController.GetObjectByName(id); // ENTITY - EG id = "player"
        
        if (!o)
            return false;

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
                var compClass = bareEngine.componentClasses[Helper.CapitalizeFirstLetter(compName) + "Component"];
                var comp = o.scene.componentController.GetComponent(o, compClass);

                if (comp)
                {
                    // WE APPLY THE COMPONENTS VALUES FROM THE PLUGIN TO THE ONES INGAME
                    // BUT ALSO CALL OnRemoved() AND Added() AROUND IT, TO RESET THE COMPONENT AND LET THE NEW VALUES BE REPROCESSED IN Added()/OnAdded()
                   
                    if (bareEngine.gameMode == GameMode.Game)
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

                    if (bareEngine.gameMode == GameMode.Game)
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
        const root = scene.objectController.GetObjectById(id);
        if (!root) return false;

        root.Remove();

        return true;
    },

    removeComponent(id: string, comp: string) {
        const o = plugin.GetCurrentScene().objectController.GetObjectById(id);
        if (!o) return false;

        var compRef = bareEngine.componentClasses[Helper.CapitalizeFirstLetter(comp) + "Component"];
        o.RemoveComponent(compRef);
    },

    getAllComponentNames():string[] {
        return Object.keys(bareEngine.componentClasses).map(c =>
            Helper.DecapitalizeFirstLetter(
                c.replace(/Component$/, "")
            )
        );
    },

  getEntityData():SettingsData {
    var settingsData = plugin.GetCurrentScene().settingsHandler.GetRaw();

    //return settingsData; // ADDED TO MAKE DEFAULT GAME NOT HAVE BELOW
    // SHOULD HAVE IT AGAIN WHEN I START WORK ON PLUGIN ENTITIES

    // ADD DEFAULTS - SAME AS defaultSettingsData - REBUILD TO ADD IN FRONT
    settingsData.baseEntities ??= {};

    const {
        ANY,
        ANY_ENTITY,
        ...rest
    } = settingsData.baseEntities;

    settingsData.baseEntities = {
        ANY: ANY ?? defaultSettingsData.baseEntities.ANY,
        ANY_ENTITY: ANY_ENTITY ?? defaultSettingsData.baseEntities.ANY_ENTITY,
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
            path: bareEngine.dataPath,
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
    plugin.FilterSettingsDataDefaults(newData);

    plugin.doNotifyAfterSave = false;
    await (plugin.GetCurrentScene() as EditorScene).SaveEntityData(newData);
    plugin.doNotifyAfterSave = true;

    /*if (bareEngine.levelEditorOpen)
    {
      await plugin.GetCurrentScene().Restart();//
    }
    else
    {
      await plugin.GetCurrentScene().Restart();
    }*/
  },

  notifyEntityDataChanged(newData) {
    //window.postMessage({ __fromGame: true, type: "entityDataChanged" }, "*");
    if (plugin.doNotifyAfterSave)
      window.postMessage({ __fromGame: true, type: "settingsData", data: newData }, "*");
  },

  notifyLeaveEntity() {
    window.postMessage({ __fromGame: true, type: "notifyLeaveEntity" }, "*");
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

  async createLevel(levelName: string) {
      try {
          var levelData: LevelData = { name: levelName, dimensions: { width: 800, height: 600 }, entitiesByLayer: {} };
          var path = `${bareEngine.levelPath}/${levelName}.json`;
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
          var path = `${bareEngine.levelPath}/${levelName}.json`;
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
            var levelHandler = sceneController.GetLevelScene().levelHandler;
            var data = levelHandler.currentLevel;
            levelHandler.SerializeLevel(data);

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
            var levelHandler = sceneController.GetLevelScene().levelHandler;
            var data = levelHandler.currentLevel;
            levelHandler.SerializeLevel(data);

            if (changes.width !== undefined || changes.height !== undefined) {
                data.dimensions = data.dimensions ?? { width: 800, height: 600 };
                if (changes.width !== undefined) data.dimensions.width = changes.width;
                if (changes.height !== undefined) data.dimensions.height = changes.height;
            }
            if (changes.backgroundColor !== undefined) {
                data.backgroundColor = changes.backgroundColor;
            }

            var oldPath = `${bareEngine.levelPath}/${levelName}.json`;

            if (changes.name && changes.name !== levelName) {
                data.name = changes.name;
                var newPath = `${bareEngine.levelPath}/${changes.name}.json`;
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
    static Init(editorButtonPosition: Position)
    {
        plugin = new PluginHandler(editorButtonPosition);
    }

    public openEditorButtonPosition: Position;
    
    public isPluginConnected: boolean = false;

    public outlineShader;
    
    debugActions: Array<{label?: string, callback?: () => void}> = [];
    movingObj: GameObject;
    draggedObjData: { obj: GameObject; offset: Vec2; hasMovedAwayEnough: boolean };
    doNotifyAfterSave: boolean = true;
    notifyLeaveEntity: boolean = true;
    currentSceneClassString: string = "";

    constructor(editorButtonPosition: Position)
    {
        this.openEditorButtonPosition = editorButtonPosition;;

        // HIDE OR SHOW EditorUIScene
        // SHOWS WHEN NO PLUGIN/CONNECTION
        // HIDES WHEN THERE IS - CAN PRESS THE BUTTON IN THE PLUGIN
        var check = async () => {
            if (this.isPluginConnected)
            {
                sceneController.Remove(EditorUIScene);
                return;
            }

            var levelScene = sceneController.GetLevelScene();
            if (levelScene)
            {
                if (!sceneController.Has(EditorUIScene))
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
            this.outlineShader = new OutlineShader()
            
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

            if (type == "removed" && scene instanceof EntityScene && plugin.notifyLeaveEntity)
            {
                window.__GAME_DEBUG_API__.notifyLeaveEntity();
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
        this.AddDebugAction("Restart Game", () => bareEngine.Restart());
        //this.AddDebugAction("Restart Level", () => sceneController.Get(LevelScene).RestartLevel()); //
        this.AddDebugAction("Clear Save Data", () => SaveDataHandler.Clear());
        this.AddDebugBreak();

        // DEBUG
        this.AddDebugAction("Toggle Debug Visuals", () => window.debug = !window.debug);
        this.AddDebugBreak();
        this.AddDebugBreak();
    }

    private OnRightClickPointerDown = async (ev: PointerEvent) =>
    {
      if (bareEngine.levelEditorOpen)
          return;

      if (ev.button === 2)
      {
        var isControlDown = keyboardController.IsKeyDown("control");
          const obj = isControlDown ? this.CheckClickDeepChild(ev) : this.CheckClickGameObject(ev);
          if (obj)
          {
              plugin.TraceObject(obj);

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

              var mouseWorldAtClick = obj.scene.ScreenToWorldPos(bareEngine.GetCanvasScreenPosition(ev.clientX, ev.clientY));
              var mouseLocalAtClick = obj.parent ? obj.parent.ToLocal(mouseWorldAtClick) : mouseWorldAtClick;

              this.draggedObjData = {
                  obj,
                  offset: obj.position.subtract(mouseLocalAtClick),
                  hasMovedAwayEnough: false
              };

              const updateDraggedObjectBound = this.UpdateDraggedObject.bind(this);
              obj.scene.events.on(BareEvent.scene_update, updateDraggedObjectBound);
              obj.scene.events.once(BareEvent.pointer_up, () => obj.scene.events.off(BareEvent.scene_update, updateDraggedObjectBound));
          }
      }

      ev.preventDefault();
      return false;
  };
    
    private UpdateDraggedObject(): void
    {
        var data = this.draggedObjData;

        var scene = this.GetCurrentScene();
        var mouseX = scene.mouseController.screen.position.x;
        var mouseY = scene.mouseController.screen.position.y;

        //mouseX = data.obj.scene.mouseController.screen.position.x;
        //mouseY = data.obj.scene.mouseController.screen.position.y;

        if (!this.draggedObjData.hasMovedAwayEnough)
        {
            var mouseScreen = data.obj.scene.mouseController.screen;
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
        
        if (data.obj instanceof PhysicsObjectBare)
            data.obj.ResetVelocity();

        //var worldPos = data.obj.scene.ScreenToWorldPos(new Vec2(mouseX, mouseY));
        //data.obj.SetPosition(worldPos.x + data.offset.x, worldPos.y + data.offset.y);
    }

    CheckClickGameObject(ev: PointerEvent, outline: boolean = true): GameObject | null
    {
        //var objs = this.GetCurrentScene().objectController.GetAllObjects();
        var foundObj:GameObject | null = null;
        var scenes = sceneController.GetAllScenes();
        for (var i = scenes.length - 1; i >= 0; i--)
        {
            var scene = scenes[i];
            var objs = scene.objectController.GetAllObjects();
            
            for (var j in objs)
            {
                var obj = objs[j];

                if (obj.customName == 'ignoreInPlugin')
                    continue;

                if (!obj.visible || !obj.visibleInEditor)
                    continue;

                var objRect = obj.GetBoundsWithChildren()
                var p = bareEngine.GetCanvasScreenPosition(ev.clientX, ev.clientY);
                var pWorld = scene.ScreenToWorldPos(p);

                if (outline)
                if (obj.shaders.indexOf(this.outlineShader) != -1)
                {
                    this.outlineShader.stop(obj);
                    obj.shaders.splice(obj.shaders.indexOf(this.outlineShader), 1);
                }

                if (!foundObj)
                if (Helper.IsPointInRectangle(pWorld, objRect))
                {
                    plugin.TraceObject(obj);

                    if (outline)
                    {
                        this.outlineShader.start(obj, [1.0, 1.0, 1.0, 1.0], 8.0);
                        obj.shaders.push(this.outlineShader);
                    }

                    foundObj = obj;

                    //break;
                }
            }
        }

        return foundObj;
    }

    CheckClickDeepChild(ev: PointerEvent): GameObject | null
    {
        //var objs = this.GetCurrentScene().objectController.GetAllObjects();

        var scenes = sceneController.GetAllScenes();
        for (var i = scenes.length - 1; i >= 0; i--)
        {
            var scene = scenes[i];
            var objs = scene.objectController.GetAllObjects();
        
            var p = bareEngine.GetCanvasScreenPosition(ev.clientX, ev.clientY);
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
        var sceneInstances = sceneController.GetAllScenes();
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

        const scenes = sceneController.GetAllScenes();
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

    FilterSettingsDataDefaults(settingsData: SettingsData)
    {
        // UNDO DEFAULT ADDITIONS TO ANY AND ANY_ENTITY AGAIN, DON'T WANT TO SAVE THEM
        // THIS IS ALSO ADDED AT getEntityData
        //if (entityScene.objectName == "ANY" || entityScene.objectName == "ANY_ENTITY")
        //if (entityScene.isBase)

        //
        if (settingsData.baseEntities.ANY == defaultSettingsData.baseEntities.ANY)
        {
            delete settingsData.baseEntities.ANY;
        }
        else
        if (settingsData.baseEntities.ANY)
        {
            var anyKeys = Object.keys(defaultSettingsData.baseEntities.ANY);
            for (var key of anyKeys)
            {
                if (settingsData.baseEntities.ANY[key] == defaultSettingsData.baseEntities.ANY[key]) // IF SAME AS DEFAULT
                    delete settingsData.baseEntities.ANY[key];
            }

            if (Object.keys(settingsData.baseEntities.ANY).length == 0)
                delete settingsData.baseEntities.ANY;
        }

        //
        if (settingsData.baseEntities.ANY_ENTITY == defaultSettingsData.baseEntities.ANY_ENTITY)
        {
            delete settingsData.baseEntities.ANY_ENTITY;
        }
        else
        if (settingsData.baseEntities.ANY_ENTITY)
        {
            var anyEntityKeys = Object.keys(defaultSettingsData.baseEntities.ANY_ENTITY);
            for (var key of anyEntityKeys)
            {
                if (settingsData.baseEntities.ANY_ENTITY[key] == defaultSettingsData.baseEntities.ANY_ENTITY[key])
                    delete settingsData.baseEntities.ANY_ENTITY[key];
            }

            if (Object.keys(settingsData.baseEntities.ANY_ENTITY).length == 0)
                delete settingsData.baseEntities.ANY_ENTITY;
        }
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
            var propsExtendedFiltered = propsExtended.filter(p => !propsFound.includes(p));

            newEntity.baseEntityLog[extendEntityName] = propsExtendedFiltered;

            propsFound.push(...propsExtendedFiltered);
        }

        newEntity.baseEntityLog["__componentSources__"] = {
            components: {},
            editorComponents: {},
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
}

export var plugin:PluginHandler;
