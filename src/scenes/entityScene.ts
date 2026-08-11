import { keyboardController } from "../controllers/keyboardController";
import { assetsHandler } from "../handlers/assetsHandler";
import { SettingsHandler } from "../handlers/settingsHandler";
import { Color, RenderTexture, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import { TextObject } from "../objects/textObject";
import { AwakePayload, Entity, LevelData, Rectangle, SettingsData } from "../types/bareTypes";
import { Helper } from "../utils/helper";
import { EditorScene } from "./editorScene";
import { Scene } from "./scene";

type EditorScenePayload = AwakePayload<EditorScene>;
type EntitySceneAwakePayload = EditorScenePayload & {
    name: string;
    isBase: boolean;
    settingsHandler: SettingsHandler;
};

export class EntityScene extends EditorScene
{
    objectName: string = "";
    isBase: boolean = false;
    readonly transformToolHandlesBodyMove: boolean = true;
    private pendingPastedEntities = new Map<string, Entity>();
    private pendingRemovedChildPaths: number[][] = [];
    
    lastPayload: EntitySceneAwakePayload;
    degugAtStart: boolean;

    constructor()
    {
        super({solo:true, persistent: true});
    }

    override async OnStart(payload: EntitySceneAwakePayload = this.lastPayload): Promise<void>
    {
        this.degugAtStart = window.debug;
        window.debug = true;
        
        if (!assetsHandler.HasTexture("placeHolder"))
        {
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
        const isBase:boolean = (payload)?.isBase;
        const targetSettingsHandler:SettingsHandler = (payload)?.settingsHandler;
        
        // WE TAKE OVER THE TARGET ENTITY DATA, ONCE AT INIT
        // SO THAT THE OBJECTS AND DUMMY DATA CREATED FROM THIS SCENE ARE BASED ON THIS DATA
        if (this.objectName == "")
        {
            this.objectName = objectName;
        }

        this.isBase = isBase;

        // Entity editor UI state is local to this scene; don't write it into the shared settings raw data.
        //this.HideEditorUIForScene();
        // PROBLEM: THE ACTUAL RECT INGAME - TODO
        
        targetSettingsHandler.Get().showUI = false;
        targetSettingsHandler.Get().selectionEnabled = false;

        var levelData = await this.CreateEntityDataFor(objectName, isBase);
        await super.OnStart({levelPathOrData: levelData, saveLevelCallback: this.SaveEntityDataToSettingsData, settingsHandler: targetSettingsHandler});
    }

    override OnClear(): void
    {
        this.pendingPastedEntities.clear();
        this.pendingRemovedChildPaths = [];

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

    async CreateEntityDataFor(objectName: string, isBase: boolean): Promise<LevelData>
    {
        var entityFromSettingsData:Entity;

        if (isBase)
        {
            entityFromSettingsData = this.settingsData.baseEntities[objectName];
        }
        else
        {
            entityFromSettingsData = this.settingsData.entities[objectName];
        }

        entityFromSettingsData = {...entityFromSettingsData};
        
        if (isBase)
        {
            entityFromSettingsData.name = objectName;
            entityFromSettingsData.texture = "placeHolder";
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

    override AddGameObject<T extends GameObject = GameObject>(entityLevel: Entity | string, parent?: int | string | GameObject): T
    {
        var gameObject = Scene.prototype.AddGameObject.call(this, entityLevel, parent) as T;
        return gameObject;
    }

    override AddGameObjectAtPosition(x: number, y: number, entityOrName: Entity | string, parent: int | GameObject = 0): GameObject
    {
        const rootObject = this.object.GetByName(this.objectName);
        if (!rootObject)
            return super.AddGameObjectAtPosition(x, y, entityOrName, parent);

        // EntityScene edits one entity tree. New objects belong to that tree rather than becoming
        // unrelated top-level level objects. Convert the editor's world-space paste position to
        // the root entity's local space before parenting it.
        const localPosition = rootObject.ToLocal(new Vec2(x, y));
        const rawEntity = typeof entityOrName == "string"
            ? { name: entityOrName }
            : structuredClone(entityOrName);
        rawEntity.position = { x: localPosition.x, y: localPosition.y };

        const gameObject = super.AddGameObjectAtPosition(localPosition.x, localPosition.y, entityOrName, rootObject);
        this.pendingPastedEntities.set(gameObject.uniqueID, rawEntity);
        return gameObject;
    }

    override SerializeObjectForCopy(obj: GameObject): Entity
    {
        const pendingEntity = this.pendingPastedEntities.get(obj.uniqueID);
        if (pendingEntity)
            return structuredClone(pendingEntity);

        const rootObject = this.object.GetByName(this.objectName);
        const childPath = rootObject ? this.GetChildPath(rootObject, obj) : null;
        var rawEntity = this.isBase
            ? this.settingsHandler.GetRaw().baseEntities?.[this.objectName]
            : this.settingsHandler.GetRaw().entities?.[this.objectName];

        if (childPath !== null && rawEntity)
        {
            for (const childIndex of childPath)
            {
                rawEntity = rawEntity.children?.[childIndex];
                if (!rawEntity)
                    break;
            }
        }

        // EntityScene has a canonical sparse representation in raw settings. Copy that instead
        // of obj.entity, which contains constructed/inherited defaults. A newly-created object may
        // not be in raw settings yet, so retain the normal compact serializer as a fallback.
        return childPath !== null && rawEntity
            ? structuredClone(rawEntity)
            : super.SerializeObjectForCopy(obj);
    }

    async SaveEntityDataToSettingsData(): Promise<LevelData>
    {
        const selectedObjects = this.editorControlsHandler?.selectedObjects ?? [];
        const rootObject = this.object.GetByName(this.objectName);
        const removedChildPaths = this.PruneDescendantPaths(this.pendingRemovedChildPaths);

        if (!rootObject || (selectedObjects.length == 0 && removedChildPaths.length == 0))
            return this.currentLevel;

        const transforms = selectedObjects
            .map(obj => ({ obj, childPath: this.GetChildPath(rootObject, obj) }))
            // childPath.length == 0 MEANS obj IS THE ROOT ITSELF - IT HAS NO POSITION/SCALE/
            // ROTATION OF ITS OWN TO PERSIST (SEE THE resizeable = false SET IN Open(), WHICH
            // SHOULD ALREADY KEEP IT OUT OF selectedObjects AS A DRAG TARGET; THIS IS A BACKSTOP).
            .filter(entry => entry.childPath !== null && entry.childPath.length > 0) as Array<{ obj: GameObject, childPath: number[] }>;

        if (transforms.length == 0 && removedChildPaths.length == 0)
            return this.currentLevel;

        var structureChanged = false;
        var addedChildPath: number[] | null = null;

        const newRawSettingsData = await this.settingsHandler.UpdateRaw((draft) => {
            var rootEntity = this.isBase
                ? draft.baseEntities?.[this.objectName]
                : draft.entities?.[this.objectName];

            if (!rootEntity)
                return;

            // REMOVE DELETED CHILDREN BEFORE APPLYING TRANSFORMS/ADDITIONS BELOW - transforms'
            // CHILDPATHS WERE COMPUTED FROM THE LIVE TREE, WHICH ALREADY REFLECTS THE REMOVAL.
            const sortedRemovals = removedChildPaths.slice().sort(EntityScene.CompareChildPathsDescending);
            for (const childPath of sortedRemovals)
            {
                var parentEntity: Entity | undefined = rootEntity;
                for (var depth = 0; depth < childPath.length - 1; depth++)
                    parentEntity = parentEntity?.children?.[childPath[depth]];

                const lastIndex = childPath[childPath.length - 1];
                if (parentEntity?.children && lastIndex >= 0 && lastIndex < parentEntity.children.length)
                {
                    parentEntity.children.splice(lastIndex, 1);
                    structureChanged = true;
                }
            }

            for (const { obj, childPath } of transforms)
            {
                var entity: Entity | undefined = rootEntity;
                for (var depth = 0; depth < childPath.length; depth++)
                {
                    const childIndex = childPath[depth];
                    const children = entity.children as Entity[] | undefined;
                    var childEntity = children?.[childIndex];

                    if (!childEntity)
                    {
                        // A pasted object is appended to its live parent. Mirror that structural
                        // addition into raw settings before applying its transform.
                        const isLastPathPart = depth == childPath.length - 1;
                        const isAppend = childIndex == (children?.length ?? 0);
                        if (!isLastPathPart || !isAppend)
                        {
                            entity = undefined;
                            break;
                        }

                        childEntity = this.pendingPastedEntities.get(obj.uniqueID)
                            ? structuredClone(this.pendingPastedEntities.get(obj.uniqueID)!)
                            : this.SerializeObjectForCopy(obj);
                        entity.children ??= [];
                        entity.children.push(childEntity);
                        this.pendingPastedEntities.delete(obj.uniqueID);
                        structureChanged = true;
                        addedChildPath = childPath.slice();
                    }

                    entity = childEntity;
                    if (!entity)
                        break;
                }

                if (!entity)
                    continue;

                // TransformTool operates on the outer/local transform, which maps directly to
                // the canonical entity fields used by the inspector.
                entity.position = { x: obj.x, y: obj.y };
                entity.scale = { x: obj.scale.x, y: obj.scale.y };
                entity.rotation = obj.rotation;

                // Do not leave legacy aliases competing with the canonical vector fields.
                delete entity.x;
                delete entity.y;
                delete (entity as any).scaleX;
                delete (entity as any).scaleY;
            }
        });

        this.pendingRemovedChildPaths = [];

        await this.SaveEntityData(newRawSettingsData);
        this.HideEditorUIForScene();

        window.__GAME_DEBUG_API__?.notifyEntityDataChanged(newRawSettingsData);

        if (structureChanged)
        {
            window.__GAME_DEBUG_API__?.reloadEntityInPlugin({
                name: this.objectName,
                isBase: this.isBase,
                settingsDataName: newRawSettingsData.name,
                childPath: addedChildPath,
            });
        }

        return this.currentLevel;
    }

    NotifyTransformToolPreview(): void
    {
        const rootObject = this.object.GetByName(this.objectName);
        if (!rootObject)
            return;

        const transforms = (this.editorControlsHandler?.selectedObjects ?? [])
            .map(obj => ({
                childPath: this.GetChildPath(rootObject, obj),
                position: { x: obj.x, y: obj.y },
                scale: { x: obj.scale.x, y: obj.scale.y },
                rotation: obj.rotation,
            }))
            .filter(transform => transform.childPath !== null);

        if (transforms.length == 0)
            return;

        // Preview only: the raw settings data and disk are still updated once on pointer release.
        window.__GAME_DEBUG_API__?.notifyEntityTransformPreview({
            name: this.objectName,
            isBase: this.isBase,
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
                isBase: this.isBase,
                clearSelection: true,
            });
            return;
        }

        const rootObject = this.object.GetByName(this.objectName);
        if (!rootObject)
            return;

        const primary = objs[objs.length - 1];
        const childPath = this.GetChildPath(rootObject, primary) ?? [];

        window.__GAME_DEBUG_API__?.selectEntityObjectInPlugin({
            name: this.objectName,
            isBase: this.isBase,
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
                isBase: this.isBase,
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
            isBase: this.isBase,
            childPath,
        });

        return selected;
    }

    GetTransformToolTargetAt(worldPosition: Vec2): GameObject | null
    {
        const rootObject = this.object.GetByName(this.objectName);
        return rootObject ? this.FindDeepestObjectAt(rootObject, worldPosition) : null;
    }

    override AllowsRectSelection(): boolean
    {
        return true;
    }

    // ENTITY CHILDREN HAVE NO TAP HITBOX (SEE EntityScene.AddGameObject), SO CANDIDATES ARE
    // GATHERED BY WALKING THE ROOT ENTITY'S SUBTREE DIRECTLY, USING THE SAME BOUNDS-BASED
    // VISIBILITY RULES AS FindDeepestObjectAt.
    override GetRectSelectionCandidates(_includeAllLayers: boolean): Array<{ obj: GameObject, rect: Rectangle }>
    {
        const rootObject = this.object.GetByName(this.objectName);
        if (!rootObject)
            return [];

        const candidates: Array<{ obj: GameObject, rect: Rectangle }> = [];

        const collect = (obj: GameObject) => {
            for (const child of obj.children)
            {
                if (!child.visible || !child.visibleInEditor || child.alpha == 0)
                    continue;

                // SAME REASON AS FindDeepestObjectAt: A TEXTURELESS CONTAINER'S GetBounds() FALLS
                // BACK TO ITS CHILDREN'S COMBINED BOUNDS, WHICH WOULD OTHERWISE MARQUEE-SELECT IT
                // FOR A DRAG THAT ONLY GRAZES THE GAP BETWEEN ITS CHILDREN.
                if (child.texture)
                    candidates.push({ obj: child, rect: child.GetBounds() });

                collect(child);
            }
        };
        collect(rootObject);

        return candidates;
    }

    private FindDeepestObjectAt(obj: GameObject, worldPosition: Vec2): GameObject | null
    {
        if (!obj.visible || !obj.visibleInEditor || obj.alpha == 0)
            return null;

        for (var i = obj.children.length - 1; i >= 0; i--)
        {
            const selectedChild = this.FindDeepestObjectAt(obj.children[i], worldPosition);
            if (selectedChild)
                return selectedChild;
        }

        // GameObject.GetBounds() falls back to GetBoundsWithChildren() when the object has no
        // texture of its own - a textureless container has nothing to click ON, and shouldn't
        // steal a click that lands in a gap between its children just because that gap falls
        // inside their combined bounds.
        if (!obj.texture)
            return null;

        return Helper.IsPointInRectangle(worldPosition, obj.GetBounds()) ? obj : null;
    }

    private GetChildPath(root: GameObject, target: GameObject): number[] | null
    {
        const path: number[] = [];
        var current = target;

        while (current !== root)
        {
            const parent = current.parent;
            if (!parent)
                return null;

            const childIndex = parent.children.indexOf(current);
            if (childIndex < 0)
                return null;

            path.unshift(childIndex);
            current = parent;
        }

        return path;
    }

    // CHILDPATH CAN ONLY BE COMPUTED WHILE THE OBJECT IS STILL PARENTED, SO WE RECORD IT HERE
    // (CALLED BY EditorControlsHandler RIGHT BEFORE Scene.RemoveGameObject DETACHES IT) AND
    // SPLICE THE MATCHING ENTRY OUT OF RAW SETTINGS LATER, ON SaveEntityDataToSettingsData.
    override OnBeforeGameObjectRemoved(gameObject: GameObject): void
    {
        // NEVER PERSISTED TO RAW SETTINGS - NOTHING TO SPLICE OUT, JUST DROP THE PENDING PASTE.
        if (this.pendingPastedEntities.delete(gameObject.uniqueID))
            return;

        const rootObject = this.object.GetByName(this.objectName);
        if (!rootObject || gameObject === rootObject)
            return;

        const childPath = this.GetChildPath(rootObject, gameObject);
        if (childPath !== null)
            this.pendingRemovedChildPaths.push(childPath);
    }

    // KEEPS ONLY THE OUTERMOST PATHS - IF A PARENT AND ITS CHILD ARE BOTH PENDING REMOVAL, THE
    // PARENT'S SPLICE ALREADY TAKES THE CHILD WITH IT.
    private PruneDescendantPaths(paths: number[][]): number[][]
    {
        const isPrefixOf = (prefix: number[], path: number[]) =>
            prefix.length < path.length && prefix.every((value, i) => value == path[i]);

        return paths.filter(path => !paths.some(other => other !== path && isPrefixOf(other, path)));
    }

    // DESCENDING ORDER SO A SIBLING AT A HIGHER INDEX IS SPLICED BEFORE ONE AT A LOWER INDEX -
    // OTHERWISE REMOVING THE LOWER-INDEX SIBLING FIRST WOULD SHIFT THE HIGHER ONE'S INDEX DOWN.
    private static CompareChildPathsDescending(a: number[], b: number[]): number
    {
        const len = Math.min(a.length, b.length);
        for (var i = 0; i < len; i++)
        {
            if (a[i] != b[i])
                return b[i] - a[i];
        }

        return b.length - a.length;
    }

    private HideEditorUIForScene(): void
    {
        this.settingsData.showUI = false;
        this.settingsData.selectionEnabled = false;
    }

    async OnPreSaveEntityData(rawData: SettingsData): Promise<void>
    {
        delete rawData.showUI;
        delete rawData.selectionEnabled;

        await this.settingsHandler.Process(rawData);
    }

    async OnPostSaveEntityData(rawData: SettingsData): Promise<void>
    {
        this.HideEditorUIForScene();
    }
}
