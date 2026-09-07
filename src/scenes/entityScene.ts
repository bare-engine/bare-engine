import { keyboardController } from "../controllers/keyboardController";
import { assetsHandler } from "../handlers/assetsHandler";
import { SettingsHandler } from "../handlers/settingsHandler";
import { Color, RenderTexture, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import { TextObject } from "../objects/textObject";
import { AwakePayload, Entity, LevelData, Rectangle, SettingsData } from "../types/bareTypes";
import { Helper } from "../utils/helper";
import { EditorScene } from "./editorScene";

type EditorScenePayload = AwakePayload<EditorScene>;
type EntitySceneAwakePayload = EditorScenePayload & {
    name: string;
    settingsHandler: SettingsHandler;
};

// ON SERIALIZATION:
// 
// AN ENTITY HAS ITS DATA SERIALIZED IN settingsData.json (OR CUSTOM FILE)
// THIS IS FED INTO THE PLUGIN IN GotoEntity() IN PluginHandler.ts
// ANY CHANGES TO THE DATA MADE IN THE PLUGIN ARE DIRECTLY SAVED, SEE SetEntityField()
// 
// WHEN CHANGES ARE MADE IN THE EDITOR, EG, OBJECT IS DRAGGED, THEN ON RELEASE, THE saveLevelCallback: SaveEntityDataToSettingsData() IS CALLED
// HERE THE RUNTIME ENTITY OBJECT IS SERIALIZED AND SAVED TO settingsData.json
// WAS SENDING EVERY CHANGE TO THE settingsData BEFORE, BUT MORE KEPT COMING AND USER WOULD NEED TO DO THIS TOO, 
// SO JUST SERIALIZING THE WHOLE OBJECT NOW, CAN MARK ONE WITH .save = false AND IT WILL BE SKIPPED
// 
// ON SERIALIZATION - FOR CHILDREN COMING FROM ENITTY:
// IN SettingsHandler.ts Process() and ExtendEntity() entityUID FIELDS ARE ASSIGNED TO EACH RAW ENTITY.
// IF AN ENTITY EXTENDS ANOTHER WITH THE .entity field, IT WILL TAKE OVER ITS VALUES AND CHILDREN. SEE ExtendEntity()
// EACH NEW CHILD WILL GET A .entity FIELD REFERENCING THEIR SOURCE CHILD entityUID 
// THIS MEANS THE CHILD ENTITY INHERITS THE VALUES OF THE SOURCE, AND CAN ALSO OVERRIDE THEM WITH ITS OWN VALUES
// NOTE: AN OVERRIDEN ENTITY CANNOT OVERRIDE IT'S CHILDREN ORDER, WILL STAY SAME AS SOURCE
// 
// BEFORE SAVING THE entityData, THE entityUID FIELDS ARE CLEARED IF THEY ARE NOT REFERENCED, SEE CleanSettingsData(), 
//
// SO .entity CAN REFERENCE AN ENTITY NAME, OR AN ENTITY UID. COULD GO ALL THE WAY REFERENCING UIDS, WHICH WOULD WORK FINE IN THE PLUGIN
// IT WOULD JUST RESOLVE THE NAME. BUT WHEN VIEWING/EDITING THE raw entityData.json, IT WOULD BE HARD TO FOLLOW WHAT EXTENDS WHAT
// SO SUPPORTING BOTH WAYS FOR NOW. (INTENDING TO, CANNOT REFERENCE CHILD NAME ATM, JUST ROOT)
//

export class EntityScene extends EditorScene
{
    objectName: string = "";

    readonly transformToolHandlesBodyMove: boolean = true;
    
    lastPayload: EntitySceneAwakePayload;
    degugAtStart: boolean;

    imagePathBeforePlaceHolder: string = "";
    textureBeforePlaceHolder: string = "";

    constructor()
    {
        super({solo:true, persistent: true});
    }

    override async OnStart(payload: EntitySceneAwakePayload = this.lastPayload): Promise<void>
    {
        this.degugAtStart = window.debug;
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
        
        // WE TAKE OVER THE TARGET ENTITY DATA, ONCE AT INIT
        // SO THAT THE OBJECTS AND DUMMY DATA CREATED FROM THIS SCENE ARE BASED ON THIS DATA
        if (this.objectName == "")
        {
            this.objectName = objectName;
        }

        // Entity editor UI state is local to this scene; don't write it into the shared settings raw data.
        //this.HideEditorUIForScene();
        // PROBLEM: THE ACTUAL RECT INGAME - TODO
        
        targetSettingsHandler.GetRaw().showUI = false;
        targetSettingsHandler.GetRaw().selectionEnabled = false;

        var levelData = await this.CreateEntityDataFor(objectName);
        await super.OnStart({levelPathOrData: levelData, saveLevelCallback: this.SaveEntityDataToSettingsData, settingsHandler: targetSettingsHandler});
    }

    override OnClear(): void
    {
        if (this.opened)
        {
            window.debug = this.degugAtStart;

            // UNDO THE showUI / selectionEnabled OVERRIDES WE SET AT OnStart()
            // OTHERWISE THE LEVEL EDITOR (WHICH SHARES THIS HANDLER) OPENS WITH ITS UI HIDDEN
            // ONLY WHEN opened, SINCE OnClear ALSO RUNS DURING INIT (LoadLevel), WHERE WE STILL NEED THE OVERRIDE
            var settings = this.lastPayload?.settingsHandler?.Get();
            if (settings)
            {
                delete settings.showUI;
                delete settings.selectionEnabled;
            }
        }

        super.OnClear();
    }

    async CreateEntityDataFor(objectName: string): Promise<LevelData>
    {
        const rawSettingsData = this.settingsHandler.GetRaw();
        var entityFromSettingsData = SettingsHandler.FindEntity(rawSettingsData, objectName)!;
        const isBase = SettingsHandler.IsBaseEntity(rawSettingsData, objectName);

        entityFromSettingsData = Helper.DeepCopy(entityFromSettingsData);

        entityFromSettingsData.name = objectName;

        if (isBase)
        {
            this.imagePathBeforePlaceHolder = entityFromSettingsData.imagePath;
            this.textureBeforePlaceHolder = entityFromSettingsData.texture;

            entityFromSettingsData.texture = "placeHolder";
            if(entityFromSettingsData.imagePath)
                entityFromSettingsData.imagePath = "";
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
                        ... entityFromSettingsData,
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

    override OnUpdate(deltaTime: number): void
    {
        /*var pivotObj = this.object.GetByName("dot");
        var mainObj = this.object.GetByName(this.objectName);
        var tl = mainObj.GetTopLeftPosition();
        pivotObj.SetPosition(tl.x + mainObj.pivot.x * mainObj.totalScaleX, tl.y + mainObj.pivot.y * mainObj.totalScaleY);*/
    }

    override async Open(levelPathOrData?: string | LevelData, saveLevelCallback?: () => Promise<LevelData>, settingsHandler?: SettingsHandler): Promise<void>
    {
        var ret = await super.Open(levelPathOrData, saveLevelCallback, settingsHandler);

        var obj = this.object.GetByName(this.objectName);
        //obj.x += obj.pivot.x;
        //obj.y += obj.pivot.y;

        // THE ROOT ENTITY OBJECT REPRESENTS THE ENTITY BEING EDITED ITSELF - IT HAS NO MEANINGFUL
        // POSITION/SCALE/ROTATION OF ITS OWN TO SAVE, SO IT SHOULDN'T BE DRAGGABLE VIA THE
        // TRANSFORM TOOL (SAME MECHANISM THE SOPIRO JOINT HELPER OBJECTS USE TO OPT OUT).
        obj.resizeable = false;

        // COLLISION RECT
        /*if (obj instanceof ArcadeObject)
        {
            var hitbox = obj.physicsHitbox.rectangle;
            var collisionRectEntity:Entity = {
                name: "collisionRect",
                position: {
                    x: hitbox.x - obj.pivot.x,
                    y: hitbox.y - obj.pivot.y
                },
                scale: {
                    x: hitbox.width,
                    y: hitbox.height
                },
                components: {
                    resizableRemove: {}
                },
                alpha: .4
            };
            this.AddGameObject(collisionRectEntity);
        }
                   
        // PIVOT
        var pivot = obj.pivot;
        var pivotEntity:Entity = {
            name: "dot",
            texture: "NONE", // WE'LL DRAW A CIRCLE IN PivotComponent OnPostRender()
            position: {
                x: pivot.x - obj.pivot.x,
                y: pivot.y - obj.pivot.y
            },
            pivot: {
                x: .5,
                y: .5
            },
            scale: {
                x: .75,
                y: .75
            },
            imagePath: "",
            components: {
                pivot: {objectName: this.objectName, hitboxName: "collisionRect"},
                pivotRemove: {}
            }
        }
        this.AddGameObject(pivotEntity);*/

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
    async SaveEntityDataToSettingsData(): Promise<LevelData>
    {
        var rootObject = this.object.GetByName(this.objectName);
        
        var entity = {
            name: this.objectName, // KEEP NAME ON TOP
            ...this.GetEnitityFromObject(rootObject)
        };
            
        // RESTORE THE PLACEHOLDER FIELDS SET IN CreateEntityDataFor()
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
            SettingsHandler.SetEntity(draft, this.objectName, entity);
        });
        const dataToSave = Helper.DeepCopy(newRawSettingsData);

        globalThis.plugin?.CleanSettingsData(dataToSave, this.settingsHandler);

        await this.SaveSettingsData(dataToSave);

        // The compact entity above is the persistence representation. The debug API rebuilds the
        // resolved editor payload from the freshly processed settings, matching gotoEntity()
        // without reopening (and consequently rebuilding) this scene.
        window.__GAME_DEBUG_API__?.notifyEntityDataChanged({
            name: this.objectName,
        });
        
        return this.currentLevel; // NOT USED IN THIS CASE, BUT EXPECTED FOR METHOD, BIT HACKY
    }

    NotifyTransformToolPreview(operation: "move" | "resize" | "rotate"): void
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
                const serialized = this.GetEnitityFromObject(obj) as any;
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
        window.__GAME_DEBUG_API__?.notifyEntityTransformPreview({
            name: this.objectName,
            transforms,
        });
    }

    // ENTITY PANEL SELECTION IS CHILDPATH-BASED (THE ENTITY TREE), NOT UNIQUEID-BASED LIKE THE
    // FLAT LEVEL EDITOR'S OBJECT LIST - SO IT NEEDS ITS OWN PLUGIN MESSAGE SHAPE.
    override NotifySelectionToPlugin(objs: GameObject[]): void
    {
        if (objs.length == 0)
        {
            // NOTHING LEFT SELECTED (EG SHIFT-CLICK TOGGLED THE LAST REMAINING CHILD OFF) - TELL
            // THE PANEL TO DROP ITS FOCUSED NODE THE SAME WAY AN EMPTY-SPACE CLICK DOES.
            window.__GAME_DEBUG_API__?.selectEntityObjectInPlugin({
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

        window.__GAME_DEBUG_API__?.selectEntityObjectInPlugin({
            name: this.objectName,
            childPath,
        });
    }

    // THE PANEL CAN ONLY FOCUS ONE NODE AT A TIME (SEE THE game-view-only SCOPE DECISION), SO A
    // MULTI-SELECT CLICK STILL FOCUSES WHICHEVER CHILD WAS JUST CLICKED/TOGGLED ON, AND FALLS
    // BACK TO THE GENERIC NotifySelectionToPlugin (LAST-SELECTED, OR clearSelection) WHEN A
    // SHIFT-CLICK TOGGLES A CHILD OFF INSTEAD.
    SelectTransformToolTargetAt(worldPosition: Vec2): GameObject | null
    {
        const selected = this.GetTransformToolTargetAt(worldPosition);
        const multiSelect = keyboardController.IsKeyDown("shift");

        if (!selected)
        {
            if (multiSelect)
                return null; // SHIFT+CLICK ON EMPTY SPACE LEAVES THE CURRENT SELECTION ALONE

            this.editorControlsHandler.ClearSelection();
            window.__GAME_DEBUG_API__?.selectEntityObjectInPlugin({
                name: this.objectName,
                clearSelection: true,
            });
            return null;
        }

        const rootObject = this.object.GetByName(this.objectName)!;

        if (multiSelect)
            this.editorControlsHandler.ToggleGameObjectSelection(selected, false);
        else
            this.editorControlsHandler.SelectGameObjects([selected], true, true, false);

        if (!this.editorControlsHandler.selectedObjects.includes(selected))
        {
            // JUST TOGGLED selected OFF.
            this.NotifySelectionToPlugin(this.editorControlsHandler.selectedObjects);
            return selected;
        }

        const childPath = this.GetChildPath(rootObject, selected) ?? [];
        window.__GAME_DEBUG_API__?.selectEntityObjectInPlugin({
            name: this.objectName,
            childPath,
        });

        return selected;
    }

    GetTransformToolTargetAt(worldPosition: Vec2): GameObject | null
    {
        const rootObject = this.object.GetByName(this.objectName);
        if (!rootObject)
            return null;

        // Canvas picking in an EntityScene is intentionally one level deep. Descendants may be
        // runtime-generated helpers (for example MoneyComponent's save:false dollar sprites), so
        // use them only through their direct parent's combined bounds and select that parent.
        for (var i = rootObject.children.length - 1; i >= 0; i--)
        {
            const child = rootObject.children[i];
            if (!child.save || !child.visible || !child.visibleInEditor || child.alpha == 0)
                continue;

            if (Helper.IsPointInRectangle(worldPosition, child.GetBounds()))
                return child;
        }

        if (!rootObject.visible || !rootObject.visibleInEditor || rootObject.alpha == 0 || !rootObject.texture)
            return null;

        return Helper.IsPointInRectangle(worldPosition, rootObject.GetBounds()) ? rootObject : null;
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

    private HideEditorUIForScene(): void
    {
        this.settingsData.showUI = false;
        this.settingsData.selectionEnabled = false;
    }

    async OnPreSaveSettingsData(rawData: SettingsData): Promise<void>
    {
        delete rawData.showUI;
        delete rawData.selectionEnabled;
    }

    async OnPostSaveSettingsData(rawData: SettingsData): Promise<void>
    {
        this.HideEditorUIForScene();
    }
}
