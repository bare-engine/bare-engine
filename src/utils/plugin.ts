import { SaveDataHandler } from "./SaveDataHandler";
import { BareEvent, BareEventPayload, LevelData, SaveData, SettingsData } from "./bareTypes";
import { Helper } from "./helper";
import { Vec2 } from "../libraries/rapid-render";
import { GameObject } from "../objects/gameObject";
import { BareGame, events } from "../main";
import { OutlineShader } from "./shaders/outlineShader";
import { BareClasses, editorController, levelController, screenController, tweenController } from "..";
import { create } from "node:domain";
import { EditorScene } from "../scenes/editorScene";

// THIS PLUGIN CODE DOES NOT GET INCLUDED IN PRODUCTION
// ALL CALLS SHOULD BE WRAPPED WITH __DEV__

// THIS HACK IS NEEDED SO THAT AT INIT, WE DON'T DIRECTLY IMPORT THESE CONTROLLERS LEADING TO THEM NOT FINDING EVENTS
const getMouseController = () =>
  (require("../controllers/mouseController") as typeof import("../controllers/mouseController")).mouseController;
const getLevelController = () =>
  (require("../controllers/levelController") as typeof import("../controllers/levelController")).levelController;
const getEditorController = () =>
  (require("../controllers/editorController") as typeof import("../controllers/editorController")).editorController;

declare global {
  interface Window {
    __GAME_DEBUG_API__?: any;
  }
}

window.__GAME_DEBUG_API__ = {
  // called by the panel (via injector) to select in-game
  selectObjectInGame(uid: string) {
    const obj = objectController.GetObjectById(uid);
    if (!obj) return false;

    var outlineShader = plugin.outlineShader;

    // CLEAR OUTLINE SHADERS ON ALL
    var objs = objectController.GetLayers().flat();
    for (var i in objs)
    {
        let obj = objs[i];

        if (obj.customName == 'ignoreInPlugin')
            continue;

        if (!obj.visible || !obj.visibleInEditor)
            continue;

        if (obj.shaders.indexOf(outlineShader) != -1)
        {
            outlineShader.stop(obj);
            obj.shaders.splice(obj.shaders.indexOf(outlineShader), 1);
        }
    }

    // ADD TO SELECTED
    outlineShader.start(obj, [1.0, 1.0, 1.0, 1.0], 8.0);
    obj.shaders.push(outlineShader);

    return true;
  },

  // called by the game to notify the panel
  selectObjectInPlugin(uid: string, openObjectsTab: boolean = false)
  {
    window.postMessage({ __fromGame: true, type: "selectObject", id: uid, openObjectsTab: openObjectsTab }, "*");
  },

  gotoLevelView(levelPath: string) {
    levelController.LoadLevel(levelPath);
  },

  async gotoLevelEdit(levelPath: string) {
    await levelController.LoadLevel(levelPath);
    screenController.Goto(EditorScene);
  },

  async gotoEntity(name: string) {
    const levelController = getLevelController();
    if (levelController && levelController.currentLevel && levelController.currentLevel.name == name)
    {
        return;
    }

    var editorController = getEditorController();
    
    var levelData = await editorController.CreateHitboxDataFor(name, editorController.hitboxData);
    var saveLevelCallback = () => editorController.SaveHitboxDataToSettingsData();
    editorController.Open(levelData, saveLevelCallback, editorController.hitboxDataHandler);
  },

  getDebugActions() {
    return plugin.debugActions;
  },

  getAllObjects() {
    return objectController.GetLayers().flat().filter((o: any) => o.customName != 'ignoreInPlugin').map((o: any) => ({ id: o.uniqueID, name: o.name }));
  },

  GetLevelFiles() {
    return Helper.GetFilesInFolder(`${bare.levelPath}/`, true);
  },

  async GetLevelData(levelStr: string): Promise<LevelData> {
     return await Helper.loadJSON<LevelData>(`${bare.levelPath}/${levelStr}.json`);
  },

  getObject(id: string) {
    const o = objectController.GetObjectById(id);
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
    const o = objectController.GetObjectById(id);
    if (!o) return false;

    if (props.x !== undefined) o.x = props.x;
    if (props.y !== undefined) o.y = props.y;

    if (props.scaleX !== undefined) o.scaleX = props.scaleX;
    if (props.scaleY !== undefined) o.scaleY = props.scaleY;

    if (props.rotation !== undefined) o.rotation = props.rotation;
    if (props.visible !== undefined) o.visible = props.visible;

    return true;
  },

  getEntityData() {
    if (!bare) return null;
    // Return a clone so external tools don't accidentally mutate live data (?) TODO
    return bare.currentSettingsHandler.SnapshotCurrent();
  },

  async setEntityData(newData: SettingsData, notifyPlugin: boolean = true)
  {
    plugin.doNotifyAfterSave = false;
    await bare.SaveEntityData(newData);
    plugin.doNotifyAfterSave = true;

    if (bare.levelEditorOpen)
    {
      var editorController = getEditorController();
      await editorController.Restart();
    }
    else
    {
      await bare.Restart();
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
        return { ok: res.ok, saved: res.ok, response: json };
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
            bare.Restart(); // DON'T HAVE LEVEL TO GO TO, SINCE WE JUST REMOVED IT, SO JUST RESTART GAME
        }
        return { ok: res.ok, saved: res.ok, response: json };
      } catch (error: any) {
        console.error('Failed to remove level', error);
        return { ok: false, error: error?.message ?? String(error) };
      }
  }
};

