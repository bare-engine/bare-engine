import { keyboardController } from "../controllers/keyboardController";
import { GameMode, globalEvents } from "../globals";
import { Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import { EditorScene } from "../scenes/editorScene";
import { EditorUIScene } from "../scenes/editorUIScene";
import { EntityScene } from "../scenes/entityScene";
import { Scene } from "../scenes/scene";
import { OutlineShader } from "../shaders/outlineShader";
import { defaultSettingsData } from "../types/bareData";
import { BareEvent, Entity, EntityVarsNestedEntry, entityVarsNested, LevelData, Position, SaveData, Scalar, SettingsData } from "../types/bareTypes";
import { applyInspectorField, getButtons, getInspectorClasses, getInspectorFieldDescriptions, getInspectorFields, resolveInspectorClassName } from "../utils/decorators";
import { EntitySerializer } from "../utils/entitySerializer";
import { Helper } from "../utils/helper";
import { SaveDataHandler } from "./SaveDataHandler";
import { TransformToolHandler } from "./transformToolHandler";
import { SettingsHandler } from "./settingsHandler";

// THIS PLUGIN CODE DOES NOT GET INCLUDED IN PRODUCTION

declare global {
  interface Window {
    __GAME_DEBUG_API__?: any;
  }
}

function getObjectByIdFromAllScenes(uid: string): GameObject | null
{
    for (const scene of bare.scene.GetAll(true))
    {
        const objectController = scene.object;
        const obj = objectController.GetById(uid);
        if (obj)
            return obj;
    }

    return null;
}

window.__GAME_DEBUG_API__ = {
    getPaused() {
        return plugin.GetPaused();
    },
    togglePause() {
        return plugin.TogglePause();
    },
    restart() {
        return bare.Restart();
    },
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
            bare.scene.Remove(EditorUIScene);*/
    },
    getShowEditorButton() {
        return !!bare.scene.GetLevelScene();
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

  traceInspectorTarget(uid: string | null, targetType: string, name: string, sceneClassString?: string)
  {
      if (targetType == "component")
          return plugin.TraceComponent(uid, name);

      if (targetType == "inspectorClass")
          return plugin.TraceInspectorClass(name, sceneClassString);

      if (targetType == "scene")
          return plugin.TraceScene(name);

      return false;
  },

  selectedObject(uid: string)
  {
      let selected = getObjectByIdFromAllScenes(uid);

        plugin.HandleClickObject(selected);

      if (!selected)
        return false;

      return true;
  },

  selectEntityObject(childPath: number[] = [])
  {
      const entityScene = bare.scene.Get(EntityScene);
      if (!entityScene)
          return false;

      const selectedRoot = entityScene.object.GetByName(entityScene.objectName);
      const raw = entityScene.settingsHandler.GetRaw();
      const processed = entityScene.settingsHandler.Get();
      const selected = plugin.ResolveRuntimeEntityPath(
          selectedRoot,
          SettingsHandler.FindEntity(raw, entityScene.objectName)!,
          SettingsHandler.FindEntity(processed, entityScene.objectName)!,
          childPath,
          raw,
          SettingsHandler.IsBaseEntity(raw, entityScene.objectName) ? "ANY" : "ANY_ENTITY"
      );

      if (!selected)
          return false;

      // EntityScene disables ordinary editor hitbox selection. Panel tree selection is
      // authoritative here, so force-select the matching live object without echoing it back.
      entityScene.editorControlsHandler.SelectGameObjects([selected], true, true, false);
      return selected.uniqueID;
  },

  unselectedObject(uid: string)
  {
      let selected = getObjectByIdFromAllScenes(uid);

      if (!selected) return false;

      const entityScene = bare.scene.Get(EntityScene);
      if (entityScene && selected.scene === entityScene)
      {
          entityScene.editorControlsHandler.ClearSelection();
          return true;
      }

      selected.RemoveShader(OutlineShader);
      TransformToolHandler.Get().Clear();

      return true;
  },

  // called by the game to notify the panel
  selectObjectInPlugin(uid: string, openObjectsTab: boolean = false, parentIds: string[] = [])
  {
    window.postMessage({ __fromGame: true, type: "selectObject", id: uid, openObjectsTab: openObjectsTab, parentIds, selectedIds: [uid] }, "*");
  },

  // called by the game to notify the panel of a MULTI-OBJECT selection.
  // The last id is shown in the inspector (primary), but field edits get applied to all selectedIds.
  selectObjectsInPlugin(uids: string[], openObjectsTab: boolean = true)
  {
    var primaryId = uids[uids.length - 1];
    window.postMessage({ __fromGame: true, type: "selectObject", id: primaryId, openObjectsTab, parentIds: [], selectedIds: uids }, "*");
  },

  selectEntityObjectInPlugin(data) {
    window.postMessage({ __fromGame: true, type: "selectEntityObject", data }, "*");
  },

  gotoLevelView(levelPath: string) {
    bare.scene.Remove(EditorScene); // REMOVES IT IF IT EXISTS
    bare.scene.GetMainScene().LoadLevel(levelPath);
  },

  async gotoLevelEdit(levelPathOrData: string | LevelData) {
    //bare.scene.DisableAll();

    if (typeof levelPathOrData === 'string')
    {
        levelPathOrData = bare.levelPath + "/" + levelPathOrData + ".json"
    }

    var scene = bare.scene.GetMainScene(false); // WILL NOT ALWAYS FIND CORRECT ONE? TODO, CACHE IT, OR SEND IT ALONG
    bare.scene.Add(EditorScene, {levelPathOrData: levelPathOrData, settingsHandler: scene.settingsHandler});
    //bare.scene.Goto(EditorScene, {levelInput: levelPath});
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
    var scenes = bare.scene.GetAll();
    //scenes = scenes.filter(s => s.enabled); // DON'T SHOW DISABLED SCENES IN PLUGIN
    var sceneStrings = scenes.map(s => s.constructor.name);

    //sceneStrings = sceneStrings.reverse(); //

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
        data.__buttons = buttons.map(b => ({ label: b.label, method: b.methodKey, order: b.order, source: b.source }));

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

    for (let prop in props)
    {
        if (prop.startsWith("__"))
            continue;

        // NESTED @InspectorClass EDIT - props[prop] IS A { field: value } MAP FOR scene[prop]
        const inspectorClassName = resolveInspectorClassName(scene, prop);
        if (inspectorClassName && props[prop] && typeof props[prop] === "object")
        {
            var instance = (scene as any)[inspectorClassName];
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
    const inspectorClassName = className ? resolveInspectorClassName(scene, className) ?? className : undefined;
    var target = inspectorClassName ? (scene as any)[inspectorClassName] : scene;
    if (!target)
        return false;

    (target as any)[methodName]();
    return true;
  },

  getAllObjects() {
    const scene = plugin.GetCurrentScene();
    const layers = scene.object.GetLayers();

    return layers.flatMap((objects, layerIndex) => objects
                    .filter(o => o.customName !== 'ignoreInPlugin')
                    .map(o => ({
                        id: o.uniqueID,
                        name: o.pluginName || o.name || "gameObject",
                        hasChildren: (o.children.length > 0),
                        layerIndex,
                        layerName: scene.layerNames[layerIndex] ?? `Layer ${layerIndex}`,
                        layerCount: layers.length
                    })))
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
    info.entity = "The entity this entity will inherit from.";
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

  onBaseClassChange(baseClass: string, childPath: number[] = []): string[]
  {
    // GET CURRENT ENTITY KEYS
    var scene = (plugin.GetCurrentScene() as EntityScene);
    var name = scene.objectName;
    var raw = scene.settingsHandler.GetRaw();
    var processed = scene.settingsHandler.Get();
    var entity = plugin.ResolveWritableEntityPath(
        SettingsHandler.FindEntity(raw, name)!,
        childPath,
        raw,
        SettingsHandler.IsBaseEntity(raw, name) ? "ANY" : "ANY_ENTITY",
        SettingsHandler.FindEntity(processed, name)!
    );

    var entityKeys = Object.keys(entity).filter(k => !k.startsWith("__"));

    // GET EXTRA KEYS
    var extraKeys = plugin.GetExtraKeys(entityKeys, baseClass);
    return extraKeys;

    // IF EXTRA KEYS > 0, PLUGIN WILL WILL ASK FOR CONFIRMATION YES/NO
  },

  async onPressYesChangeBaseClass(extraKeys: string[], childPath: number[] = [])
  {
    // REMOVE FROM ENTITY EXTRA KEYS
    var scene = (plugin.GetCurrentScene() as EntityScene);
    var name = scene.objectName;
    var raw = scene.settingsHandler.GetRaw();
    var entity = plugin.ResolveRawEntityPath(
        SettingsHandler.FindEntity(raw, name)!,
        childPath,
        raw,
        SettingsHandler.IsBaseEntity(raw, name) ? "ANY" : "ANY_ENTITY"
    );

    for (var key of extraKeys)
        delete entity[key];

    await plugin.SaveSettingsData(raw);
  },
  
  // FIND THE ENTITY IN CURRENT entityData JSON, CONTRUCT IT, ADD EXTRA INFO, RETURN IT FOR PLUGIN VISUALIZATION
  // childPath, when given, re-selects that node in-scene after rebuilding - callers reloading to
  // reflect a field edit pass along whatever was selected beforehand so the transform tool stays on it.
  async gotoEntity(name: string, settingsDataName?: string, childPath?: Array<number | string>)
  {
    window.postMessage({ __fromGame: true, type: "lockObjectsTab", flag: true }, "*");

    const settingsHandler = plugin.GetSettingsDataHandler(settingsDataName);
    plugin.currentSettingsDataName = settingsHandler.GetRaw()?.name ?? "";
    // Remember it so setPluginConnected can re-open it after a recompile/restart.
    plugin.lastEntity = { name };

    /*const levelController = getLevelController();
    if (levelController && levelController.currentLevel && levelController.currentLevel.name == name)
    {
        return;
    }*/

    // A gotoEntity() called while already inside the entity editor (eg to reflect a field edit,
    // or to navigate to another entity) tears down and rebuilds the scene, which resets its camera
    // to auto-fit the entity's bounds - discarding whatever the user had panned/zoomed to. Preserve
    // it across that rebuild.
    const previousEntityScene = bare.scene.Get(EntityScene);
    var previousCameraTransform = previousEntityScene?.objectName == name
        ? { x: previousEntityScene.camera.target.x, y: previousEntityScene.camera.target.y, zoom: previousEntityScene.camera.zoom }
        : undefined;
    
    // IF ZOOM WAS INFINITY, ENTITY HAD NO BOUNDS, DON'T WANT TO RESTORE TO THAT
    if (previousCameraTransform?.zoom == Infinity)
        previousCameraTransform = undefined;

    if (!bare.scene.Get(EntityScene))
        bare.scene.Remove(EditorScene); // WILL REMOVE LEVEL EDITOR IF EXISTS

    plugin.notifyLeaveEntity = false;
    var entityScene = await bare.scene.Add(EntityScene, {name: name, settingsHandler: settingsHandler});
    //bare.scene.Add(HitboxScene, {name: name, settingsHandler: plugin.GetCurrentScene().settingsHandler});
    plugin.notifyLeaveEntity = true;

    if (previousCameraTransform)
    {
        entityScene.camera.SetPosition(previousCameraTransform.x, previousCameraTransform.y);
        entityScene.camera.SetZoom(previousCameraTransform.zoom);
    }

    // Opening/reloading an entity no longer auto-selects the root object live in-scene - the
    // panel still defaults to showing the root's own fields (that's separate, panel-side logic),
    // and the transform tool stays empty until the user clicks something or a caller passes
    // childPath (see below). EditorControlsHandler is freshly constructed in OnStart() on every
    // (re)open, so selection is already empty here.

    var entityWithLog = plugin.BuildEntityEditorPayload(
        name,
        entityScene.settingsHandler,
        entityScene
    );

    // restore whatever was selected before this reload, so a field edit that reloads the scene
    // doesn't silently drop the transform tool off the object being worked on.
    if (childPath)
        window.__GAME_DEBUG_API__.selectEntityObject(childPath);

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
        data.hasChildren = o.children.length > 0;
        data.name = o.pluginName || o.name || "gameObject";
        data.x = o.x;
        data.y = o.y;
        data.scaleX = o.scaleX;
        data.scaleY = o.scaleY;
        data.innerX = o.innerTransform.position.x;
        data.innerY = o.innerTransform.position.y;
        data.innerScaleX = o.innerScale.x;
        data.innerScaleY = o.innerScale.y;
        data.persistent = o.persistent;

        plugin.AddInspectorDataToObject(data, o, false, false);

        if (data.children)
        {
            for (var i = 0; i < data.children.length; i++)
            {
                AddExtraPropsToData(data.children[i], o.children[i]);
            }
        }
    }

    var data = EntitySerializer.SerializeObjectFully(scene, o, true, false) as any;
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

    // GET ORIGINAL VALUES OF OBJECT
    // GET CURRENT VALUES
    // PUT DIFFERENCE IN __changedFields FOR PLUGIN TO SHOW BLUE AND OPTION TO REVERT
    {
        var origEntity;
        if (o.entity)
        {
            // pivot/hitbox ARE KEPT MIRRORED ONTO o.entity WITH THE LIVE VALUE (SEE THE "PIVOT / HITBOX"
            // BLOCK BELOW), SO THEY'D ALWAYS "WIN" AS THEIR OWN BASELINE HERE AND NEVER SHOW UP AS
            // CHANGED. STRIP THEM SO THE PRESET DEFAULT IS USED AS THE BASELINE FOR THOSE TWO INSTEAD.
            var { pivot, hitbox, ...entityForOrigin } = o.entity;
            origEntity = o.scene.ConstructEntityWithDefaultValues(entityForOrigin, o.scene.settingsData);
        }
        else
        {
            // MAKE A NEW INSTANCE OF OBJECT, TO GET START ORIGINAL VALUES
            // IF IT'S A USER OBJECT EXTENDING GAMEOBJECT, THAT CONSTRUCTOR WOULD NEED TO WORK WITH ONLY THE SCENE ARGUMENT
            // ELSE KEEP TRYING PARENT CLASSES UNTIL ONE CONSTRUCTS SUCCESSFULLY, FALLING BACK TO PLAIN GameObject
            var gameObject:GameObject;
            var gameObjectClass = o.constructor as new (scene: Scene) => GameObject;
            while (true)
            {
                try {
                    gameObject = new gameObjectClass(o.scene);
                    break;
                }
                catch (e)
                {
                    // THERE WAS AN ERROR IN CONSTRUCTOR, NEED AN EXTRA ARGUMENT
                    // TRY PARENT CLASS NEXT, NOT ASKING USER TO FIX IT
                    var parentClass = Object.getPrototypeOf(gameObjectClass);
                    if (typeof parentClass !== "function")
                    {
                        gameObject = new GameObject(o.scene);
                        break;
                    }
                    gameObjectClass = parentClass;
                }
            }
            origEntity = o.scene.level.SerializeObjectFully(gameObject, true, true);
        }
        
        var curEntity = o.scene.level.SerializeObjectFully(o, true, true);
        var diffEntity = o.scene.level.GetEntitiesDiff(origEntity, curEntity);

        // FIELDS TO IGNORE - NOT IN INSPECTOR
        delete diffEntity.name;
        delete diffEntity.imagePath;
        delete diffEntity.texture;

        delete diffEntity.save; // EDGE CASE FROM LEVEL

        var changedFields = diffEntity;
        data.__changedFields = changedFields;

        var defaultValues = {};
        for (var field in changedFields)
        {
            defaultValues[field] = origEntity[field];
        }
        data.__defaultValues = defaultValues;
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
            let components = EntitySerializer.SerializeComponents(scene, comps, false);

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
  getFieldsSuggestions(entityName: string, childPath: string[], baseClass: string = "GameObject"): string[]
  {
    var suggestions = [
        "entity",
        "baseClass",
        "imagePath",
        "texture",
        "position",
        "pivot",
        "alpha",
        "visible",
        "scale",
        "rotation",
        "hitbox",
    ];

    var limitNumber = 7;

    // non-gameobject base classes (eg: textobject) get their own @inspectorfield/@save members
    // suggested first, then fall back to the generic gameobject list to fill remaining slots.
    // read them off the live instance (same as normal object inspection), not the bare class -
    // decorator metadata isn't reliably readable through a fake {constructor: cls} wrapper.
    if (baseClass && baseClass !== "GameObject")
    {
        var entityScene = bare.scene.Get(EntityScene);
        var liveObj: any = entityScene?.object.GetByName(entityName);
        for (var i = 0; liveObj && i < childPath.length; i++)
            liveObj = liveObj.children?.filter(child => child.save)[childPath[i]];

        if (liveObj)
        {
            // only fields declared by baseclass itself (or a class between it and gameobject),
            // not the inherited gameobject fields (position, scale, alpha, etc.) - those are
            // already covered by the generic suggestions list above.
            var classFieldNames = getInspectorFields(liveObj, true)
                .filter(f => f.source !== "GameObject" && !f.name.startsWith("_"))
                .map(f => f.name);
            suggestions = [...classFieldNames, ...suggestions.filter(s => !classFieldNames.includes(s))];
        }
    }

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
        var scene = plugin.GetCurrentScene();
        var entity = scene.settingsHandler.GetExtendedEntity(entityName);
        
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

        rawSettingsData.baseEntities ??= [];
        if (!SettingsHandler.FindEntity(rawSettingsData, "ANY"))
            rawSettingsData.baseEntities.push({ name: "ANY" });
        if (!SettingsHandler.FindEntity(rawSettingsData, "ANY_ENTITY"))
            rawSettingsData.baseEntities.push({ name: "ANY_ENTITY" });

        var processedSettingsData = entityScene.settingsHandler.Get();

        var entity = plugin.ResolveWritableEntityPath(
            SettingsHandler.FindEntity(rawSettingsData, entityScene.objectName)!,
            childPath,
            rawSettingsData,
            SettingsHandler.IsBaseEntity(rawSettingsData, entityScene.objectName) ? "ANY" : "ANY_ENTITY",
            SettingsHandler.FindEntity(processedSettingsData, entityScene.objectName)!
        );

        delete entity[field];

        await entityScene.settingsHandler.Process();

        var entityData = await window.__GAME_DEBUG_API__.gotoEntity(entityScene.objectName, undefined, childPath);

        await plugin.SaveSettingsData(rawSettingsData);

        return entityData;
  },

  // MARK/UNMARK AN INHERITED PROPERTY AS REMOVED ON THIS ENTITY (entity.propertiesRemoved)
  async setEntityPropertyRemoved(entityName: string, childPath: number[], field: string, removed: boolean)
  {
        return plugin.ToggleEntityRemovedArray("propertiesRemoved", field, removed, childPath);
  },

  // MARK/UNMARK AN INHERITED COMPONENT AS REMOVED ON THIS ENTITY (entity.componentsRemoved)
  async setEntityComponentRemoved(entityName: string, childPath: number[], compName: string, removed: boolean)
  {
        return plugin.ToggleEntityRemovedArray("componentsRemoved", compName, removed, childPath);
  },

  getDefaultValueForEntityField(entityName: string, field: string, childPath: number[] = [])
  {
    if (field == "pivotBasedOnHitbox")
        return {x: 0, y: 0};

    var scene = plugin.GetCurrentScene();
    let entityScene = scene as EntityScene;

    var rawSettingsData = entityScene.settingsHandler.GetRaw();

    var entity = plugin.ResolveRawEntityPath(
        SettingsHandler.FindEntity(rawSettingsData, entityScene.objectName)!,
        childPath,
        rawSettingsData,
        SettingsHandler.IsBaseEntity(rawSettingsData, entityScene.objectName) ? "ANY" : "ANY_ENTITY"
    );

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

    // THIS CHANGES THE PROPERTIES ON THE ENTITY, SAVES ITS SETTINGSDATA AND RELOADS THE ENTITY WITH gotoEntity(), WHERE IT GETS CONSTRUCTED AGAIN
    // THIS HAPPENS SINCE THE ENITTY CAN CHANGE DRASTICLY FROM CERTAIN CHANGES, EG: CHANGING THE BASE ENTITY. NOT ALL CHANGES ARE SO DRASTIC
    // BUT IT'S RELOADED EVERY TIME JUST IN CASE (COULD OPTIMIZE, BUT ALSO A GOOD WAY OF CATCHING BUGS CURRENTLY).
    // WHEN CHANGES ARE MADE IN-EDITOR TO THE ENTITY GAMEOBJECT, IT IS SERIALIZED AND COMPARED WITH THE SERIALIZED ORIGINAL ENTITY
    // ANY CHANGES ARE APPLIED TO THE ORIGINAL ENTITY
    //
    // THIS MAKES IT DIFFERENT FROM LEVEL SERIALIZATION, WHERE THE ENTITY DOESN'T RELOAD AND RECONSTRUCT ON CHANGES TO ITS FIELD.
    // INSTEAD, THE CHANGE ARE SENT STRAIGHT TO THE GAMEOBJECT IN THE SCENE. SINCE CHANGING THE GAMEOBJECT FIELDS HAVE NO BIG EFFECT ON THE STRUCTURE ITSELF.
    //
    // SHOULD MAKE THE CHANGE TO THE ENTITY, REBUILD SCENE, WHICH SHOULD RE-FEED PLUGIN WITH NEW DATA. SHOULD STAY AT SOME ENTITY (IF NOT DELETED)
    async setEntityField(name: string, props: Record<string, any>, childPath: number[], save:boolean = false, justAdded:boolean = false)
    {
        let entityScene = bare.scene.Get(EntityScene);
        const entityReferenceChanged = Object.prototype.hasOwnProperty.call(props, "entity");
        const selectedChildPath = [...childPath];
        var rawSettingsData = entityScene.settingsHandler.GetRaw();
        var processedSettingsData = entityScene.settingsHandler.Get();
        var obj = plugin.ResolveRuntimeEntityPath(
            entityScene.object.GetByName(entityScene.objectName),
            SettingsHandler.FindEntity(rawSettingsData, entityScene.objectName)!,
            SettingsHandler.FindEntity(processedSettingsData, entityScene.objectName)!,
            childPath,
            rawSettingsData,
            SettingsHandler.IsBaseEntity(rawSettingsData, entityScene.objectName) ? "ANY" : "ANY_ENTITY"
        );

        if (!obj)
            throw new Error(`Could not find runtime entity '${name}'`);

        if (!save)
        {
            for (var prop in props)
            {
                var value = props[prop];

                // component field preview (eg textcomponent.fontsize while dragging the inspector
                // field) - must apply onto the existing live component instance's setter, not
                // through obj.specialmap.components below: that handler is for constructing an
                // entity's components from scratch (see gameobject.specialmap), so calling it here
                // would `new` a second, unrelated component instance and leave the one actually
                // being rendered untouched - the preview would silently do nothing visually until
                // the edit was saved (which reloads the entity from scratch and self-corrects).
                if (prop === "components")
                {
                    for (var compName in value)
                    {
                        var compClass = bare.componentClasses[Helper.CapitalizeFirstLetter(compName) + "Component"];
                        var comp = obj.scene.component.Get(obj, compClass);
                        if (!comp)
                            continue; // COMPONENT NOT LIVE YET (EG STILL BEING ADDED) - NOTHING TO PREVIEW ONTO

                        var compData: Record<string, Scalar> = value[compName];
                        for (var compProp in compData)
                        {
                            if (compProp.startsWith("__"))
                                continue;

                            if (await applyInspectorField(comp, compProp, compData[compProp]))
                                continue;

                            comp[compProp] = compData[compProp];
                        }
                    }
                    continue;
                }

                // @InspectorField DESCRIPTORS (EG TextObject.text/fontSize, DECLARED AS { get, set })
                // NEED THEIR OWN SETTER INVOKED - A DIRECT ASSIGNMENT WOULD JUST OVERWRITE THE
                // DESCRIPTOR OBJECT ITSELF, SO THE LIVE PREVIEW NEVER ACTUALLY APPLIED THE CHANGE.
                // USES THE SAME applyInspectorField HELPER AS THE REGULAR OBJECT-EDIT PATH, WHICH
                // ONLY MATCHES REAL { get, set } DESCRIPTOR LITERALS - NOT CLASS INSTANCES LIKE Vec2
                // THAT HAPPEN TO ALSO EXPOSE A .set() METHOD (EG scale/position), SO IT WON'T
                // MISFIRE ON THOSE THE WAY A NAIVE "HAS A .set METHOD" CHECK WOULD.
                if (await applyInspectorField(obj, prop, value))
                    continue;

                // if special mapping exists — use it
                const special = obj.specialMap[prop];
                if (special)
                {
                    special(obj, value);
                    continue;
                }

                obj[prop] = value;
            }

            return;
        }

        // MAKE SURE ANY OR ANY_ENTITY EXISTS, IF WE'RE GONNA WRITE TO IT
        //if (entityScene.isBase)
        {
            //if (entityScene.objectName == "ANY")
                if (!SettingsHandler.FindEntity(rawSettingsData, "ANY"))
                    rawSettingsData.baseEntities.push({ name: "ANY" });
            
            //if (entityScene.objectName == "ANY_ENTITY")
                if (!SettingsHandler.FindEntity(rawSettingsData, "ANY_ENTITY"))
                    rawSettingsData.baseEntities.push({ name: "ANY_ENTITY" });
        }

        // WRITE ENTITY PROPS TO RAW 
        var entity = plugin.ResolveWritableEntityPath(
            SettingsHandler.FindEntity(rawSettingsData, entityScene.objectName)!,
            childPath,
            rawSettingsData,
            SettingsHandler.IsBaseEntity(rawSettingsData, entityScene.objectName) ? "ANY" : "ANY_ENTITY",
            SettingsHandler.FindEntity(processedSettingsData, entityScene.objectName)!
        );
        
        var entityCopy = Object.assign({}, entity);

        // MERGE COMPONENTS, ELSE Object.assign WOULD OVERWRITE THE EXISTING COMPONENTS, SINCE THEY'RE NESTED
        if (props.components)
        {
            entity.components = entityScene.MergeComponents(entity.components, props.components);
            delete props.components;
        }

        Object.assign(entity, props);

        // GET ENTITY WITH DEFAULT VALUES
        {
            for (var key in props)
            {
                delete entityCopy[key];
            }

            // DELETE ANY PROPS FROM ENTITY THAT HAVE SAME VALUE AS DEFAULT, THEY'RE NOT NEEDED
            // EG: YOU SET scaleX TO 2, THEN BACK TO 1, IT WILL REMOVE THE scaleX PROPERTY
            if (!justAdded) // WILL NOT PASS IF USER CLICKED 'ADD FIELD'
            {
                // THIS IS NICE OF CHANGED EXTENDED FIELDS
                // NOT SO MUCH FOR OWN FIELDS, THEY JUST GET REMOVED
                var entityWithDefaultValues = entityScene.GetEntityWithDefaultValues(entityCopy, entityScene.settingsData) as any;
                for (var key in props)
                {
                    var val = props[key];
                    var defaultVal = entityWithDefaultValues[key];
                    if (val == defaultVal)
                        delete entity[key];
                }
            }
        }
        
        // SINCE WE JUST MODIFIED THE RAW ENTITY, WE RE-PROCESS THE settingsData AGAIN, SO IT'S UP TO DATE 
        await entityScene.settingsHandler.Process(rawSettingsData);

        var entityData;

        // SAVE TO FILE
        if (save)
        {
            entityData = await window.__GAME_DEBUG_API__.gotoEntity(entityScene.objectName, undefined, selectedChildPath);

            await plugin.SaveSettingsData(rawSettingsData);

            // The child entity dropdown is saved asynchronously by the panel, so its direct API
            // response is not consumed there. Ask the panel to reopen the same root/child after the
            // new base has been processed; gotoEntity will then resend the freshly rebuilt recursive
            // baseEntityLog (including the updated extend chain and field/component provenance).
            if (entityReferenceChanged && selectedChildPath.length > 0 && plugin.lastEntity)
            {
                window.postMessage({
                    __fromGame: true,
                    type: "gotoEntity",
                    name: plugin.lastEntity.name,
                    settingsDataName: plugin.currentSettingsDataName,
                    childPath: selectedChildPath
                }, "*");
            }
        }

        // ADD DEFAULTS TO RAW SETTINGS AGAIN, SO PROPS CAN BE ADDED TO IT
        if (!SettingsHandler.FindEntity(rawSettingsData, "ANY"))
            rawSettingsData.baseEntities.push({ ...SettingsHandler.FindEntity(defaultSettingsData, "ANY")! });
        if (!SettingsHandler.FindEntity(rawSettingsData, "ANY_ENTITY"))
            rawSettingsData.baseEntities.push({ ...SettingsHandler.FindEntity(defaultSettingsData, "ANY_ENTITY")! });

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

        // APPLY @InspectorField DECORATED FIELDS DECLARED ON THE OBJECT ITSELF.
        // REMEMBER WHICH PROPS THAT COVERED, SO THE GENERIC PASS BELOW DOESN'T RE-ASSIGN
        // AND CLOBBER THEIR {get,set} DESCRIPTORS.
        const inspectorHandled = new Set<string>();
        for (let prop in props)
        {
            if (prop.startsWith("__"))
                continue;

            if (await applyInspectorField(o, prop, props[prop]))
                inspectorHandled.add(prop);
        }

        // PROPS THAT NEED BESPOKE HANDLING (BELOW) - SKIP THEM IN THE GENERIC PASS
        const handledExplicitly = new Set(["pivot", "innerPivot", "hitbox", "tags", "customData", "components"]);

        // GENERIC PASS - MIRRORS Scene.ApplyEntityVarsToGameObject / setEntityField:
        // route through the object's specialMap (color, children, ...) else assign the field directly.
        // COVERS customName, x/y, scale*, rotation, inner*, flipped, visible, persistent, save, alpha, color, children.
        const specialMap = o.specialMap;
        for (let prop in props)
        {
            if (prop.startsWith("__") || inspectorHandled.has(prop) || handledExplicitly.has(prop))
                continue;

            const value = props[prop];
            if (value === undefined)
                continue;

            const special = specialMap[prop];
            if (special)
            {
                special(o, value);
                continue;
            }

            if (!(prop in o))
                continue;

            // detect XY struct - write into the existing object (eg a Vec2) rather than replacing it
            const isXY = value && typeof value === "object" && ("x" in value || "y" in value);
            if (isXY)
            {
                if ("x" in value) o[prop].x = value.x;
                if ("y" in value) o[prop].y = value.y;
                continue;
            }

            o[prop] = value;
        }

        // PIVOT / HITBOX - LIKE A specialMap ENTRY, BUT ALSO RE-APPLY WHEN GIVEN AS A PERCENTAGE
        // AND MIRROR THE VALUE ONTO o.entity SO getObject() STAYS IN SYNC.
        if (props.pivot !== undefined) {
            if ((props.pivot.x >= 0 && props.pivot.x < 1) || (props.pivot.y >= 0 && props.pivot.y < 1))
            {
                scene.ApplyEntityVarsToGameObject(props as Entity, o, false);
            }
            if (o.entity)
                o.entity.pivot = props.pivot; //
        }
        if (props.hitbox !== undefined) {
            if ((props.hitbox.x >= 0 && props.hitbox.x < 1) || (props.hitbox.y >= 0 && props.hitbox.y < 1) ||
                (props.hitbox.width >= 0 && props.hitbox.width < 1) || (props.hitbox.height >= 0 && props.hitbox.height < 1))
            {
                scene.ApplyEntityVarsToGameObject(props as Entity, o, false);
            }
            if (o.entity)
                o.entity.hitbox = props.hitbox; //
        }

        //if (props.pivotBasedOnHitbox !== undefined) { o.pivotBasedOnHitbox.x = props.pivotBasedOnHitbox.x; o.pivotBasedOnHitbox.y = props.pivotBasedOnHitbox.y; }

        // tags / customData CAN ARRIVE AS JSON STRINGS (entity/legacy path) OR ALREADY-PARSED
        // array/object VALUES (the @InspectorField path handled by applyInspectorField above).
        if (typeof props.tags === "string") o.tags = JSON.parse(props.tags);
        if (typeof props.customData === "string") o.customData = JSON.parse(props.customData);

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
                    // BUT ALSO CALL Removed(), Awake(), Added() AND Start() AROUND IT, TO RESET THE COMPONENT AND LET THE NEW VALUES BE REPROCESSED
                   
                    if (bare.gameMode == GameMode.Play)
                        comp.Removed();

                    var compData:Record<string, Scalar> = props.components[compName];
                    for (let compProp in compData)
                    {
                        if (compProp.startsWith("__"))
                            continue;

                        if (await applyInspectorField(comp, compProp, compData[compProp]))
                            continue;

                        comp[compProp] = compData[compProp];
                    }

                    if (bare.gameMode == GameMode.Play)
                    {
                        comp.Awake(comp.go);
                        comp.Added(comp.go); // CALLS OnAdded() AS WELL
                        comp.Start();
                    }
                }
                else
                {
                    // JUST CREATED A COMPONENT
                    o.AddComponent(compClass);
                }

            }
        }

        // ALIGN ALL THE VARS WITH THE LEVEL ENTITY, FOR GETOBJECT()... todo
        (o.scene as EditorScene).saveLevelCallback?.();

        return true;
    },

    removeObject(id: string) {
        const scene = plugin.GetCurrentScene();
        const root = scene.object.GetById(id);
        if (!root) return false;

        root.Remove();

        return true;
    },

    moveObjectInHierarchy(id: string, direction: string) {
        const scene = plugin.GetCurrentScene();
        const obj = scene.object.GetById(id);
        if (!obj) return false;

        let siblings: GameObject[] | null = null;
        if (obj.parent) {
            siblings = obj.parent.children;
        } else {
            const layer = scene.object.GetLayerOf(obj);
            if (layer < 0) return false;
            siblings = scene.object.GetLayer(layer);
        }

        const currentIndex = siblings.indexOf(obj);
        if (currentIndex < 0) return false;

        let nextIndex = currentIndex;
        if (direction === "up") nextIndex = Math.min(siblings.length - 1, currentIndex + 1);
        else if (direction === "down") nextIndex = Math.max(0, currentIndex - 1);
        else if (direction === "top") nextIndex = siblings.length - 1;
        else if (direction === "bottom") nextIndex = 0;
        else return false;

        if (nextIndex === currentIndex) return true;

        siblings.splice(currentIndex, 1);
        siblings.splice(nextIndex, 0, obj);

        (scene as EditorScene).saveLevelCallback?.();

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
    
    getSettingsDataList() {
        return plugin.LoadSettingsDataJSONs();
    },

  getCurrentSettingsDataName(): string {
    return plugin.currentSettingsDataName;
  },

  getEntityData(settingsDataName?: string):SettingsData {
    const settingsHandler = plugin.GetSettingsDataHandler(settingsDataName);
    plugin.currentSettingsDataName = settingsHandler.GetRaw()?.name ?? "";
    var settingsData = settingsHandler.GetRaw();

    //return settingsData; // ADDED TO MAKE DEFAULT GAME NOT HAVE BELOW
    // SHOULD HAVE IT AGAIN WHEN I START WORK ON PLUGIN ENTITIES

    // ADD DEFAULTS - SAME AS defaultSettingsData - REBUILD TO ADD IN FRONT
    settingsData.baseEntities ??= [];

    const sentinelNames = ["ANY", "ANY_ENTITY", "NONE"];
    const sentinels = sentinelNames.map(name =>
        SettingsHandler.FindEntity(settingsData, name)
        ?? SettingsHandler.FindEntity(defaultSettingsData, name)!
    );
    const rest = settingsData.baseEntities.filter(entity => !sentinelNames.includes(entity.name!));

    settingsData.baseEntities = [...sentinels, ...rest];

    return settingsData;
  },

  async addNewEntity(name: string, newRawData: SettingsData)
  {
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
  },

  removeEntity(name: string, newRawData: SettingsData)
  {
    var scene = plugin.GetCurrentScene();

    scene.settingsHandler.SetRaw(newRawData);
    scene.settingsHandler.Process(newRawData);
  },

  async setEntityData(newData: SettingsData, settingsDataName?: string)
  {
    const settingsHandler = plugin.GetSettingsDataHandler(settingsDataName);
    settingsHandler.SetRaw(newData);
    await settingsHandler.Process(newData);
    await plugin.SaveSettingsData(newData);
  },

  notifyEntityDataChanged(data: { name: string }) {
    if (!plugin.doNotifyAfterSave)
      return;

    const entityScene = bare.scene.Get(EntityScene);
    if (!entityScene || entityScene.objectName != data.name)
      return;

    const entity = plugin.BuildEntityEditorPayload(
      data.name,
      entityScene.settingsHandler,
      entityScene
    );
    window.postMessage({ __fromGame: true, type: "entityData", data: { ...data, entity } }, "*");
  },

  notifyEntityTransformPreview(data) {
    window.postMessage({ __fromGame: true, type: "entityTransformPreview", data }, "*");
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
              if (plugin.lastEntity && !bare.scene.Get(EntityScene))
              {
                  window.postMessage({ __fromGame: true, type: "gotoEntity", name: plugin.lastEntity.name }, "*");
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
              levelData: levelData,
              skipReload: true
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
              path: path,
              skipReload: true
          })
        });
        const json = await res.json().catch(() => null);

        if (SaveData.currentLevelStr == levelName)
        {
            SaveData.currentLevelStr = '';
            bare.scene.Remove(EditorScene); // REMOVES IT, IN CASES WE'RE IN THERE. ELSE WE RESTART BACK INTO IT
            plugin.GetCurrentScene().Restart(); // DON'T HAVE LEVEL TO GO TO, SINCE WE JUST REMOVED IT, SO JUST RESTART GAME
        }
        return { ok: res.ok, saved: res.ok, response: json };
      } catch (error: any) {
        console.error('Failed to remove level', error);
        return { ok: false, error: error?.message ?? String(error) };
      }
  },
        
    async updateLevelData(changes: { name?: string, width?: number, height?: number, backgroundColor?: string }) {
        var levelHandler = bare.scene.GetLevelScene().level;
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
    },

    async saveLevelData(levelName: string, changes: { name?: string, width?: number, height?: number, backgroundColor?: string }) {
        try {
            var levelHandler = bare.scene.GetLevelScene().level;
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
                    body: JSON.stringify({ levelPath: newPath, levelData: data, skipReload: true })
                });
                await fetch('/api/remove-level', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: oldPath, skipReload: true })
                });
                window.__GAME_DEBUG_API__.refreshLevelFiles();

                // GO TO THE LEVEL EDITOR
                window.__GAME_DEBUG_API__.gotoLevelEdit(changes.name);

            } else {
                await fetch('/api/save-level', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ levelPath: oldPath, levelData: data, skipReload: true })
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
                //bare.scene.Add(EditorScene, {levelPathOrData: level}); // OVERWRITES THE SETTINGSDATA WITH DEFAULT, NO GOOD
            }
            return;
        }

        bare.scene.Add(EditorScene);
    },
};

