import { assetsHandler } from "../handlers/assetsHandler";
import { SettingsHandler } from "../handlers/settingsHandler";
import { Color, RenderTexture, Vec2 } from "../libraries/rapid-render";
import { GameObject } from "../objects/gameObject";
import { TextObject } from "../objects/textObject";
import { AwakePayload, Entity, LevelData, Rectangle, SettingsData } from "../types/bareTypes";
import { Helper } from "../utils/helper";
import { EditorScene } from "./editorScene";

type EditorScenePayload = AwakePayload<EditorScene>;
type PrefabSceneAwakePayload = EditorScenePayload & {
    name: string;
    settingsHandler: SettingsHandler;
};

// ON SERIALIZATION:
// 
// A PREFAB HAS ITS DATA SERIALIZED IN settingsData.json (OR CUSTOM FILE)
// THIS IS FED INTO THE PLUGIN IN GotoPrefab() IN PluginHandler.ts
// ANY CHANGES TO THE DATA MADE IN THE PLUGIN ARE DIRECTLY SAVED, SEE SetPrefabField()
// 
// WHEN CHANGES ARE MADE IN THE EDITOR, EG, OBJECT IS DRAGGED, THEN ON RELEASE, THE saveLevelCallback: SavePrefabToSettingsData() IS CALLED
// HERE THE RUNTIME PREFAB OBJECT IS SERIALIZED AND SAVED TO settingsData.json
// WAS SENDING EVERY CHANGE TO THE settingsData BEFORE, BUT MORE KEPT COMING AND USER WOULD NEED TO DO THIS TOO, 
// SO JUST SERIALIZING THE WHOLE OBJECT NOW, CAN MARK ONE WITH .save = false AND IT WILL BE SKIPPED
// 
// ON SERIALIZATION - FOR CHILDREN COMING FROM A PREFAB:
// IN SettingsHandler.ts Process() and ExtendEntity() entityUID FIELDS ARE ASSIGNED TO EACH RAW ENTITY.
// IF AN ENTITY EXTENDS ANOTHER WITH THE .extends field, IT WILL TAKE OVER ITS VALUES AND CHILDREN. SEE ExtendEntity()
// EACH NEW CHILD WILL GET A .extends FIELD REFERENCING THEIR SOURCE CHILD entityUID 
// THIS MEANS THE CHILD ENTITY INHERITS THE VALUES OF THE SOURCE, AND CAN ALSO OVERRIDE THEM WITH ITS OWN VALUES
// NOTE: AN OVERRIDEN ENTITY CANNOT OVERRIDE IT'S CHILDREN ORDER, WILL STAY SAME AS SOURCE
// 
// BEFORE SAVING THE settingsData, THE entityUID FIELDS ARE CLEARED IF THEY ARE NOT REFERENCED, SEE CleanSettingsData(), 
//
// SO .extends CAN REFERENCE A PREFAB NAME, OR AN ENTITY UID. COULD GO ALL THE WAY REFERENCING UIDS, WHICH WOULD WORK FINE IN THE PLUGIN
// IT WOULD JUST RESOLVE THE NAME. BUT WHEN VIEWING/EDITING THE raw settingsData.json, IT WOULD BE HARD TO FOLLOW WHAT EXTENDS WHAT
// SO SUPPORTING BOTH WAYS FOR NOW. (INTENDING TO, CANNOT REFERENCE CHILD NAME ATM, JUST ROOT)
//

export class PrefabScene extends EditorScene
{
    objectName: string = "";

    override get gridEnabled(): boolean
    {
        return false;
    }

    override get showUI(): boolean
    {
        return false;
    }

    override get selectionEnabled(): boolean
    {
        return false;
    }
    
    lastPayload: PrefabSceneAwakePayload;
    debugAtStart: boolean;

    imagePathBeforePlaceHolder: string = "";
    textureBeforePlaceHolder: string = "";

    constructor()
    {
        super({solo:true, persistent: true});
    }