export class BarePlugin
{
    public outlineShader;
    
    debugActions: Array<{label?: string, callback?: () => void}> = [];
    movingObj: GameObject;
    movingObjData: { obj: GameObject; offset: Vec2; hasMovedAwayEnough: boolean };
    doNotifyAfterSave: boolean = true;

    constructor()
    {
        events.persistent.once(BareEvent.game_started, () => {
            this.outlineShader = new OutlineShader()
            bare.AddClass(BareClasses.EditorController)

            // RIGHT CLICK FOR PLUGIN SELECT
            document.addEventListener('pointerdown', this.OnRightClickPointerDown, false);
        });

        events.persistent.on(BareEvent.game_started, () => {
            window.__GAME_DEBUG_API__.refreshLevelFiles();
        });

        // RESTART
        this.AddDebugAction("Restart Game", () => bare.Restart(true));
        this.AddDebugAction("Restart Level", () => levelController.RestartLevel());
        this.AddDebugAction("Clear Save Data", () => SaveDataHandler.Clear());
        this.AddDebugBreak();

        // DEBUG
        this.AddDebugAction("Toggle Debug Visuals", () => window.debug = !window.debug);
        this.AddDebugBreak();
        this.AddDebugBreak();
    }

    private OnRightClickPointerDown = async (ev: PointerEvent) =>
    {
      if (bare.levelEditorOpen)
          return;

      if (ev.button === 2)
      {
          const obj = this.CheckClickGameObject(ev);
          if (obj)
          {
              this.SelectObjectInPlugin(obj.uniqueID, true);

              this.movingObjData = {
                  obj,
                  offset: obj.position.subtract(getMouseController().world.position),
                  hasMovedAwayEnough: false
              };

              const pointerMoveBound = this.PointerMove.bind(this);
              events.on(BareEvent.pointer_move, pointerMoveBound);
              events.once(BareEvent.pointer_up, () => events.off(BareEvent.pointer_move, pointerMoveBound));
          }
      }

      ev.preventDefault();
      return false;
  };
    
    private PointerMove({ mouseX, mouseY, event }: BareEventPayload['pointer_move']): void
    {
        if (!this.movingObjData.hasMovedAwayEnough)
        {
            var dist = Helper.Distance(getMouseController().screen.position, getMouseController().screen.positionOnRightDown);
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
        var objs = objectController.GetLayers().flat();
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
            var pWorld = bare.ScreenToWorldPos(p);

            if (outline)
            if (obj.shaders.indexOf(this.outlineShader) != -1)
            {
                this.outlineShader.stop(obj);
                obj.shaders.splice(obj.shaders.indexOf(this.outlineShader), 1);
            }

            if (!foundObj)
            if (Helper.IsPointInRectangle(pWorld, objRect))
            {
                var openObjectsTab = bare.currentSettings.selectionEnabled !== false;
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
}

export const plugin = new BarePlugin();
globalThis.plugin = plugin;