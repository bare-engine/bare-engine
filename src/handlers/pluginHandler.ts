import { SaveDataHandler } from "./SaveDataHandler";
import { BareEvent, BareEventPayload, LevelData, SaveData, SettingsData } from "../types/bareTypes";
import { Helper } from "../utils/helper";
import { Color, Vec2 } from "../libraries/rapid-render";
import { GameObject } from "../objects/gameObject";
import {  GameMode, globalEvents } from "../main";
import { OutlineShader } from "../shaders/outlineShader";
import { BareClasses, componentController, levelHandler, ObjectController, Scene, sceneController } from "../exports";
import { EditorScene } from "../scenes/editorScene";
import { objectController } from "../controllers/objectController";
import { HitboxScene } from "../scenes/hitboxScene";
import { serialize } from "node:v8";
import { keyboardController } from "../controllers/keyboardController";

// THIS PLUGIN CODE DOES NOT GET INCLUDED IN PRODUCTION
// ALL CALLS SHOULD BE WRAPPED WITH __DEV__

// THIS HACK IS NEEDED SO THAT AT INIT, WE DON'T DIRECTLY IMPORT THESE CONTROLLERS LEADING TO THEM NOT FINDING EVENTS
const getMouseController = () =>
  (require("../controllers/mouseController") as typeof import("../controllers/mouseController")).mouseController;

declare global {
  interface Window {
    __GAME_DEBUG_API__?: any;
  }
}

