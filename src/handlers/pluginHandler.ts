import { SaveDataHandler } from "./SaveDataHandler";
import { BareEvent, BareEventPayload, LevelData, SaveData, SettingsData } from "../types/bareTypes";
import { Helper } from "../utils/helper";
import { Vec2 } from "../libraries/rapid-render";
import { GameObject } from "../objects/gameObject";
import {  globalEvents } from "../main";
import { OutlineShader } from "../shaders/outlineShader";
import { BareClasses, ObjectController, Scene, sceneController } from "../exports";
import { EditorScene } from "../scenes/editorScene";
import { objectController } from "../controllers/objectController";
import { HitboxScene } from "../scenes/hitboxScene";

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

window.__GAME_DEBUG_API__ = {// called by the panel (via injector) to select in-game
  selectObjectInGame(uid: string)
  {
      const outlineShader = plugin.outlineShader;

      var objs = sceneController.GetAllSceneObjects();
      let selected: any = objs.find(o => o.uniqueID === uid) ?? null;

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

  // called by the game to notify the panel
  selectObjectInPlugin(uid: string, openObjectsTab: boolean = false)
  {
    window.postMessage({ __fromGame: true, type: "selectObject", id: uid, openObjectsTab: openObjectsTab }, "*");
  },

  gotoLevelView(levelPath: string) {
    //levelController.LoadLevel(levelPath);
  },

  async gotoLevelEdit(levelPath: string) {
    sceneController.Goto(EditorScene, {levelInput: levelPath});
  },

  async gotoEntity(name: string) {
    /*const levelController = getLevelController();
    if (levelController && levelController.currentLevel && levelController.currentLevel.name == name)
    {
        return;
    }*/

    sceneController.Add(HitboxScene, {name: name});
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
    for (var i = 0; i < sceneStrings.length; i++)
    {
        if (sceneStrings[i] == "EditorUIScene")
        if (!sceneController.GetLevelScene())
        {
            sceneStrings.splice(i, 1);
            break;
        }
    }

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
                    name: o.pluginName ? o.pluginName : o.name
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

    return {
      id: o.uniqueID,
      name: o.name,
      x: o.x,
      y: o.y,
      scaleX: o.scaleX ?? 1,
      scaleY: o.scaleY ?? 1,
      rotation: o.rotation ?? 0,
      visible: o.visible ?? true,
    };
  },

  setObject(id: string, props: any) {
    const o = plugin.GetCurrentScene().objectController.GetObjectById(id);
    if (!o) return false;

    if (props.x !== undefined) o.x = props.x;
    if (props.y !== undefined) o.y = props.y;

    if (props.scaleX !== undefined) o.scaleX = props.scaleX;
    if (props.scaleY !== undefined) o.scaleY = props.scaleY;

    if (props.rotation !== undefined) o.rotation = props.rotation;
    if (props.visible !== undefined) o.visible = props.visible;

    return true;  
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
      await sceneController.Get(EditorScene).Restart();
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
  }
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

        globalEvents.persistent.on(BareEvent.scene_changed, () => {
            window.__GAME_DEBUG_API__.refreshScenes();
        });

        // RESTART
        this.AddDebugAction("Restart Game", () => bareEngine.Restart(true));
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
          const obj = this.CheckClickGameObject(ev);
          if (obj)
          {
              this.SelectObjectInPlugin(obj.uniqueID, true);

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
        data.obj?.SetPosition(mouseX + data.offset.x, mouseY + data.offset.y);
    }

    CheckClickGameObject(ev: PointerEvent, outline: boolean = true): GameObject | null
    {
        var objs = sceneController.GetAllSceneObjects();
        var foundObj:GameObject | null = null;
        for (var i in objs)
        {
            var obj = objs[i];

            if (obj.customName == 'ignoreInPlugin')
                continue;

            if (!obj.visible || !obj.visibleInEditor)
                continue;

            var tl = obj.GetLeftTopPosition();
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
                var openObjectsTab = plugin.GetCurrentScene().settingsData.selectionEnabled !== false;
                window.__GAME_DEBUG_API__.selectObjectInGame(obj.uniqueID, openObjectsTab);

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

    SelectObjectInPlugin(uid: string, openObjectsTab: boolean = false)
    {
        window.__GAME_DEBUG_API__.selectObjectInPlugin(uid, openObjectsTab);
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

        const fallback = sceneController.GetLevelScene() ?? sceneController.GetAllScenes()[0] ?? null;
        if (!fallback)
            throw new Error("PluginHandler.GetScene: no active scenes to resolve.");

        console.warn(`PluginHandler.GetScene: could not resolve '${sceneClassString}', falling back to '${fallback.constructor?.name ?? "unknown"}'.`);
        return fallback;
    }
}

export const plugin = new PluginHandler();
globalThis.plugin = plugin;