    override async OnStart(payload: PrefabSceneAwakePayload = this.lastPayload): Promise<void>
    {
        this.debugAtStart = window.debug;
        window.debug = true;
        this.hitbox.showDebug = false;
        
        if (!assetsHandler.HasTexture("placeHolder"))
        {
            // CREATE placeHolder RENDERTEXTURE
            var rt = new RenderTexture(rapid, { width: 512, height: 512, clearColor: Color.fromHex("b3b3b3") });
            var text = new TextObject(this, {text: "  Place       Holder", fontSize: 52, fill: "white"});
            text.CenterPivot();
            text.x = rt.width / 2;
            text.y = rt.height / 2;
            this.RenderTo(text, rt, true);

            rapid.drawToRenderTexture(rt, () => {
                rapid.drawLine({
                    points: [
                        new Vec2(0, 0),
                        new Vec2(rt.width, rt.height),
                    ],
                    width: 5,
                    roundCap: false,
                    color: Color.White,
                });
                rapid.drawLine({
                    points: [
                        new Vec2(0, rt.height),
                        new Vec2(rt.width, 0),
                    ],
                    width: 5,
                    roundCap: false,
                    color: Color.White,
                });
            }, null);
            
            assetsHandler.AddTexture("placeHolder", rt);
        }

        this.lastPayload = payload;

        const objectName:string = (payload)?.name;
        const targetSettingsHandler:SettingsHandler = (payload)?.settingsHandler;
        
        // WE TAKE OVER THE TARGET PREFAB DATA, ONCE AT INIT
        // SO THAT THE OBJECTS AND DUMMY DATA CREATED FROM THIS SCENE ARE BASED ON THIS DATA
        if (this.objectName == "")
        {
            this.objectName = objectName;
        }

        var levelData = await this.CreateLevelDataForPrefab(objectName);
        await super.OnStart({levelPathOrData: levelData, saveLevelCallback: this.SavePrefabToSettingsData, settingsHandler: targetSettingsHandler});
    }

    override OnClear(): void
    {
        if (this.opened)
        {
            window.debug = this.debugAtStart;
        }

        super.OnClear();
    }

    // ON CLOSE, PROCESS THE SETTINGS DATA OF SCENE WE'RE RETURNING TO,
    // SO IT'S UPDATED WITH THE LATEST CHANGES
    override async Close(): Promise<void>
    {
        const gameScene = bare.scene.GetMainScene();
        await gameScene.settingsHandler.Process();

        await super.Close();
    }

    async CreateLevelDataForPrefab(objectName: string): Promise<LevelData>
    {
        const rawSettingsData = this.settingsHandler.GetRaw();
        var prefab = SettingsHandler.FindPrefab(rawSettingsData, objectName)!;
        const isBase = SettingsHandler.IsBasePrefab(rawSettingsData, objectName);

        prefab = Helper.DeepCopy(prefab);

        prefab.name = objectName;

        if (isBase)
        {
            this.imagePathBeforePlaceHolder = prefab.imagePath;
            this.textureBeforePlaceHolder = prefab.texture;

            prefab.texture = "placeHolder";
            prefab.imagePath = "";
        }

        // SET UP LEVEL
        return {
            name: objectName,
            dimensions: {
                width: 1,
                height: 1
            },
            backgroundColor: "#3C3C3C",
            isData: true,
            entitiesByLayer: {
                "objects": [
                    {
                        ... prefab,
                        /*position: {
                            x: 0,
                            y: 0
                        },*/
                        interactableInEditor: false,//
                    }
                ]
            }
        };
    }