export class PluginHandler
{
    currentSettingsDataName: string = "";
    private settingsDataHandlers = new Map<string, SettingsHandler>();

    lastRightClickedObject: GameObject;

    public openEditorButtonPosition: Position;
    
    public isPluginConnected: boolean = false;

    debugActions: Array<{label?: string, callback?: () => void}> = [];
    doNotifyAfterSave: boolean = true;
    notifyLeaveEntity: boolean = true;
    currentSceneClassString: string = "";
    // The entity being edited, remembered across a recompile/restart so setPluginConnected
    // can re-open it (the restart drops back to the main scene).
    lastEntity: { name: string } | null = null;

    public GetPaused(): boolean
    {
        return !!bare.paused;
    }

    public TogglePause(): boolean
    {
        bare.paused = !bare.paused;
        globalEvents.emit(BareEvent.game_pauseToggled, bare.paused);
        return bare.paused;
    }

    static Init(showEditorButton: boolean, editorButtonPosition: Position)
    {
        plugin = new PluginHandler(showEditorButton, editorButtonPosition);
        globalThis.plugin = plugin;
    }

    constructor(showEditorButton: boolean, editorButtonPosition: Position)
    {
        this.openEditorButtonPosition = editorButtonPosition;

        // HIDE OR SHOW EditorUIScene
        // SHOWS WHEN NO PLUGIN/CONNECTION
        // HIDES WHEN THERE IS - CAN PRESS THE BUTTON IN THE PLUGIN
        var check = async () => {
            if (this.isPluginConnected && showEditorButton === false)
            {
                bare.scene.Remove(EditorUIScene);
                return;
            }

            var levelScene = bare.scene.GetLevelScene();
            if (levelScene)
            {
                var _showEditorButton = true;

                if (showEditorButton)
                    _showEditorButton = true;

                if (showEditorButton != true && this.isPluginConnected)
                    _showEditorButton = false;

                if (showEditorButton == false)
                    _showEditorButton = false;

                if (!bare.scene.Has(EditorUIScene) && _showEditorButton)
                {
                    var scene = await bare.scene.Add(EditorUIScene, {openEditorButtonPosition: this.openEditorButtonPosition});
                    bare.scene.MoveToFront(scene);
                }
            }
            else
            {
                bare.scene.Remove(EditorUIScene);
            }
        };
        check();
        globalEvents.on(BareEvent.scene_changed, check);
        globalEvents.persistent.on(BareEvent.game_pauseToggled, (paused) => {
            window.postMessage({ __fromGame: true, type: "pauseChanged", paused }, "*");
        });

        globalEvents.persistent.once(BareEvent.game_started, () => {
            // RIGHT CLICK FOR PLUGIN SELECT
            document.addEventListener('pointerdown', this.OnRightClickPointerDown, false);

            this.LoadSettingsDataJSONs();
            
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
                const scene = bare.scene.GetMainScene();
                if (scene)
                    this.SetCurrentScene(scene.constructor.name);
            }

            var isAnyEntityScene = bare.scene.Get(EntityScene);
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

        // NOTIFY THE PLUGIN WHEN AN OBJECT IS DESTROYED, SO IT CAN CLEAR ITS OBJECT PANEL
        // (SCENES EMIT THIS ON globalEvents AS WELL AS ON THEIR OWN scene.events)
        globalEvents.persistent.on(BareEvent.game_objectRemoved, (gameObject) => {
            if (!this.isPluginConnected)
                return;

            window.postMessage({ __fromGame: true, type: "objectRemoved", id: gameObject.uniqueID }, "*");
        });

        /*globalEvents.persistent.on(BareEvent.level_loaded, ({ levelStr }) => {
            window.__GAME_DEBUG_API__.selectLevel(levelStr);
        });*/

        // RESTART
        this.AddDebugAction("Restart Game", () => bare.Restart());
        //this.AddDebugAction("Restart Level", () => bare.scene.Get(LevelScene).Restart()); //
        this.AddDebugAction("Clear Save Data", () => SaveDataHandler.Clear());
        this.AddDebugBreak();

        // DEBUG
        this.AddDebugAction("Toggle Debug Visuals", () => window.debug = !window.debug);
        this.AddDebugBreak();
        this.AddDebugBreak();
    }

    HandleClickObject(obj: GameObject)
    {
        var entityScene = bare.scene.Get(EntityScene);
        if (entityScene && obj?.scene === entityScene)
        {
            // EntityScene deliberately disables canvas-driven selection. A selection coming
            // from the plugin is still authoritative and should drive TransformTool.
            entityScene.editorControlsHandler.SelectGameObjects([obj], true, true, false);
            return;
        }

        var editorScene = bare.scene.Get(EditorScene);
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

            // TRANSFORM GIZMO REPLACES THE OUTLINE SHADER
            TransformToolHandler.Get().SetTargets([obj]);

            this.lastRightClickedObject = obj;
        }
        else
        {
            TransformToolHandler.Get().Clear();
        }
    }

