import { assetsHandler } from "../handlers/assetsHandler";
import { SettingsHandler } from "../handlers/settingsHandler";
import { Color, RenderTexture, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import { TextObject } from "../objects/textObject";
import { AwakePayload, Entity, LevelData, SettingsData } from "../types/bareTypes";
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

    async SaveEntityDataToSettingsData(): Promise<LevelData>
    {
        const selectedObjects = this.editorControlsHandler?.selectedObjects ?? [];
        const rootObject = this.object.GetByName(this.objectName);
        if (!rootObject || selectedObjects.length == 0)
            return this.currentLevel;

        const transforms = selectedObjects
            .map(obj => ({ obj, childPath: this.GetChildPath(rootObject, obj) }))
            .filter(entry => entry.childPath !== null) as Array<{ obj: GameObject, childPath: number[] }>;

        if (transforms.length == 0)
            return this.currentLevel;

        const newRawSettingsData = await this.settingsHandler.UpdateRaw((draft) => {
            var rootEntity = this.isBase
                ? draft.baseEntities?.[this.objectName]
                : draft.entities?.[this.objectName];

            if (!rootEntity)
                return;

            for (const { obj, childPath } of transforms)
            {
                var entity = rootEntity;
                for (const childIndex of childPath)
                {
                    entity = entity.children?.[childIndex];
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

        await this.SaveEntityData(newRawSettingsData);
        this.HideEditorUIForScene();

        // Push the fresh raw settings to the plugin. Unlike gotoEntity(), this does not rebuild
        // EntityScene, so the live object and TransformTool selection remain intact.
        window.__GAME_DEBUG_API__?.notifyEntityDataChanged(newRawSettingsData);

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

    SelectTransformToolTargetAt(worldPosition: Vec2): GameObject | null
    {
        const selected = this.GetTransformToolTargetAt(worldPosition);
        if (!selected)
            return null;

        const rootObject = this.object.GetByName(this.objectName)!;

        this.editorControlsHandler.SelectGameObjects([selected], true, true, false);

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