    override async Open(levelPathOrData?: string | LevelData, saveLevelCallback?: () => Promise<LevelData>, settingsHandler?: SettingsHandler): Promise<void>
    {
        var ret = await super.Open(levelPathOrData, saveLevelCallback, settingsHandler);

        var obj = this.object.GetByName(this.objectName);

        // THE ROOT ENTITY OBJECT REPRESENTS THE ENTITY BEING EDITED ITSELF - IT HAS NO MEANINGFUL
        // POSITION/SCALE/ROTATION OF ITS OWN TO SAVE, SO IT SHOULDN'T BE DRAGGABLE VIA THE
        // TRANSFORM TOOL (SAME MECHANISM THE SOPIRO JOINT HELPER OBJECTS USE TO OPT OUT).
        obj.resizeable = false;

        // SET CAMERA ZOOM, BASED ON OBJECT BOUNDS
        var bounds = obj.GetBoundsWithChildren();
        var s = Math.max(bounds.width / rapid.width, bounds.height / rapid.height);
        this.camera.zoom = 1/s * .5;
        bare.camera.SetPosition(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        
        return ret;
    }

    // FIRES EVERY TIME USER RELEASES LEFT MOUSE BUTTON
    // SERIALIZES RUNTIME GAMEOBJECTS, USING THEIR ORIGINAL ENTITY AS COMPARISON
    //
    // TOOK SETTINGSDATA ENITY AS BASE TRUTH BEFORE, APPLYING PATCHES WHEN CHANGES TO RUNTIME OBJECT WERE MADE, EG TRANSFORMS.
    // BUT MORE PATCHES WERE NEEDED EVERY TIME, EG CHILDREN ADD/REMOVE, SO I TAKE RUNTIME OBJECT AS BASE TRUTH NOW AND SERIALIZE IT.
    async SavePrefabToSettingsData(): Promise<LevelData>
    {
        var rootObject = this.object.GetByName(this.objectName);
        
        var entity = {
            name: this.objectName, // KEEP NAME ON TOP
            ...this.GetEntityFromObject(rootObject, { propsToIgnoreInEntity: [], fillPresets: true, forceAllEntityVars: false, includeSaveFields: false, keepRuntimeUIDs: true })
        };
            
        // editor-only, set on the root in CreateLevelDataForPrefab(). stored in the live settings data it would make
        // the entity unselectable in the level editor
        delete entity.interactableInEditor;

        // RESTORE THE PLACEHOLDER FIELDS SET IN CreateLevelDataForPrefab()
        if (entity.texture == "placeHolder")
        {
            if (this.textureBeforePlaceHolder)
                entity.texture = this.textureBeforePlaceHolder;
            else
                delete entity.texture;

            if (this.imagePathBeforePlaceHolder)
                entity.imagePath = this.imagePathBeforePlaceHolder;
            else
                delete entity.imagePath;
        }

        const newRawSettingsData = await this.settingsHandler.UpdateRaw((draft) => {
            SettingsHandler.SetPrefab(draft, this.objectName, entity);
        });
        const dataToSave = Helper.DeepCopy(newRawSettingsData);

        globalThis.plugin?.CleanSettingsData(dataToSave, this.settingsHandler);

        await this.SaveSettingsData(dataToSave);

        // The compact entity above is the persistence representation. The debug API rebuilds the
        // resolved editor payload from the freshly processed settings, matching gotoPrefab()
        // without reopening (and consequently rebuilding) this scene.
        window.__GAME_DEBUG_API__?.notifyPrefabChanged({
            name: this.objectName,
        });
        
        return this.currentLevel; // NOT USED IN THIS CASE, BUT EXPECTED FOR METHOD, BIT HACKY
    }

    override NotifyTransformToolPreview(operation: "move" | "resize" | "rotate"): void
    {
        const rootObject = this.object.GetByName(this.objectName);
        if (!rootObject)
            return;

        const fields = operation === "move"
            ? ["position"]
            : operation === "rotate"
                ? ["rotation"]
                : ["position", "scale"];

        const transforms = (this.editorControlsHandler?.selectedObjects ?? [])
            .map(obj => {
                // Use the same entity diff used for persistence. This keeps default, unauthored
                // transform fields absent instead of making a move preview explicitly author
                // scale {1,1} and rotation 0 in the panel.
                const serialized = this.GetEntityFromObject(obj) as any;
                const transform: any = {
                    childPath: this.GetChildPath(rootObject, obj),
                    fields,
                };

                for (const field of fields)
                {
                    if (Object.prototype.hasOwnProperty.call(serialized, field))
                        transform[field] = serialized[field];
                }

                return transform;
            })
            .filter(transform => transform.childPath !== null);

        if (transforms.length == 0)
            return;

        // Preview only: the raw settings data and disk are still updated once on pointer release.
        window.__GAME_DEBUG_API__?.notifyPrefabTransformPreview({
            name: this.objectName,
            transforms,
        });
    }

    // PREFAB PANEL SELECTION IS CHILDPATH-BASED (THE PREFAB TREE), NOT UNIQUEID-BASED LIKE THE
    // FLAT LEVEL EDITOR'S OBJECT LIST - SO IT NEEDS ITS OWN PLUGIN MESSAGE SHAPE.
    override NotifySelectionToPlugin(objs: GameObject[]): void
    {
        if (objs.length == 0)
        {
            // NOTHING LEFT SELECTED (EG SHIFT-CLICK TOGGLED THE LAST REMAINING CHILD OFF) - TELL
            // THE PANEL TO DROP ITS FOCUSED NODE THE SAME WAY AN EMPTY-SPACE CLICK DOES.
            window.__GAME_DEBUG_API__?.selectPrefabObjectInPlugin({
                name: this.objectName,
                clearSelection: true,
            });
            return;
        }

        const rootObject = this.object.GetByName(this.objectName);
        if (!rootObject)
            return;

        const primary = objs[objs.length - 1];
        const childPath = this.GetChildPath(rootObject, primary);
        if (!childPath)
            return;

        // every selected object's path, so the panel highlights the whole multi-selection
        const childPaths = objs
            .map(obj => this.GetChildPath(rootObject, obj))
            .filter(path => path);

        window.__GAME_DEBUG_API__?.selectPrefabObjectInPlugin({
            name: this.objectName,
            childPath,
            childPaths,
        });
    }

    // the deepest saved descendant under the pointer, deep (alt) or not, like the plugin's right-click
    // select. runtime-generated descendants (eg MoneyComponent's save:false dollar sprites) resolve
    // to their nearest saved ancestor. the root itself is never picked, clicking it selects the root
    // in the plugin like empty space does
    override PickAt(world: Vec2, _deep: boolean): GameObject | null
    {
        const rootObject = this.object.GetByName(this.objectName);
        if (!rootObject)
            return null;

        var target = rootObject.GetDeepestChildAt(world);
        while (target && target !== rootObject && !this.GetChildPath(rootObject, target))
            target = target.parent;

        if (!target || target === rootObject)
            return null;

        return target;
    }

    // only the entity's root is saved, so everything is edited under it
    override GetEditRoot(): GameObject | null
    {
        return this.object.GetByName(this.objectName);
    }

    override AllowsRectSelection(): boolean
    {
        return true;
    }

    // Match click selection: only the root's direct, saved children are selectable. Their bounds
    // may include deeper runtime-generated descendants, but those descendants are never targets.
    override GetRectSelectionCandidates(_includeAllLayers: boolean): Array<{ obj: GameObject, rect: Rectangle }>
    {
        const rootObject = this.object.GetByName(this.objectName);
        if (!rootObject)
            return [];

        return rootObject.children
            .filter(child => child.save && child.visible && child.visibleInEditor && child.alpha != 0)
            .map(child => ({ obj: child, rect: child.GetBounds() }));
    }

    // child paths of the selected objects, primary last. lets a reload restore a multi-selection
    GetSelectedChildPaths(): number[][]
    {
        const rootObject = this.object.GetByName(this.objectName);
        if (!rootObject)
            return [];

        return this.editorControlsHandler.selectedObjects
            .map(obj => this.GetChildPath(rootObject, obj))
            .filter(path => path);
    }

    private GetChildPath(root: GameObject, target: GameObject): number[] | null
    {
        const path: number[] = [];
        var current = target;

        while (current !== root)
        {
            if (!current.save)
                return null;

            const parent = current.parent;
            if (!parent)
                return null;

            const childIndex = parent.children.filter(child => child.save).indexOf(current);
            if (childIndex < 0)
                return null;

            path.unshift(childIndex);
            current = parent;
        }

        return path;
    }
}