window.__GAME_DEBUG_API__ = {
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
    sceneController.GetLevelScene().LoadLevel(levelPath);
  },

  async gotoLevelEdit(levelPath: string) {
    //sceneController.DisableAllScenes();
    
    sceneController.Add(EditorScene, {levelPathOrData: bareEngine.levelPath + "/" + levelPath + ".json"});
    //sceneController.Goto(EditorScene, {levelInput: levelPath});
  },

  async gotoEntity(name: string) {
    /*const levelController = getLevelController();
    if (levelController && levelController.currentLevel && levelController.currentLevel.name == name)
    {
        return;
    }*/

    sceneController.Add(HitboxScene, {name: name, settingsHandler: plugin.GetCurrentScene().settingsHandler});
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

  getAllSenes() {
    var scenes = sceneController.GetAllScenes();
    var sceneStrings = scenes.map(s => s.constructor.name);

    // DON'T SHOW EditorUIScene WHEN THERE'S NO LEVEL
    // ACTUALLY, DON'T HAVE A EditorUIScene WHEN THERE'S NO LEVEL - TODO
    for (var i = 0; i < sceneStrings.length; i++)
    {
        if (sceneStrings[i] == "EditorUIScene")
        if (!sceneController.GetLevelScene())
        {
            sceneStrings.splice(i, 1);
            break;
        }
    }

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

  GetLevelFiles() {
    return Helper.GetFilesInFolder(`${bareEngine.levelPath}/`, true);
  },

  async GetLevelData(levelStr: string): Promise<LevelData> {
     return await Helper.loadJSON<LevelData>(`${bareEngine.levelPath}/${levelStr}.json`);
  },

  getObject(id: string) {
    const o = plugin.GetCurrentScene().objectController.GetObjectById(id);
    if (!o) return null;

    var serializeChildren = (children: GameObject[]) => {
        return children.map(c => serializeGameObject(c));
    }

    var serializeGameObject = (o: GameObject) => {
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
            pivotBasedOnHitbox: {x: o.pivotBasedOnHitbox.x, y: o.pivotBasedOnHitbox.y},
            startPosition: {x: o.startPosition.x, y: o.startPosition.y},
            flipX: o.flipped,
            
            visible: o.visible,
            persistent: o.persistent,
            save: o.save,
            tags: JSON.stringify(o.tags),
            color: o.color.toHex(),
            alpha: o.alpha,

            customData: JSON.stringify(o.customData),

            children: serializeChildren(o.children),
        };

        if (window.gameMode == GameMode.Game)
        {
            let components = o.scene.levelHandler.SerializeComponents(o.scene.componentController.GetComponentsFrom(o));
            data.components = components;
        }
        else
        if (window.gameMode == GameMode.Editor)
        {
            let components = o.scene.ConstructEntity(o.levelEntity).components;

            // HERE I HAVE TO MANUALLY INSTANTIATE A COMPONENT, TO GET THE DEFAULT CONSTRUCTOR VALUES
            for (var comp in components)
            {
                var compRef = bareEngine.componentClasses[Helper.CapitalizeFirstLetter(comp) + "Component"];
                let componentsBase = o.scene.levelHandler.SerializeComponent(new compRef()); // INSTANTIATING NEW COMPONENT, JUST TO GET DEFAULT CONSTRUCTOR VALUES. NOT THAT GREAT - TODO?
                
                for (var key in componentsBase)
                {
                    if (!components[comp][key])
                    {
                        components[comp][key] = componentsBase[key];
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

    return serializeGameObject(o);
  },

    setObject(id: string, props: any) {
        const o = plugin.GetCurrentScene().objectController.GetObjectById(id);
        if (!o) return false;

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

        if (props.pivot !== undefined) { o.pivot.x = props.pivot.x; o.pivot.y = props.pivot.y; }
        if (props.pivotBasedOnHitbox !== undefined) { o.pivotBasedOnHitbox.x = props.pivotBasedOnHitbox.x; o.pivotBasedOnHitbox.y = props.pivotBasedOnHitbox.y; }
        if (props.startPosition !== undefined) { o.startPosition.x = props.startPosition.x; o.startPosition.y = props.startPosition.y; }

        if (props.flipX !== undefined) o.flipped = props.flipX;
        if (props.visible !== undefined) o.visible = props.visible;
        if (props.persistent !== undefined) o.persistent = props.persistent;
        if (props.save !== undefined) o.save = props.save;
        if (props.tags !== undefined) o.tags = JSON.parse(props.tags);
        if (props.color !== undefined) o.color = Color.fromHex(props.color);
        if (props.alpha !== undefined) o.alpha = props.alpha;
        if (props.customData !== undefined) o.customData = JSON.parse(props.customData);

        if (props.components !== undefined)
        {
            // ADDED A COMPONENT

            if (window.gameMode == GameMode.Game)
            {
                for (let compName in props.components)
                {
                    var compClass = bareEngine.componentClasses[Helper.CapitalizeFirstLetter(compName) + "Component"];
                    var comp = o.scene.componentController.GetComponent(o, compClass);

                    if (comp)
                    {
                        // WE APPLY THE COMPONENTS VALUES FROM THE PLUGIN TO THE ONES INGAME
                        // BUT ALSO CALL OnRemoved() AND Added() AROUND IT, TO RESET THE COMPONENT AND LET THE NEW VALUES BE REPROCESSED IN Added()/OnAdded()
                        comp?.OnRemoved();
                        var compData:Record<string, (string | number | boolean)> = props.components[compName];
                        for (let compProp in compData)
                        {
                            comp[compProp] = compData[compProp];
                        }
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
            else
            if (window.gameMode == GameMode.Editor)
            {
                // THIS FINDS THE EXTENDED COMPONENT VALUES FROM levelEntity (ONES DERIVED FROM entityData (entities+entityBases))
                // THEN FINDS THE DIFFERENCE BETWEEN THOSE AND THE VALUES FROM THE PLUGIN
                // SAVES THAT TO THE LEVEL ENTITY COMPONENTS - AS TO NOT SUPPLY ANY DUPLICATE DATA
                //var entityExtended = {name: o.levelEntity.name, componentsRemoved: o.levelEntity.componentsRemoved}; // ADDING componentsRemoved TO NOT INCLUDE THOSE FROM EXTENDED COMPONENTS, ELSE YOU COULD NEVER REMOVE EXTENDED COMPONENTS
                var componentsExtended = o.scene.ConstructEntity(o.levelEntity.name).components;
                var changedComponents:any = {};
                for (var compName in props.components) {
                    if (componentsExtended[compName]) {
                        var diff:any = {};
                        for (var key in props.components[compName]) {
                            if (props.components[compName][key] !== componentsExtended[compName][key]) {
                                diff[key] = props.components[compName][key];
                            }
                        }
                        if (Object.keys(diff).length > 0) changedComponents[compName] = diff;
                    } else {
                        changedComponents[compName] = props.components[compName];
                    }
                }
                o.levelEntity.components = changedComponents;

                // IF COMPONENT WAS ADDED THAT WAS EARLIER REMOVED FROM levelEntity (IN componentsRemoved), CLEAR IT
                // NOW IT GETS EXTENDED AGAIN 
                if (o.levelEntity.componentsRemoved)
                {
                    var compKeys = Object.keys(props.components);
                    for (var i = o.levelEntity.componentsRemoved.length - 1; i >= 0; i--)
                    {
                        var compName = o.levelEntity.componentsRemoved[i];
                        if (compKeys.includes(compName))
                        {
                            o.levelEntity.componentsRemoved.splice(i, 1);
                            break;
                        }
                    }
                }

                // DON'T WANT TO SEND ALONG ANY EMPTY OBJECTS
                if (Object.keys(o.levelEntity.components).length == 0)
                    delete o.levelEntity.components;

                if (o.levelEntity.componentsRemoved && o.levelEntity.componentsRemoved.length == 0)
                    delete o.levelEntity.componentsRemoved;
            }
        }

        return true;
    },

    removeObject(id: string) {
        const o = plugin.GetCurrentScene().objectController.GetObjectById(id);
        if (!o) return false;

        o.Remove();
    },

    removeComponent(id: string, comp: string) {
        const o = plugin.GetCurrentScene().objectController.GetObjectById(id);
        if (!o) return false;

        var compRef = bareEngine.componentClasses[Helper.CapitalizeFirstLetter(comp) + "Component"];

        if (window.gameMode == GameMode.Editor)
        {
            if (!o.levelEntity.components || !o.levelEntity.components[comp])
            {
                // THIS COMPONENT IS NOT IN levelEntity, SO IT HAS TO BE EXTENDED
                // THAT'S WHY WE ADD IT TO componentsRemoved, SO IT CAN BE TAKEN INTO ACCOUNT IN getObject()
                if (!o.levelEntity.componentsRemoved)
                    o.levelEntity.componentsRemoved = [];

                o.levelEntity.componentsRemoved.push(comp);
                
                return;
            }

            delete o.levelEntity.components[comp]; // COMPONENTS ARE JUST ADDED AS DATA IN EDITOR
        }
        else
        if (window.gameMode == GameMode.Game)
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
    // Return a clone so external tools don't accidentally mutate live data (?) TODO
    return plugin.GetCurrentScene().settingsHandler.SnapshotCurrent();
  },

  async setEntityData(newData: SettingsData, notifyPlugin: boolean = true)
  {
    plugin.doNotifyAfterSave = false;
    await plugin.GetCurrentScene().SaveEntityData(newData);
    plugin.doNotifyAfterSave = true;

    if (bareEngine.levelEditorOpen)
    {
      await plugin.GetCurrentScene().Restart();//
    }
    else
    {
      await plugin.GetCurrentScene().Restart();
    }
  },

  notifyEntityDataChanged(newData) {
    //window.postMessage({ __fromGame: true, type: "entityDataChanged" }, "*");
    if (plugin.doNotifyAfterSave)
      window.postMessage({ __fromGame: true, type: "entityData", data: newData }, "*");
  },

  refreshLevelFiles() {
    window.postMessage({ __fromGame: true, type: "refreshLevelFiles" }, "*");
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
        return { ok: res.ok, saved: res.ok, response: json };
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
        window.postMessage({ __fromGame: true, type: "selectLevel", levelName: levelName }, "*");
    },

    clickedOpenEditorInPlugin() {
        if (SaveData.currentLevelStr === '')
        {
            console.warn('[Bare Engine] No level loaded, cannot open editor');
            return;
        }

        sceneController.Add(EditorScene);
    },
};

export class PluginHandler
{
    public outlineShader;
    
    debugActions: Array<{label?: string, callback?: () => void}> = [];
    movingObj: GameObject;
    movingObjData: { obj: GameObject; offset: Vec2; hasMovedAwayEnough: boolean };
    doNotifyAfterSave: boolean = true;
    currentSceneClassString: string = "";

    constructor()
    {
        globalEvents.persistent.once(BareEvent.game_started, () => {
            this.outlineShader = new OutlineShader()
            //this.AddClass(BareClasses.EditorController)

            // RIGHT CLICK FOR PLUGIN SELECT
            document.addEventListener('pointerdown', this.OnRightClickPointerDown, false);
            
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
        });

        globalEvents.persistent.on(BareEvent.editor_opened, ({ settingsDataName, levelName }) => {
            window.__GAME_DEBUG_API__.selectLevel(levelName);
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

                var openObjectsTab = plugin.GetCurrentScene().settingsData.selectionEnabled !== false;
                window.__GAME_DEBUG_API__.selectObjectInPlugin(obj.uniqueID, openObjectsTab, parentIds);

              var mouseController2 = this.GetCurrentScene().mouseController; // WITHOUT THE 2, DEV WEBPACK CATCHES THIS - TODO

              this.movingObjData = {
                  obj,
                  offset: obj.position.subtract(mouseController2.world.position),
                  hasMovedAwayEnough: false
              };

              const pointerMoveBound = this.PointerMove.bind(this);
              globalEvents.on(BareEvent.pointer_move, pointerMoveBound);
              globalEvents.once(BareEvent.pointer_up, () => globalEvents.off(BareEvent.pointer_move, pointerMoveBound));
          }
      }

      ev.preventDefault();
      return false;
  };
    
    private PointerMove({ mouseX, mouseY, event }: BareEventPayload['pointer_move']): void
    {
        if (!this.movingObjData.hasMovedAwayEnough)
        {
            var mouseController2 = this.GetCurrentScene().mouseController;
            var dist = Helper.Distance(mouseController2.screen.position, mouseController2.screen.positionOnDown);
            if (dist > 10)
            {
                this.movingObjData.hasMovedAwayEnough = true;
                //this.movingObjData.offset = this.movingObjData.obj.position.subtract(mouseController.worldMouse);
            }
            else
            {
                return;
            }
        }

        var data = this.movingObjData;
        var worldPos = this.GetCurrentScene().ScreenToWorldPos(new Vec2(mouseX, mouseY));
        data.obj?.SetPosition(worldPos.x + data.offset.x, worldPos.y + data.offset.y);
    }

    CheckClickGameObject(ev: PointerEvent, outline: boolean = true): GameObject | null
    {
        var objs = this.GetCurrentScene().objectController.GetAllObjects();
        var foundObj:GameObject | null = null;
        for (var i in objs)
        {
            var obj = objs[i];

            if (obj.customName == 'ignoreInPlugin')
                continue;

            if (!obj.visible || !obj.visibleInEditor)
                continue;

            var tl = obj.GetTopLeftPosition();
            var objRect = {x: tl.x, y: tl.y, width: obj.width, height: obj.height};
            var p = new Vec2(ev.clientX, ev.clientY);
            var pWorld = plugin.GetCurrentScene().ScreenToWorldPos(p);

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

        return foundObj;
    }

    CheckClickDeepChild(ev: PointerEvent): GameObject | null
    {
        var objs = this.GetCurrentScene().objectController.GetAllObjects();
        var p = new Vec2(ev.clientX, ev.clientY);
        var pWorld = plugin.GetCurrentScene().ScreenToWorldPos(p);

        for (var i in objs)
        {
            var obj = objs[i];

            if (obj.customName == 'ignoreInPlugin')
                continue;

            if (!obj.visible || !obj.visibleInEditor)
                continue;

            var found = this.FindDeepestChildAtPoint(obj, pWorld);
            if (found)
                return found;
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

        var tl = obj.parent
            ? obj.parent.ToGlobal(obj.GetTopLeftPosition())
            : obj.GetTopLeftPosition();
        var objRect = { x: tl.x, y: tl.y, width: obj.width, height: obj.height };

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
}

export const plugin = new PluginHandler();
globalThis.plugin = plugin;