    private OnRightClickPointerDown = async (ev: PointerEvent) =>
    {
      if (bare.paused || bare.levelEditorOpen)
          return;

      if (ev.button === 2)
      {
        var isControlDown = keyboardController.IsKeyDown("control");
          const obj = isControlDown ? this.CheckClickDeepChild(ev) : this.CheckClickGameObject(ev);

          if (obj)
              this.SyncSceneMouseToPointerDown(obj.scene, ev);
        
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
              TransformToolHandler.Get().StartMoveFromPointer(obj.scene, mouseWorldAtClick, obj);
          }
      }

      ev.preventDefault();
      return false;
  };

    private SyncSceneMouseToPointerDown(scene: Scene, ev: PointerEvent): void
    {
        var p = bare.GetCanvasScreenPosition(ev.clientX, ev.clientY);
        var mouse = scene.mouse;

        mouse.screen.positionPrev.x = mouse.screen.position.x;
        mouse.screen.positionPrev.y = mouse.screen.position.y;

        mouse.screen.position.x = p.x;
        mouse.screen.position.y = p.y;
        mouse.SetPosition(p.x, p.y);

        mouse.PointerDownAny({ mouseX: p.x, mouseY: p.y, event: ev, isLeftButton: ev.button == 0 });
    }
    
    CheckClickGameObject(ev: PointerEvent): GameObject | null
    {
        //var objs = this.GetCurrentScene().object.GetAll();
        var foundObj:GameObject | null = null;
        var scenes = bare.scene.GetAll();
        var p = bare.GetCanvasScreenPosition(ev.clientX, ev.clientY);
        for (var i = scenes.length - 1; i >= 0; i--)
        {
            var scene = scenes[i];
            var objs = scene.object.GetLayers().flat();
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

        var scenes = bare.scene.GetAll();
        var p = bare.GetCanvasScreenPosition(ev.clientX, ev.clientY);
        for (var i = scenes.length - 1; i >= 0; i--)
        {
            var scene = scenes[i];
            var objs = scene.object.GetAll();
        
            var pWorld = scene.ScreenToWorldPos(p);

            for (var j = objs.length - 1; j >= 0; j--)
            {
                var obj = objs[j];

                if (obj.customName == 'ignoreInPlugin')
                    continue;

                if (!obj.visible || !obj.visibleInEditor || obj.alpha == 0)
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

    TraceComponent(uid: string | null, compName: string): boolean
    {
        if (!uid || !compName)
            return false;

        var obj = getObjectByIdFromAllScenes(uid);
        if (!obj)
        {
            console.error("Object not found");
            return false;
        }

        var compClass = bare.componentClasses[Helper.CapitalizeFirstLetter(compName) + "Component"];
        if (!compClass)
        {
            console.error("Component class not found");
            return false;
        }

        var comp = obj.scene.component.Get(obj, compClass);
        if (!comp)
        {
            console.error("Component not found");
            return false;
        }

        trace('Bare Engine - Component Expanded:', compName, comp);
        return true;
    }

    TraceInspectorClass(className: string, sceneClassString?: string): boolean
    {
        if (!className)
            return false;

        var scene = sceneClassString ? this.GetScene(sceneClassString) : this.GetCurrentScene();
        if (!scene)
            return false;

        const inspectorClassName = resolveInspectorClassName(scene, className) ?? className;
        var instance = (scene as any)[inspectorClassName];
        if (!instance)
            return false;

        trace('Bare Engine - InspectorClass Expanded:', className, instance);
        return true;
    }

    TraceScene(sceneClassString: string): boolean
    {
        var scene = this.GetScene(sceneClassString);
        if (!scene)
            return false;

        trace('Bare Engine - Scene Selected:', scene.constructor.name, scene);
        return true;
    }

    SelectObjectInPlugin(uid: string, openObjectsTab: boolean = false, parentIds: string[] = [])
    {
        window.__GAME_DEBUG_API__.selectObjectInPlugin(uid, openObjectsTab, parentIds);
    }

    SelectObjectsInPlugin(uids: string[])
    {
        window.__GAME_DEBUG_API__.selectObjectsInPlugin(uids);
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
        var sceneInstances = bare.scene.GetAll();
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

        const scenes = bare.scene.GetAll();
        const byName = scenes.find(s => s.constructor?.name === sceneClassString);
        if (byName) return byName;

        const sceneClass = (globalThis as any)[sceneClassString] as any;
        if (sceneClass) return bare.scene.Get(sceneClass) ?? null;

        return null;
    }

    GetScene(sceneClassString: string): Scene
    {
        const resolved = this.ResolveSceneByName(sceneClassString);
        if (resolved) return resolved;

        const fallback = bare.scene.GetMainScene();
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

        var entitiesCombined = [...settings.baseEntities, ...settings.entities];
        for (const entity of entitiesCombined)
        {
            let extendCount = 0;

            let extendEntities = [];
            let baseEntity = entity.entity;
            while (baseEntity)
            {
                extendCount++;
                const extendedEntity = SettingsHandler.FindEntity(settings, baseEntity);
                if (!extendedEntity)
                    break;
                extendEntities.push(extendedEntity);
                baseEntity = extendedEntity.entity;
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
    BuildExtendDataLog(entity: Entity, entityToApplyTo: Entity, entityName: string, processedEntity: Entity, settingsDataRaw: SettingsData, settingsDataProcessed: SettingsData): Entity
    {
        var newEntity = entityToApplyTo;//{...newEntity}; // SHALLOW COPY, MORE IS NOT NEEDED, SINCE WE ONLY ADD baseEntityLog TO IT
        var settingsHandler = this.GetCurrentScene().settingsHandler;
        var getRawEntity = (name: string): Entity | undefined =>
            settingsHandler.GetRawEntity(name, settingsDataRaw);
        var getProcessedEntity = (name: string): Entity | undefined =>
            settingsHandler.GetProcessedEnity(name, settingsDataProcessed);

        // GET EXTENDED ENTITIES ALL THE WAY DOWN, PUSH IN extendOrder. For nested entities the
        // authored `entity` field is authoritative. entityToApplyTo also carries the ANY_ENTITY
        // default synthesized by BuildEntityEditorData, which must be logged when none was authored.
        // Fall back to processed data for callers that did not construct an editor entity first.
        let baseEntity = entity.entity || entityToApplyTo.entity || processedEntity.entity;

        var extendOrder = [entityName];
        newEntity.baseEntityLog = {};
        newEntity.baseEntityLog["__extendOrder__"] = extendOrder;

        while (baseEntity)
        {
            const currentBaseEntity = baseEntity;
            extendOrder.push(currentBaseEntity);

            const processedBaseEntity = getProcessedEntity(currentBaseEntity);
            baseEntity = processedBaseEntity?.entity;

            // A UID points at a child definition rather than a top-level entity. Child definitions
            // do not persist their implicit default base, so continue through ANY_ENTITY when the
            // referenced child has no explicit entity. This matches BuildEntityEditorData's direct
            // child path and produces UID/name -> ANY_ENTITY -> ANY in the inheritance log.
            if (!baseEntity && getRawEntity(currentBaseEntity)?.entityUID == currentBaseEntity)
                baseEntity = "ANY_ENTITY";
        }

        // FILL INFO ABOUT WHAT ENTITY PROPERTIES ARE EXTENDED BY WHY WHICH DATA - USING extendOrder
        let propsInThisEntity = Object.keys(entity); // USING entity, NOT newEntity SINCE THAT CONTAINS ALL PROPS ALREADY
        if (propsInThisEntity.includes("name"))
            propsInThisEntity.splice(propsInThisEntity.indexOf("name"), 1);

        // AN ENTITY PROP THAT *ALSO* EXISTS SOMEWHERE IN THE EXTEND CHAIN IS AN OVERRIDE OF AN
        // INHERITED PROP, NOT A BRAND-NEW OWN PROP. KEEP THOSE LOGGED UNDER THEIR BASE SOURCE (SO
        // THEY STAY GROUPED UNDER THE EXTENDED ENTITY IN THE PLUGIN INSTEAD OF JUMPING TO THE OWN
        // GROUP) AND FLAG THEM IN __overriddenFields__ SO THE PLUGIN SHOWS A REVERT (R) BUTTON.
        // baseEntity/baseClass ARE STRUCTURAL (EVERY ENTITY IN A CHAIN DECLARES THEM) - ALWAYS OWN.
        var overrideExcluded = new Set(["baseEntity", "baseClass"]);
        // Returns the inherited value for a prop from the nearest base in the chain that declares it,
        // or a sentinel {found:false} when no base declares it.
        var getInheritedValue = (prop: string): { found: boolean, value?: any } =>
        {
            for (var b = 1; b < extendOrder.length; b++)
            {
                var baseEnt = getRawEntity(extendOrder[b]);
                if (baseEnt && Object.prototype.hasOwnProperty.call(baseEnt, prop))
                    return { found: true, value: baseEnt[prop] };
            }
            return { found: false };
        };

        // Compares an own value against an inherited value. Handles primitives directly and falls back
        // to a structural (JSON) compare for object values like pivot {x,y}.
        var valuesEqual = (a: any, b: any): boolean =>
        {
            if (a === b) return true;
            if (a && b && typeof a === "object" && typeof b === "object")
                return JSON.stringify(a) === JSON.stringify(b);
            return false;
        };

        var overriddenFields: string[] = [];
        var ownOnlyProps: string[] = [];
        for (var ownProp of propsInThisEntity)
        {
            if (!overrideExcluded.has(ownProp))
            {
                var inherited = getInheritedValue(ownProp);
                if (inherited.found)
                {
                    // The prop exists in the base chain. It's only a real override when the own value
                    // actually DIFFERS from the inherited value. If the user set it back to the inherited
                    // value it's redundant, so skip it entirely (neither own nor overridden) - the base
                    // that declares it will claim it below and it renders as a normal inherited field
                    // (no blue label / revert button).
                    if (valuesEqual(entity[ownProp], inherited.value))
                        continue;

                    overriddenFields.push(ownProp);
                    continue;
                }
            }
            ownOnlyProps.push(ownProp);
        }

        newEntity.baseEntityLog[entityName] = ownOnlyProps;
        newEntity.baseEntityLog["__overriddenFields__"] = overriddenFields;

        // ONLY OWN-ONLY PROPS SEED propsFound - OVERRIDDEN PROPS ARE LEFT FOR THE NEAREST BASE THAT
        // DECLARES THEM TO CLAIM AS ITS SOURCE (KEEPING THEM UNDER THAT BASE'S GROUP).
        var propsFound = ownOnlyProps.slice();

        for (var i = 1; i < extendOrder.length; i++) // START AT 1, ALREADY HANDLED 0 (SELF) ABOVE
        {
            // LOG EXTENDED PROPERTIES - SHOULD NOT HAVE BEEN FOUND BEFORE
            var extendEntityName = extendOrder[i];
            var extendEntity = getRawEntity(extendEntityName); // THIS CAUSES A PROBLEM WITH FIELD THAT CAN ALSO BE STRING, settingsDataRaw IS DIFFERENT THEN PROCESSED, DOESN'T END UP UNDER RIGHT BASE ENTITY. EG pivotPercOnHitbox CENTER - TODO
            if (!extendEntity)
                continue;
            var propsExtended = Object.keys(extendEntity);
            var propsExtendedFiltered = propsExtended.filter(p => !propsFound.includes(p));

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
                    : getRawEntity(sourceName);
                var sourceComponents = sourceEntity?.[componentType];
                if (!sourceComponents) continue;

                for (var componentName in sourceComponents)
                {
                    if (!componentSources[componentName])
                        componentSources[componentName] = sourceName;
                }
            }
        }

        // re-add removed properties/components so the plugin can still show them (greyed-out, with a revert button).
        // constructentity stripped them out of processedentity via propertiesremoved/componentsremoved, so we look
        // up the inherited value from the base chain and tag it with the source that provides it.
        var removedProps = Array.isArray(entity.propertiesRemoved) ? entity.propertiesRemoved : [];
        for (var removedProp of removedProps)
        {
            var propSource = "";
            var propValue: any = undefined;
            for (var p = 1; p < extendOrder.length; p++)
            {
                var propSrc = extendOrder[p];
                var propRawBase = getRawEntity(propSrc);
                if (propRawBase && Object.prototype.hasOwnProperty.call(propRawBase, removedProp))
                {
                    propSource = propSrc;
                    propValue = getProcessedEntity(propSrc)?.[removedProp] ?? propRawBase[removedProp];
                    break;
                }
            }
            // FALL BACK TO THE IMMEDIATE BASE IF NO AUTHORED SOURCE FOUND (EG A CLASS-LEVEL DEFAULT)
            if (!propSource && extendOrder.length > 1)
            {
                propSource = extendOrder[1];
                propValue = getProcessedEntity(propSource)?.[removedProp];
            }
            if (!propSource)
                continue;

            newEntity[removedProp] = propValue ?? null;
            newEntity.baseEntityLog[propSource] ??= [];
            if (!newEntity.baseEntityLog[propSource].includes(removedProp))
                newEntity.baseEntityLog[propSource].push(removedProp);
        }

        var removedComps = Array.isArray(entity.componentsRemoved) ? entity.componentsRemoved : [];
        if (removedComps.length > 0)
            newEntity.components = { ...(newEntity.components ?? {}) }; // CLONE - newEntity SHARES processedEntity'S components REFERENCE
        for (var removedComp of removedComps)
        {
            var compSource = "";
            var compValue: any = undefined;
            for (var c = 1; c < extendOrder.length; c++)
            {
                var compSrc = extendOrder[c];
                var compRawBase = getRawEntity(compSrc);
                if (compRawBase?.components && Object.prototype.hasOwnProperty.call(compRawBase.components, removedComp))
                {
                    compSource = compSrc;
                    compValue = getProcessedEntity(compSrc)?.components?.[removedComp] ?? compRawBase.components[removedComp];
                    break;
                }
            }
            if (!compSource && extendOrder.length > 1)
            {
                compSource = extendOrder[1];
                compValue = getProcessedEntity(compSource)?.components?.[removedComp];
            }
            if (!compSource)
                continue;

            newEntity.components[removedComp] = compValue ?? {};
            newEntity.baseEntityLog["__componentSources__"].components[removedComp] = compSource;
        }

        return newEntity;
    }

    // Build the panel-facing representation for an entity that is already open. Unlike
    // gotoEntity(), this does not add or rebuild a scene, so post-save notifications can publish
    // exactly the same resolved data shape without disturbing the live editor.
    BuildEntityEditorPayload(name: string, settingsHandler: SettingsHandler, entityScene: EntityScene): Entity
    {
        const raw = settingsHandler.GetRaw();
        const entity = SettingsHandler.FindEntity(raw, name)
            || SettingsHandler.FindEntity(defaultSettingsData, name);

        const processed = settingsHandler.Get();
        const processedEntity = SettingsHandler.FindEntity(processed, name);
        const isBase = SettingsHandler.IsBaseEntity(raw, name);

        if (!entity)
            throw new Error(`Could not build editor data for missing entity '${name}'`);

        var defaultBaseEntity = isBase ? "ANY" : "ANY_ENTITY";
        var extendedEntity = Helper.DeepCopy(entity);
        settingsHandler.ExtendEntity(
            extendedEntity,
            raw,
            defaultBaseEntity,
            { childDefaultBaseEntity: "ANY_ENTITY" }
        );

        // Child entities need the same inherited fields, extend provenance, defaults, and removal
        // metadata as the root entity; otherwise the panel cannot render their labels and controls.
        // Expand the complete display tree once, then walk it alongside the authored raw tree so
        // BuildExtendDataLog still receives the correct ownership/provenance record for each node.
        const entityWithLog = this.BuildEntityEditorData(
            entity,
            extendedEntity,
            name,
            processedEntity,
            raw,
            processed
        );

        const obj = entityScene.object.GetByName(name);
        if (obj)
            this.AddInspectorDataToObject(entityWithLog, obj, true);

        settingsHandler.FillPresets(entityWithLog, raw, (parentRecord, keyWithPreset, presetName) => {
            parentRecord.__presets ??= {};
            parentRecord.__presets[keyWithPreset] = presetName;
        });

        return entityWithLog;
    }

    // Attach editor metadata to an entity tree that BuildEntityEditorPayload already expanded.
    // `entity` is the authored record used for provenance; `extendedEntity` supplies display values.
    BuildEntityEditorData(entity: Entity, extendedEntity: Entity, entityName: string, processedEntity: Entity, settingsDataRaw: SettingsData, settingsDataProcessed: SettingsData): Entity
    {
        var defaultFieldsToIgnore: string[] = [];
        const isBase = SettingsHandler.FindEntity(settingsDataRaw, entityName) === entity
            && SettingsHandler.IsBaseEntity(settingsDataRaw, entityName);
        var defaultBaseEntity = isBase ? "ANY" : "ANY_ENTITY";

        if (!extendedEntity.entity)
        {
            extendedEntity.entity = defaultBaseEntity;
            defaultFieldsToIgnore.push("entity");
        }
        
        defaultFieldsToIgnore.push("entityUID");
        defaultFieldsToIgnore.push("interactableInEditor");

        var resolvedChildren = this.ResolveRawEntityChildren(entity, settingsDataRaw, defaultBaseEntity);
        var entityWithLog = this.BuildExtendDataLog(entity, extendedEntity, entityName, processedEntity, settingsDataRaw, settingsDataProcessed);

        if (!isBase && entityWithLog.entity == "ANY_ENTITY")
        {
            var defaultBaseClass = SettingsHandler.FindEntity(defaultSettingsData, "ANY_ENTITY")!.baseClass;
            if (entityWithLog.baseClass == defaultBaseClass)
                defaultFieldsToIgnore.push("baseClass");
        }

        entityWithLog["__defaultFieldsToIgnore__"] = defaultFieldsToIgnore;
        entityWithLog.name ??= entityName;

        if (entityWithLog.children)
        {
            var entityOptions: Array<{ value: string, label: string, source?: string }> = [];
            var optionSourceName = entity.entity || defaultBaseEntity;
            var optionSource = this.GetCurrentScene().settingsHandler.GetRawEntity(optionSourceName, settingsDataRaw);
            var processedOptionSource = this.GetCurrentScene().settingsHandler.GetProcessedEnity(optionSourceName, settingsDataProcessed);
            var optionValues = new Set<string>();
            var optionSourceChildren: Entity[] = optionSource?.children ?? [];
            for (var sourceChildIndex = 0; sourceChildIndex < optionSourceChildren.length; sourceChildIndex++)
            {
                var sourceChild = optionSourceChildren[sourceChildIndex];
                var processedSourceChild = processedOptionSource?.children?.[sourceChildIndex];
                var sourceChildUID = sourceChild.entityUID || processedSourceChild?.entityUID;
                if (!sourceChildUID || optionValues.has(sourceChildUID))
                    continue;

                optionValues.add(sourceChildUID);
                entityOptions.push({
                    value: sourceChildUID,
                    label: sourceChild.name || processedSourceChild?.name || sourceChildUID,
                    source: optionSourceName,
                });
            }

            for (var i = 0; i < entityWithLog.children.length; i++)
            {
                var extendedChild = entityWithLog.children[i];
                var processedChild = processedEntity?.children?.[i] || extendedChild;
                var resolvedChild = resolvedChildren[i];
                var authoredChild = resolvedChild?.entity || extendedChild;

                if (resolvedChild?.inherited)
                {
                    var sourceEntityUID = resolvedChild.entity.entityUID
                        || extendedChild.entity
                        || processedChild.entityUID;
                    if (sourceEntityUID)
                        authoredChild = { entity: sourceEntityUID };
                }

                var childName = extendedChild.name || processedChild.name || authoredChild.entity || "GameObject";
                entityWithLog.children[i] = this.BuildEntityEditorData(authoredChild, extendedChild, childName, processedChild, settingsDataRaw, settingsDataProcessed);
                entityWithLog.children[i].__entityOptions = entityOptions;
            }
        }

        return entityWithLog;
    }

    // onlyFieldsInData: only enrich @InspectorField info for fields that are actually present in `data`
    // (used by the entity/gotoEntity path, whose data only carries the entity's own keys).
    AddInspectorDataToObject(data: any, o: GameObject, onlyFieldsInData: boolean = false, includeSaveFields: boolean = true): void
    {
        // ADD DATA FOR @InspectorButton AND @InspectorField DECORATORS ON THE OBJECT ITSELF
        var objButtons = getButtons(o.constructor as any);
        if (objButtons.length > 0)
            data.__buttons = objButtons.map(b => ({ label: b.label, method: b.methodKey, order: b.order, source: b.source }));

        var objFields = getInspectorFields(o, includeSaveFields);
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
                var isString = (typeof compData === 'string');
                if (!compData || isString)
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
                    var fields = getInspectorFields(comp, includeSaveFields);
                    if (fields.length > 0)
                    {
                        (compData as any).__fields = fields;

                        // REMOVE COMP FIELD THAT ARE NOT TAGGED WITH @InspectorField
                        const fieldNames = new Set(fields.map(field => field.name));
                        for (const propName of Object.keys(compData))
                        {
                            if (!propName.startsWith("__") && !fieldNames.has(propName))
                                delete compData[propName];
                        }
                    }
                }
            }
        }

        if (data.children)
        {
            for (var i = 0; i < data.children.length; i++)
            {
                var child = o.children[i];
                if (child)
                    this.AddInspectorDataToObject(data.children[i], child, onlyFieldsInData, includeSaveFields);
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

    GetSettingsDataHandler(settingsDataName: string = this.currentSettingsDataName): SettingsHandler
    {
        return this.settingsDataHandlers.get(settingsDataName) ?? bare.scene.GetMainScene().settingsHandler;
    }
    
    async LoadSettingsDataJSONs(): Promise<string[]>
    {
        // Keep handler identity stable while an EntityScene is editing it. Recreating handlers
        // here makes the scene write to the old instance while gotoEntity reads a fresh copy from
        // disk, causing edited values to snap back in the plugin.
        const mainScene = bare.scene.GetMainScene();
        if (mainScene?.settingsHandler)
        {
            const mainName = mainScene.settingsHandler.GetRaw()?.name ?? "";
            this.settingsDataHandlers.set(mainName, mainScene.settingsHandler);
        }

        const files = await Helper.GetFilesInFolder(`${bare.dataPath}/`, false);
        for (const file of files.filter(file => /\.json$/i.test(file)))
        {
            const fileName = file.split(/[\\/]/).pop() ?? file;
            const isDefault = fileName.toLowerCase() === "settingsdata.json";

            try
            {
                const raw = await Helper.loadJSON<SettingsData>(`${bare.dataPath}/${file}`);
                const name = raw?.name ?? "";

                if (!isDefault && !name)
                    continue;

                if (!this.settingsDataHandlers.has(name))
                {
                    const handler = new SettingsHandler(bare.scene.GetMainScene());
                    await handler.Process(raw);
                    this.settingsDataHandlers.set(name, handler);
                }
            }
            catch (error)
            {
                console.warn(`Could not load settings data file '${file}'.`, error);
            }
        }

        return Array.from(this.settingsDataHandlers.keys());
    }

    async SaveSettingsData(newData: SettingsData): Promise<void>
    {
        if (newData.processed)
        {
            throw new Error('Cannot save processed data. Something went really wrong!');
        }

        //var scene = plugin.GetCurrentScene();
        const scene = bare.scene.GetMainScene();

        // REMOVE EMPTY UID-BASED CHILD OVERRIDES AND THEIR NOW-UNUSED SOURCE UIDS
        //plugin.CleanUpSettingsDataUIDs(newData);

        const settingsHandler = this.GetSettingsDataHandler(newData.name ?? "");
        
        const dataToSave = Helper.DeepCopy(newData);
        settingsHandler.CleanSettingsDataEntityUIDs(dataToSave);

        settingsHandler.FilterSettingsDataDefaults(dataToSave);

        plugin.doNotifyAfterSave = false;

        if (scene instanceof EditorScene)
        {
            await (plugin.GetCurrentScene() as EditorScene).SaveEntityData(dataToSave);
        }
        else
        {
            await fetch('/api/save-entity-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: bare.dataPath,
                    settingsData: dataToSave,
                    skipReload: true
                })
            });

        }

        // Update only the handler for the file that was saved. Assigning named settings data to
        // the main scene's handler makes the default dropdown entry resolve to that named file.
        // Keep the live handler on the unfiltered data. dataToSave has defaults stripped
        // for persistence, so assigning it here would make raw.baseEntities lose
        // ANY, ANY_ENTITY, and NONE after every save.
        settingsHandler.SetRaw(newData);
        await settingsHandler.Process(newData);

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

    // TOGGLE A VALUE IN entity.propertiesRemoved / entity.componentsRemoved, RE-PROCESS AND SAVE.
    // USED BY THE PLUGIN'S X/REVERT BUTTONS ON INHERITED FIELDS/COMPONENTS.
    async ToggleEntityRemovedArray(arrayKey: "propertiesRemoved" | "componentsRemoved", value: string, removed: boolean, childPath: number[]): Promise<Entity>
    {
        var entityScene = plugin.GetCurrentScene() as EntityScene;
        var rawSettingsData = entityScene.settingsHandler.GetRaw();

        if (!SettingsHandler.FindEntity(rawSettingsData, "ANY"))
            rawSettingsData.baseEntities.push({ name: "ANY" });
        if (!SettingsHandler.FindEntity(rawSettingsData, "ANY_ENTITY"))
            rawSettingsData.baseEntities.push({ name: "ANY_ENTITY" });

        var processedSettingsData = entityScene.settingsHandler.Get();

        var entity = plugin.ResolveWritableEntityPath(
            SettingsHandler.FindEntity(rawSettingsData, entityScene.objectName)!,
            childPath,
            rawSettingsData,
            SettingsHandler.IsBaseEntity(rawSettingsData, entityScene.objectName) ? "ANY" : "ANY_ENTITY",
            SettingsHandler.FindEntity(processedSettingsData, entityScene.objectName)!
        );

        var list = Array.isArray(entity[arrayKey]) ? entity[arrayKey] : [];
        if (removed)
        {
            if (!list.includes(value))
                list = [...list, value];
        }
        else
        {
            list = list.filter(v => v !== value);
        }

        if (list.length > 0)
            entity[arrayKey] = list;
        else
            delete entity[arrayKey];

        await entityScene.settingsHandler.Process();

        var entityData = await window.__GAME_DEBUG_API__.gotoEntity(entityScene.objectName, undefined, childPath);

        await plugin.SaveSettingsData(rawSettingsData);

        return entityData;
    }

    GetCurrentEntity(): Entity
    {
        var scene = (plugin.GetCurrentScene() as EntityScene);
        var name = scene.objectName;
        var raw = scene.settingsHandler.GetRaw();
        var entity = SettingsHandler.FindEntity(raw, name)!;

        return entity;
    }

    GetCurrentEntityProcessed(): Entity
    {
        var scene = (plugin.GetCurrentScene() as EntityScene);
        var name = scene.objectName;
        var processed = scene.settingsHandler.Get();
        var entity = SettingsHandler.FindEntity(processed, name)!;

        return entity;
    }

    // MAP A PATH FROM THE EXTENDED CHILD TREE BACK TO THE RAW RECORD CURRENTLY VISIBLE AT
    // THAT PATH. Missing inherited children resolve to their source without modifying raw data;
    // existing UID overrides resolve to the authored override record.
    ResolveRawEntityPath(entity: Entity, childPath: Array<number | string>, rawSettingsData: SettingsData, defaultBaseEntity?: string): Entity
    {
        var currentEntity = entity;
        var currentDefaultBaseEntity = defaultBaseEntity;

        for (const childPathEntry of childPath)
        {
            const childIndex = Number(childPathEntry);
            if (!Number.isInteger(childIndex) || childIndex < 0)
                throw new Error(`Invalid entity child index '${childPathEntry}'`);

            const resolvedChild = this.ResolveRawEntityChildren(
                currentEntity,
                rawSettingsData,
                currentDefaultBaseEntity
            )[childIndex];
            if (!resolvedChild)
                throw new Error(`Could not resolve entity child at index '${childIndex}'`);

            currentEntity = resolvedChild.entity;
            currentDefaultBaseEntity = "ANY_ENTITY";
        }

        return currentEntity;
    }

    // BUILD THE RAW CHILD LIST IN THE SAME ORDER AS MergeChildren(). Entries authored on
    // the current entity suppress inherited source children when they reference that child's UID.
    private ResolveRawEntityChildren(entity: Entity, rawSettingsData: SettingsData, defaultBaseEntity?: string): Array<{ entity: Entity, inherited: boolean }>
    {
        var scene = (plugin.GetCurrentScene() as EntityScene);

        var resolvedChildren = (entity.children ?? []).map(child => ({ entity: child, inherited: false }));
        var baseEntityName = entity.entity || defaultBaseEntity;
        var visitedBaseEntities = new Set<string>();

        while (baseEntityName)
        {
            if (visitedBaseEntities.has(baseEntityName))
                throw new Error(`Circular entity inheritance while resolving children for '${entity.name}'`);
            visitedBaseEntities.add(baseEntityName);

            const baseEntity = scene.settingsHandler.GetRawEntity(baseEntityName, rawSettingsData, entity.children ?? []);
            if (!baseEntity)
                throw new Error(`Could not find base entity '${baseEntityName}' while resolving child path`);

            const resolvedChildrenByEntity = new Map(
                resolvedChildren.map(resolvedChild => [resolvedChild.entity, resolvedChild])
            );
            resolvedChildren = scene.MergeChildren(
                baseEntity.children,
                resolvedChildren.map(resolvedChild => resolvedChild.entity)
            ).map(resolvedEntity =>
                resolvedChildrenByEntity.get(resolvedEntity)
                ?? { entity: resolvedEntity, inherited: true }
            );
            baseEntityName = baseEntity.entity;
        }

        return resolvedChildren;
    }

    // Resolve an editor child path against the live GameObject tree. The displayed entity tree and
    // runtime child array can differ after an inherited source child is replaced by a UID override,
    // so prefer stable UID identity and use the displayed index only as a fallback.
    ResolveRuntimeEntityPath(rootObject: GameObject | null, entity: Entity, processedEntity: Entity, childPath: Array<number | string>, rawSettingsData: SettingsData, defaultBaseEntity?: string): GameObject | null
    {
        var currentObject = rootObject;
        var currentEntity = entity;
        var currentProcessedEntity = processedEntity;
        var currentDefaultBaseEntity = defaultBaseEntity;

        for (const childPathEntry of childPath)
        {
            const childIndex = Number(childPathEntry);
            if (!currentObject || !Number.isInteger(childIndex) || childIndex < 0)
                return null;

            const resolvedChild = this.ResolveRawEntityChildren(
                currentEntity,
                rawSettingsData,
                currentDefaultBaseEntity
            )[childIndex];
            if (!resolvedChild)
                return null;

            const processedChild = currentProcessedEntity?.children?.[childIndex];
            const entityLink = resolvedChild.entity.entity;
            const linkIsUID = !!entityLink
                && !SettingsHandler.FindEntity(rawSettingsData, entityLink)
                && !SettingsHandler.FindEntity(defaultSettingsData, entityLink);
            const sourceEntityUID = resolvedChild.entity.entityUID
                || (linkIsUID ? entityLink : undefined)
                || processedChild?.entityUID;
            const runtimeChildren = currentObject.children.filter(child => child.save);
            const runtimeChild = sourceEntityUID
                ? runtimeChildren.find(child =>
                    child.entity?.entityUID == sourceEntityUID
                    || child.entity?.entity == sourceEntityUID
                ) ?? runtimeChildren[childIndex]
                : runtimeChildren[childIndex];

            if (!runtimeChild)
                return null;

            currentObject = runtimeChild;
            currentEntity = resolvedChild.entity;
            currentProcessedEntity = processedChild;
            currentDefaultBaseEntity = "ANY_ENTITY";
        }

        return currentObject;
    }

    // RESOLVE A DISPLAYED CHILD PATH TO AN AUTHORED RAW RECORD THAT IS SAFE TO MUTATE.
    // When the displayed child only exists in an inherited source, materialize a lightweight
    // `{ entity: source.entityUID }` override on the current raw parent and continue through it.
    ResolveWritableEntityPath(entity: Entity, childPath: Array<number | string>, rawSettingsData: SettingsData, defaultBaseEntity?: string, processedEntity?: Entity): Entity
    {
        var currentEntity = entity;
        var currentDefaultBaseEntity = defaultBaseEntity;
        var currentProcessedEntity = processedEntity;

        for (const childPathEntry of childPath)
        {
            const childIndex = Number(childPathEntry);
            if (!Number.isInteger(childIndex) || childIndex < 0)
                throw new Error(`Invalid entity child index '${childPathEntry}'`);

            const resolvedChild = this.ResolveRawEntityChildren(
                currentEntity,
                rawSettingsData,
                currentDefaultBaseEntity
            )[childIndex];
            if (!resolvedChild)
                throw new Error(`Could not resolve entity child at index '${childIndex}'`);

            // The generated source UID lives on the processed child, while the raw source child
            // remains free of processing-only metadata. Both trees use MergeChildren() ordering.
            const processedChild = currentProcessedEntity?.children?.[childIndex];

            if (resolvedChild.inherited)
            {
                const sourceEntityUID = resolvedChild.entity.entityUID || processedChild?.entityUID;
                if (!sourceEntityUID)
                    throw new Error(`Cannot override inherited entity child at index '${childIndex}' because it has no entityUID`);

                // Persist the source identity when it is first used by an authored override. This
                // lets the UID link resolve before construction on subsequent Process() calls.
                resolvedChild.entity.entityUID ??= sourceEntityUID;

                const entityOverride: Entity = { entity: sourceEntityUID };
                currentEntity.children ??= [];
                currentEntity.children.push(entityOverride);
                currentEntity = entityOverride;
            }
            else
            {
                currentEntity = resolvedChild.entity;
            }

            currentDefaultBaseEntity = "ANY_ENTITY";
            currentProcessedEntity = processedChild;
        }

        return currentEntity;
    }
    
    CleanUpSettingsDataUIDs(rawSettingsData: SettingsData): void
    {
        const entityScene = this.GetCurrentScene() as EntityScene;
        const rawEntitiesMappedByUID = entityScene.settingsHandler.GetRawEntitiesMappedByUID();
        const rootEntities = [
            ...(rawSettingsData.baseEntities ?? []),
            ...(rawSettingsData.entities ?? [])
        ];

        const cleanChildren = (entity: Entity): void =>
        {
            if (!Array.isArray(entity.children))
                return;

            for (const child of entity.children)
                cleanChildren(child);

            entity.children = entity.children.filter((child: Entity) =>
            {
                const isUIDReference = typeof child.entity === "string"
                    && rawEntitiesMappedByUID[child.entity] !== undefined;

                return !isUIDReference || Object.keys(child).length > 1;
            });

            if (entity.children.length === 0)
                delete entity.children;
        };

        for (const entity of rootEntities)
            cleanChildren(entity);

        const referencedUIDs = new Set<string>();
        const findReferencedUIDs = (entity: Entity): void =>
        {
            if (typeof entity.entity === "string" && rawEntitiesMappedByUID[entity.entity])
                referencedUIDs.add(entity.entity);

            if (Array.isArray(entity.children))
            {
                for (const child of entity.children)
                    findReferencedUIDs(child);
            }
        };

        for (const entity of rootEntities)
            findReferencedUIDs(entity);

        for (const [entityUID, entity] of Object.entries(rawEntitiesMappedByUID))
        {
            if (!referencedUIDs.has(entityUID))
                delete entity.entityUID;
        }
    }
}

export var plugin:PluginHandler;
