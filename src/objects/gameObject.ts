import type { Component } from "../controllers/componentController";
import type { AnyPress } from "../controllers/hitboxController";
import { GameMode } from "../globals";
import { assetsHandler } from "../handlers/assetsHandler";
import mitt from "../libraries/mitt";
import { Color, drawSpriteWithMatrix, MaskType, MatrixStack, MatrixStore, Texture, Vec2 } from "../libraries/rapid-render";
import { drawSpriteTransform } from "../rendering/transformSpriteRegion";
import type { Scene } from "../scenes/scene";
import type { ComponentCtor, Ctor, CustomDataValues, DropFirst, Events, Rectangle, Shader } from "../types/bareTypes";
import { Entity, entityVarsNested, GameObjectClass, RefreshEntityVars } from '../types/bareTypes';
import { Hitbox } from '../types/hitbox';
import { Percentage, isInspectorFieldDescriptor } from "../utils/decorators";
import { Helper } from '../utils/helper';
import { getOwnSerializeFieldNames, SerializeField } from "../utils/serializeFields";

// Lifecycle hook bits. GameObject's hooks are empty virtuals, so walking a whole scene to call them
// costs real time and does nothing. Every object caches which hooks its own class implements (`hooks`)
// and which ones exist anywhere in its subtree (`subtreeHooks`), so entire branches can be skipped.
// A hook assigned to an instance after it was added (obj.OnUpdate = fn) needs RefreshLifecycleHooks().
export const HOOK_UPDATE = 1;
export const HOOK_FIXED_UPDATE = 2;
export const HOOK_PRE_RENDER = 4;
export const HOOK_POST_RENDER = 8;
export const HOOK_RENDER = 16;

const DEG_TO_RAD = Math.PI / 180;

/**
 * Applies one transform stage - `translate(origin + position) rotate scale [flip] translate(-pivot)` -
 * to the matrix at `parent` and writes the result into `out`. Pass -1 as `parent` to multiply `out`
 * in place. A null pivot or origin counts as (0, 0).
 *
 * Every transform in the engine is built from this, so a stage costs one affine multiply instead of a
 * translate/rotate/scale/translate sequence on the matrix stack.
 */
function composeStage(store: MatrixStore, out: number, parent: number, transform: Transform, pivot: Vec2 | null, origin: Vec2 | null, flip: boolean): void
{
    const rotation = transform.rotation * DEG_TO_RAD;
    const cos = rotation === 0 ? 1 : Math.cos(rotation);
    const sin = rotation === 0 ? 0 : Math.sin(rotation);

    // scale(-1, 1) after the scale stage is the same as negating the x scale.
    const scaleX = flip ? -transform.scale.x : transform.scale.x;
    const scaleY = transform.scale.y;

    const a = cos * scaleX;
    const b = sin * scaleX;
    const c = -sin * scaleY;
    const d = cos * scaleY;

    var x = transform.position.x;
    var y = transform.position.y;

    if (origin)
    {
        x += origin.x;
        y += origin.y;
    }

    if (pivot)
    {
        x -= a * pivot.x + c * pivot.y;
        y -= b * pivot.x + d * pivot.y;
    }

    if (parent === -1)
        store.multiplyAffineInPlace(out, a, b, c, d, x, y);
    else
        store.multiplyAffine(parent, out, a, b, c, d, x, y);
}

export class Transform {
    position = new Vec2();
    scale = new Vec2(1, 1);
    rotation = 0;
    flipped = false;
    pivot: Vec2 | null = null; // null = inherit (inner transform) / lazy origin (outer transform)

    Reset()
    {
        this.position = new Vec2();
        this.scale = new Vec2(1, 1);
        this.rotation = 0;
        this.flipped = false;
        this.pivot = null;
    }
}

export class GameObject
{
    private static registeredGameObjects: Record<string, GameObjectClass> = {};

    // matrix slot for sprites that compose their world matrix without pushing a stack frame.
    // allocated once and never put on the stack's per-frame list, so rapid never recycles it
    private static scratchMatrix = -1;
    // REUSED BY RenderSprite FOR OBJECTS WITH SHADERS: THE TINT'S COLOR, AND ITS ALPHA
    private static shaderTint = new Color(255, 255, 255, 255);
    private static shaderAlpha = new Color(255, 255, 255, 255);
    private static scratchStack: MatrixStack | null = null;

    static gameObjectCounter = -1; // ONE BACK TO NOT COUNT THE DUMMY GAMEOBJECT INSTANCED IN BAREGAME
 
    scene: Scene;

    @SerializeField(GameMode.Edit)
    name!: string;
    pluginName!: string;
    uniqueID:string = "";

    active:boolean = true;
    texture: Texture | null = null;
    
    private _shaders: Shader[] | null = null;

    get shaders(): Shader[]
    {
        return this._shaders ??= [];
    }
    set shaders(value: Shader[])
    {
        this._shaders = value;
    }
    private mask: GameObject | null = null;
    private maskType: MaskType = MaskType.EQUAL;

    transform: Transform = new Transform();
    innerTransform: Transform = new Transform();

    children: Array<GameObject> = [];
    parent: GameObject | null = null;

    addedToScene:boolean = false;
    started:boolean = false;
    pooled:boolean = false;
    revertPivotOnSave: boolean = false; // TODO

    resizeable: boolean = true;

    /** Bitmask of the lifecycle hooks this object's own class implements. @see RefreshLifecycleHooks */
    hooks: number = 0;
    /** Bitmask of the lifecycle hooks implemented anywhere in this object's subtree, itself included. */
    subtreeHooks: number = 0;

    tapHitbox: Hitbox | null = null; // PHASE THIS OUT, MAKE INTO COMPONENT? TODO
  
    startPosition = new Vec2();

    texturePromise: Promise<Texture> | null = null;

    private renderParentTransform: Float32Array | null = null;

    entity: Entity | null = null;
    
    visibleInEditor:boolean = true;

    private _OnTextureLoadedCallbacks: Function[] | null = null;

    get OnTextureLoadedCallbacks(): Function[]
    {
        return this._OnTextureLoadedCallbacks ??= [];
    }
    set OnTextureLoadedCallbacks(value: Function[])
    {
        this._OnTextureLoadedCallbacks = value;
    }

    protected _events: ReturnType<typeof mitt<Events>> | null = null;

    // ONLY ALLOCATING EVENTS WHEN NEEDED, SAVES SOME MEMORY
    get events(): ReturnType<typeof mitt<Events>>
    {
        return this._events ??= mitt<Events>();
    }
    set events(value: ReturnType<typeof mitt<Events>>)
    {
        this._events = value;
    }

    layer:string = "";

    //private cachedChildrenWidth: number = -1;
    //private cachedChildrenHeight: number = -1;

    // MAKE texturePath, x, y OPTIONS {}?
    // OR EVEN BETTER: LET IT TAKE AN ENTITY - TODO
    constructor(scene: Scene, texturePath: string = "", x:number = 0, y:number = 0)
    {
        this.scene = scene;

        this.ResetValues(); // MAKES ABOVE VALUES NOT REALLY MATTER, THESE ARE THE DEFAULTS
        
        this.x = x;
        this.y = y;
        this.uniqueID = GameObject.GetUniqueID();

        if (Number.isNaN(x) || Number.isNaN(y))
            trace('isNaN SetPosition')

        this.Init("gameObject");

        // Added() reads them again once the object is parented; this covers objects that render
        // without ever being added to a layer, such as a mask.
        this.RefreshLifecycleHooks();

        if (texturePath != "")
            this.InitTexture(texturePath);
    }
 
    // ONLY FOR PLUGIN - MOVE - TODO
    static RegisterGameObject(cls: GameObjectClass, defaultPoolSize: number = 1): void
    {
        // bare.AddClass redefined cls.name to the true source name, so read it directly.
        // ALWAYS OVERWRITE: ON HOT RELOAD THE SAME NAME COMES BACK AS A NEW CLASS OBJECT
        const className = cls.name;
        GameObject.registeredGameObjects[className] = cls;

        GameObject.RegisterEntityVars(cls);
    }

    static RegisterEntityVars(cls: any): void
    {
        const className = cls.name;

        // add this class's @SerializeField members saved in the editor to entityVarsNested, so the editor saves
        // them and they show up in the plugin (grouped/locked per class) and get default values from the instance.
        // @Hidden ones too, the plugin leaves those out itself
        // MAKE THIS ALSO WORK WITH INHERITANCE OF MULTIPLE CUSTOM CLASSES - TODOR
        var vars = getOwnSerializeFieldNames(cls, GameMode.Edit);
        if (vars.length > 0)
        {
            var existingEntityVars = entityVarsNested.find(entry =>
                typeof entry !== "string" && Object.prototype.hasOwnProperty.call(entry, className)
            );
            if (existingEntityVars && typeof existingEntityVars !== "string")
            {
                var existingVars = existingEntityVars[className];
                var addedVars = false;

                for (var fieldName of vars)
                {
                    if (!existingVars.includes(fieldName))
                    {
                        existingVars.push(fieldName);
                        addedVars = true;
                    }
                }

                if (addedVars)
                    RefreshEntityVars();
            }
            else
            {
                entityVarsNested.push({ [className]: vars });
                RefreshEntityVars();
            }
        }
    }

    OnPointerDown(callback: AnyPress | null = null): Hitbox | null
    {
        if (this.scene)
        {
            return this.scene.OnPointerDown(this, callback);
        }

        return null;
    }

    OnPointerUp(callback: AnyPress | null = null)
    {
        if (this.scene)
        {
            this.scene.OnPointerUp(this, callback);
        }
    }

    OnPointerEnter(callback: AnyPress | null = null)
    {
        if (this.scene)
        {
            this.scene.OnPointerEnter(this, callback);
        }
    }

    OnPointerLeave(callback: AnyPress | null = null)
    {
        if (this.scene)
        {
            this.scene.OnPointerLeave(this, callback);
        }
    }

    OffPointers()
    {
        /*this.OnPointerDown();
        this.OnPointerUp();
        this.OnPointerEnter();
        this.OnPointerLeave();*/

        this.tapHitbox = null;
    }

    // CAN SUPPY A CLASS OR INSTANCE OF COMPONENT
    // FOR A CLASS, THE TRAILING ARGS ARE TYPED FROM ITS CONSTRUCTOR (scene IS INJECTED, SO IT'S DROPPED)
    AddComponent<C extends ComponentCtor>(componentClass: C, ...args: DropFirst<ConstructorParameters<C>>): InstanceType<C>;
    AddComponent<T extends Component<GameObject>>(componentInstance: T): T;
    AddComponent<T extends Component<GameObject>>(arg: Ctor<T> | T, ...args: any[]): T
    {
        var componentController = this.scene.Get("component"); // NO HARD REF TO COMPONENTCONTROLLER ON PURPOSE

        if (componentController)
            return componentController.AddComponent(this, arg, ...args);
        else
        {
            console.error("ComponentController not registered. Call bare.AddClass(ComponentController) at Awake() of your game.");
            return (typeof arg === "function" ? new arg(this.scene, ...args) : arg);
        }
    }

    GetComponent<T extends Component<any>>(componentClass: Ctor<T>): T | null;
    GetComponent<T extends Component<any>>(componentInstance: T): T | null;
    GetComponent<T extends Component<any>>(arg: Ctor<T> | T): T | null
    {
        var componentController = this.scene.Get("component");

        if (componentController)
        {
            if (typeof arg === "function")
                return componentController.Get(this, arg);

            return componentController.Get(this, arg);
        }
        else
        {
            console.error("ComponentController not registered. Call bare.AddClass(ComponentController) at OnAwake() of your game.");
            return null;
        }
    }

    HasComponent<T extends Component<any>>(componentClass: Ctor<T>): boolean;
    HasComponent<T extends Component<any>>(componentInstance: T): boolean;
    HasComponent<T extends Component<any>>(arg: Ctor<T> | T): boolean
    {
        var componentController = this.scene.Get("component");

        if (componentController)
        {
            return componentController.Has(this, arg as any);
        }
        else
        {
            console.error("ComponentController not registered. Call bare.AddClass(ComponentController) at OnAwake() of your game.");
            return false;
        }
    }

    get components(): Array<Component<this>> { 
        if (!this.scene.Has("component"))
            return new Array<Component<this>>();

        var componentController = this.scene.Get("component"); // NO HARD REF TO COMPONENTCONTROLLER ON PURPOSE

        if (componentController)
            return componentController.GetAllFrom(this); 

        return new Array<Component<this>>();
    }
    
    RemoveComponent<T extends Component<any>>(componentClass: Ctor<T>): boolean;
    RemoveComponent<T extends Component<any>>(componentInstance: T): boolean;
    RemoveComponent<T extends Component<any>>(arg: Ctor<T> | T): boolean
    {
        var componentController = this.scene.Get("component");

        if (componentController)
        {
            return componentController.RemoveComponent(this, arg as any);
        }
        else
        {
            console.error("ComponentController not registered. Call bare.AddClass(ComponentController) at Awake() of your game.");
            return false;
        }
    }
    
    OnApplyEntityVarsToGameObject(entity: Entity, obj: GameObject)
    {
        // FOR OVERRIDE
    }

    OnApplyEntityToGameObject(entity: Entity, addComponents: boolean)
    {
        // FOR OVERRIDE
    }

    // MAPS ENTITY PROPS THAT NEED CUSTOM HANDLING WHEN APPLIED TO THIS OBJECT.
    // OVERRIDE IN SUBCLASSES WITH { ...super.specialMap, ... } TO ADD MORE.
    get specialMap(): Record<string, (obj: GameObject, value: any) => void>
    {
        return {
            pivot: (o, v) => o.SetPivot(v.x, v.y), // SETPIVOT DOES SOME EXTRA WORK FOR PERCENTAGES, SO CUSTOM MAPPING
            innerPivot: (o, v) => o.SetInnerPivot(v.x, v.y), // SetInnerPivot DOES SOME EXTRA WORK FOR PERCENTAGES, SO CUSTOM MAPPING
            texture: (o, v) => v && v != "NONE" && o.InitTexture(v), // PROCESS CUSTOM TEXTURE NAME
            color: (o, v) => o.SetColor(v), // PROCESS THE HEX COLOR STRING
            children: (o, v) => {
                for (const childEntity of v)
                {
                    const child = o.scene.AddGameObject(childEntity, o);

                    // children from data (prefab, level, save) are always saved, like top-level objects. only save: false opts out
                    if (childEntity.save === undefined)
                        child.save = true;
                }
            },
            components: (o, v) => {
                for (const component in v)
                {
                    const className = Helper.CapitalizeFirstLetter(component) + "Component";
                    var ComponentClass = bare.componentClasses[className];
                    if (!ComponentClass)
                    {
                        console.error('Component class not found: ' + className + '. Add it with bare.AddClass(' + Helper.CapitalizeFirstLetter(component) + 'Component);');
                        continue; // STILL ADD THE OTHER COMPONENTS
                    }
                    var componentValues = v[component];
                    var componentInstance = new ComponentClass(o.scene);
                    for (const key in componentValues)
                    {
                        const value = componentValues[key];

                        // OUT OF DATE
                        // @InspectorField DESCRIPTORS (EG TextComponent.fontSize, DECLARED AS
                        // { get, set }) HOLD A PLAIN {get,set} OBJECT ON THE INSTANCE - A DIRECT
                        // ASSIGNMENT WOULD JUST OVERWRITE THAT OBJECT INSTEAD OF INVOKING IT, SO
                        // THE VALUE WOULD SILENTLY NEVER TAKE EFFECT. MIRRORS
                        // Scene.ApplyEntityVarsToGameObject, WHICH DOES THE SAME FOR THE OUTER
                        // GAMEOBJECT'S OWN FIELDS (EG TextObject.fontSize).
                        const descriptor = (componentInstance as any)[key];
                        if (isInspectorFieldDescriptor(descriptor) && typeof descriptor.set === "function")
                        {
                            descriptor.set.call(componentInstance, value);
                            continue;
                        }

                        componentInstance[key] = value;
                    }
                    componentInstance.__paramNames = Object.keys(componentValues);
                    o.AddComponent(componentInstance);
                }
            },
        };
    }

    static GetUniqueID(): string
    {
        return (GameObject.gameObjectCounter++).toString();
    }

    SetStartPosition(x: number, y: number): this
    {
        this.startPosition.x = x;
        this.startPosition.y = y;

        return this;
    }

    Init(name: string): void
    {
        this.name = name;
        this.SetStartPosition(this.x, this.y);
    }

    async InitTexture(texturePath: string):Promise<Texture | undefined>
    {
        if (texturePath.endsWith("NONE"))
            return;

        if (texturePath.endsWith("NAME"))
            return;

        const cached = assetsHandler.GetTexture(texturePath);
        if (cached)
        {
            this.SetTexture(cached);
            return cached;
        }

        this.texturePromise = assetsHandler.LoadTexture(texturePath);
        const tex = await this.texturePromise;
        this.SetTexture(tex);

        this.texturePromise = null;

        return tex;
    }

    SetTexture(texture:Texture): this
    {
        if (!texture)
            console.error("SetTexture has supplied an invalid texture: " + texture);

        this.texture = texture;

        if (this.texture != bare.asset.missingTexture) // missingTexture MEANS IT'S NOT FOUND
        {
            var onTextureLoadedCallbacksCached = this._OnTextureLoadedCallbacks;
            this._OnTextureLoadedCallbacks = null;

            if (onTextureLoadedCallbacksCached)
            for (var i = 0; i < onTextureLoadedCallbacksCached.length; i++)
            {
                onTextureLoadedCallbacksCached[i]();
            }
        }

        return this;
    }

    WhenTextureLoaded(callback: () => void)
    {
        if (this.texture && this.texture != bare.asset.missingTexture)
        {
            // TEXTURE IS ALREADY THERE
            callback();
            return;
        }

        // QUEUE CALLBACK FOR WHEN TEXTURE HAS LOADED
        this.OnTextureLoadedCallbacks.push(callback);
    }

    Awake(entity?: Entity)
    {
        this.OnAwake(entity);
    }

    // SET INITIAL VALUES HERE, NO ALLOCATIONS
    // SINCE IT'S ALSO USED IN GetAppliedEntityWithDefaultValues() FOR DEFAULT VALUES
    OnAwake(entity?: Entity)
    {
        // FOR OVERRIDE
    }

    Start()
    {
        if (this.started)
            return;

        this.started = true;
        this.OnStart();
    }

    OnStart()
    {
        // FOR OVERRIDE
    }

    Added()
    {
        this.addedToScene = true;

        // Re-read the hooks now the object is fully constructed and parented.
        this.RefreshLifecycleHooks();

        // Attaching changes the parent's subtree even when our cached mask is unchanged.
        this.parent?.RefreshLifecycleHooks();

        this.OnAdded();
    }

    /**
     * Recomputes which lifecycle hooks this object implements, then the subtree masks of it and its
     * ancestors. Call it after assigning a hook to an instance at runtime (obj.OnUpdate = fn), or
     * after adding or removing a child.
     */
    RefreshLifecycleHooks()
    {
        const base = GameObject.prototype;
        var hooks = 0;

        if (this.OnUpdate !== base.OnUpdate)
            hooks |= HOOK_UPDATE;
        if (this.OnFixedUpdate !== base.OnFixedUpdate)
            hooks |= HOOK_FIXED_UPDATE;
        if (this.OnPreRender !== base.OnPreRender)
            hooks |= HOOK_PRE_RENDER;
        if (this.OnPostRender !== base.OnPostRender)
            hooks |= HOOK_POST_RENDER;
        if (this.OnRender !== base.OnRender)
            hooks |= HOOK_RENDER;

        this.hooks = hooks;

        for (var obj: GameObject | null = this; obj; obj = obj.parent)
        {
            var mask = obj.hooks;
            var children = obj.children;

            for (var i = 0; i < children.length; i++)
                mask |= children[i].subtreeHooks;

            // Unchanged here means unchanged for every ancestor too.
            if (mask === obj.subtreeHooks)
                return;

            obj.subtreeHooks = mask;
        }
    }

    OnAdded()
    {
        // FOR OVERRIDE
    }

    Removed()
    {
        this.addedToScene = false;
        this.started = false;
        this.OnRemoved();
    }

    OnRemoved()
    {
        // FOR OVERRIDE
    }

    // CALLED WHEN A REMOVED OBJECT DOESN'T GO BACK TO A POOL: FREE GPU RESOURCES IT OWNS, LIKE A TEXT TEXTURE.
    // IT CAN STILL BE ADDED AGAIN, SO RECREATE THEM IN Added()
    ReleaseResources()
    {
    }

    OnResize()
    {
        // FOR OVERRIDE
    }

    Update(deltaTime: number)
    {
        if (!this.active)
            return;

        if (this.hooks & HOOK_UPDATE)
            this.OnUpdate(deltaTime);

        var children = this.children;

        for (var i = 0; i < children.length; i++)
        {
            var child = children[i];

            if (child.subtreeHooks & HOOK_UPDATE)
                child.Update(deltaTime);
        }
    }

    FixedUpdate(fixedDeltaTime: number)
    {
        if (!this.active)
            return;

        if (this.hooks & HOOK_FIXED_UPDATE)
            this.OnFixedUpdate(fixedDeltaTime);

        var children = this.children;

        for (var i = 0; i < children.length; i++)
        {
            var child = children[i];

            if (child.subtreeHooks & HOOK_FIXED_UPDATE)
                child.FixedUpdate(fixedDeltaTime);
        }
    }

    OnFixedUpdate(fixedDeltaTime: number)
    {
        // FOR OVERRIDE
    }

    /** @virtual */
	OnUpdate(deltaTime: number)
    {
        // FOR OVERRIDE
	}

    /** @virtual */
    OnPreRender()
    {
        // FOR OVERRIDE
    }

    /** @virtual */
    Render(inheritedColor?: Color)
    {
        // MAYBE WANT TO MOVE THIS OUTSIDE THE RENDER CALL, 
        // SO USER CODE CAN CALL IT DESPITE VISIBLE BOOL - TODO?
        if (bare.levelEditorOpen)
        {
            if (!this.visibleInEditor)
                return;
            
            // STILL RENDERS EVEN IF VISIBLE IS FALSE IN EDITOR 
        }
        else
        if (!this.visibleInEditor || !this.visible || this.alpha == 0 || this.scale.x == 0 || this.scale.y == 0)
            return;
        
        // UPDATE SHADERS
        var shaders = this._shaders;
        if (shaders)
        for (var i = shaders.length - 1; i >= 0; i--)
        {
            var shader = shaders[i];

            if (shader.Update)
            {
                var remove = shader.Update(this);
                if (remove)
                    shaders.splice(i, 1);
            }
        }

        const stack = rapid.matrixStack;

        // Custom rendering relies on the object's transform being the current stack frame.
        // Only default sprite implementations can submit directly through the scratch slot.
        const base = GameObject.prototype;
        const needsStackFrame = !!this.mask || (this.visible && (this.hooks & HOOK_RENDER) !== 0)
            || this.ApplyContentTransform !== base.ApplyContentTransform
            || this.ApplyInnerTransformToMatrixStack !== base.ApplyInnerTransformToMatrixStack
            || this.RenderSprite !== base.RenderSprite;

        if (this.mask)
            this.renderParentTransform = stack.getTransform();

        inheritedColor = inheritedColor ? Helper.MultiplyColors(inheritedColor, this.color) : this.color;

        if (needsStackFrame)
        {
            stack.save();
            this.ApplyContentTransform();

            if (this.texture)
                this.RenderSprite(inheritedColor);

            if (this.visible)
                this.OnRender(inheritedColor);

            stack.restore();
        }
        else if (this.texture)
        {
            const inner = this.innerTransform;
            const transform = this.transform;
            const texture = this.texture;
            // Preserve the affine path for inner transforms, filters, atlases and pixel snapping.
            // Children still establish their normal stack frame below.
            if (!this.parent && this.children.length === 0 && this.shaders.length === 0 && texture.base && !texture.isAtlas && !texture.isRotated
                && !rapid.roundPixels && !rapid.inCreateMask
                && transform.flipped === inner.flipped && inner.rotation === 0
                && inner.scale.x === 1 && inner.scale.y === 1
                && inner.position.x === 0 && inner.position.y === 0)
            {
                const pivot = this.pivot;
                drawSpriteTransform(rapid, texture, transform.position.x, transform.position.y,
                    transform.rotation * DEG_TO_RAD, transform.scale.x, transform.scale.y,
                    pivot.x, pivot.y, inheritedColor);
            }
            else
            {
                const scratch = GameObject.GetScratchMatrix(stack);
                this.ComposeContentMatrix(stack.matrix, scratch, stack.curWorldM);
                this.RenderSprite(inheritedColor, scratch);
            }
        }

        if (this.children.length > 0)
        {
            stack.save();
            this.ApplyChildTransform();

            // Render children with inherited color
            for (var i = 0; i < this.children.length; i++)
            {
                this.children[i].Render(inheritedColor);
            }

            stack.restore();
        }
    }
    
    RenderWorld(inheritedColor?: Color)
    {
        if (!this.visible)
            return;

        this.OnRenderWorld(inheritedColor);

        for (const child of this.children)
            child.RenderWorld(inheritedColor);
    }

    OnRenderWorld(inheritedColor?: Color)
    {
        // For override
    }

    // pos / rot / scale only. Pivot is applied separately at the content boundary:
    // children use transform.pivot, the sprite uses innerPivot (see RenderSprite / GetBounds).
    ApplyTransformToMatrixStack(transform: Transform)
    {
        const stack = rapid.matrixStack;
        composeStage(stack.matrix, stack.curWorldM, -1, transform, null, null, transform.flipped);
    }

    // Establishes the space children render in, relative to this object's already-applied
    // parent transform. Children inherit the complete content transform by default.
    protected ApplyChildTransform()
    {
        const stack = rapid.matrixStack;
        this.ComposeChildSpaceMatrix(stack.matrix, stack.curWorldM, -1);
    }

    protected ApplyContentTransform()
    {
        const stack = rapid.matrixStack;
        composeStage(stack.matrix, stack.curWorldM, -1, this.transform, this.pivot, null, false);
        this.ApplyInnerTransformToMatrixStack();
    }

    protected ApplyInnerTransformToMatrixStack()
    {
        const stack = rapid.matrixStack;
        this.ComposeInnerMatrix(stack.matrix, stack.curWorldM);
    }

    /** Content space: what this object's own sprite draws in - the outer transform, then the inner one. */
    private static GetScratchMatrix(stack: MatrixStack): number
    {
        if (GameObject.scratchStack !== stack)
        {
            GameObject.scratchStack = stack;
            GameObject.scratchMatrix = stack.matrix.alloc();
        }
        return GameObject.scratchMatrix;
    }

    private ComposeContentMatrix(store: MatrixStore, out: number, parent: number): void
    {
        // The outer stage never applies the outer flip; outer and inner flips share the inner stage.
        composeStage(store, out, parent, this.transform, this.pivot, null, false);

        this.ComposeInnerMatrix(store, out);
    }

    /** The inner stage on its own. Identity for a plain sprite, which is the case worth being quick about. */
    private ComposeInnerMatrix(store: MatrixStore, out: number): void
    {
        const inner = this.innerTransform;
        const flipped = this.transform.flipped !== inner.flipped;

        if (!flipped
            && inner.rotation === 0
            && inner.scale.x === 1 && inner.scale.y === 1
            && inner.position.x === 0 && inner.position.y === 0)
            return;

        // The inner pivot is both the origin the stage rotates around and the pivot it takes back out.
        const pivot = this.innerPivot;
        composeStage(store, out, -1, inner, pivot, pivot, flipped);
    }

    /** Outer transform only: position, rotation, scale, flip and pivot. */
    private ComposeOuterMatrix(store: MatrixStore, out: number, parent: number): void
    {
        composeStage(store, out, parent, this.transform, this.pivot, null, this.transform.flipped);
    }

    /**
     * The space this object's children live in: content space, unless they ignore the inner transform.
     * A child at (0, 0) sits on the texture's top left, so changing the pivot moves the children along
     * with the texture. With childrenAtPivot it sits on the pivot point instead, like Pixi's anchor.
     */
    private ComposeChildSpaceMatrix(store: MatrixStore, out: number, parent: number): void
    {
        if (this.childrenInheritInnerTransform)
            this.ComposeContentMatrix(store, out, parent);
        else
            this.ComposeOuterMatrix(store, out, parent);

        this.MoveChildSpaceToPivot(store, out);
    }

    private MoveChildSpaceToPivot(store: MatrixStore, out: number): void
    {
        const pivot = this.transform.pivot;
        if (this.childrenAtPivot && pivot && (pivot.x !== 0 || pivot.y !== 0))
            store.multiplyAffineInPlace(out, 1, 0, 0, 1, pivot.x, pivot.y);
    }

    OnRender(inheritedColor?: Color)
    {
        // FOR OVERRIDE
    }

    PostRender()
    {
        if (!this.visible)
            return;
        
        if (bare.debug)
        {
            // OUTER PIVOT / ORIGIN — BLACK CIRCLE (world space so nested children draw correctly)
            var originWorld = this.ContentToGlobal(this.pivot);
            rapid.matrixStack.save();
            rapid.matrixStack.translate(originWorld.x, originWorld.y);
            rapid.drawCircle({
                radius: 4 * this.scene.ScreenPxToWorldScale(),
                color: new Color(0, 0, 0, 255),
                segments: 16,
            });

            rapid.matrixStack.restore();

            // INNER PIVOT — SLIGHTLY SMALLER WHITE CIRCLE
            var innerPivotWorld = this.ContentToGlobal(this.innerPivot, true);
            rapid.matrixStack.save();
            rapid.matrixStack.translate(innerPivotWorld.x, innerPivotWorld.y);
            rapid.drawCircle({
                radius: 2 * this.scene.ScreenPxToWorldScale(),
                color: new Color(255, 255, 255, 255),
                segments: 16,
            });
            rapid.matrixStack.restore();
        }

        if (this.hooks & HOOK_POST_RENDER)
            this.OnPostRender();

        // RECURSE SO CHILDREN (AND THEIR DEBUG VISUALS) ALSO POST-RENDER
        var children = this.children;

        for (var i = 0; i < children.length; i++)
        {
            var child = children[i];

            if (bare.debug || (child.subtreeHooks & HOOK_POST_RENDER))
                child.PostRender();
        }
    }

    OnPostRender()
    {
        // FOR OVERRIDE
    }

    RenderSprite(color?: Color, matrixIndex: number = rapid.matrixStack.curWorldM)
    {
        if (this.mask)
        {
            rapid.startDrawMask(1, 0xFF)
            //rapid.drawMask(this.maskType, () => {
                rapid.matrixStack.save();
                if (this.renderParentTransform)
                {
                    rapid.matrixStack.setTransform(this.renderParentTransform);
                }
                this.mask.visible = true;
                this.mask.Render();
                this.mask.visible = false;
                rapid.matrixStack.restore();
            //});
            rapid.endDrawMask();
        }
        
        const renderColor = color || this.color;
        // rapid.renderSprite({
        //     texture: this.texture!,
        //     offset: new Vec2(-this.pivot.x, -this.pivot.y),
        //     color: renderColor, 
        //     shader: this.shader, 
        //     uniforms: this.uniforms
        // });
        
        if (this.mask) {
            rapid.enterMask(this.maskType, 1, 0xFF);
        }
        
        var texture = this.texture;
        var drawColor = renderColor;

        if (this._shaders && this._shaders.length > 0)
        {
            // THE SHADERS GET THE TINTED COLOR, SO EG A FLASH TURNS A TINTED SPRITE WHITE INSTEAD OF BACK INTO ITS TINT.
            // THE ALPHA COMES AFTER THEM, SO A FADING OBJECT ALSO FADES WHAT THE SHADERS ADDED, LIKE AN OUTLINE
            GameObject.shaderTint.setRGBA(renderColor.r, renderColor.g, renderColor.b, 255);
            GameObject.shaderAlpha.setRGBA(255, 255, 255, renderColor.a);

            const glShaders = this._shaders.map(shader => shader.shader);
            texture = rapid.applyFilters(this.texture!, glShaders, GameObject.shaderTint);
            drawColor = GameObject.shaderAlpha;
        }

        drawSpriteWithMatrix(rapid, texture!, matrixIndex, drawColor);

        if (this.mask)
        {
            //rapid.clearMask();
            rapid.exitMask()
        }
    }

    SetMask(mask: GameObject, type: MaskType = MaskType.EQUAL): this
    {
        this.mask = mask;
        this.maskType = type;

        this.mask.visible = false;

        return this;
    }

    RemoveMask()
    {
        if (!this.mask)
            return;

        this.mask.visible = true;
        this.mask = null;
    }

    @SerializeField(GameMode.Edit)
    get position(): Vec2
    {
        return this.transform.position;
    }
    set position(vec2: Vec2)
    {
        this.SetPosition(vec2.x, vec2.y);
    }

    @SerializeField(GameMode.Edit)
    get scale(): Vec2
    {
        return this.transform.scale;
    }
    set scale(value: Vec2 | number)
    {
        if (typeof value === 'number') {
            this.transform.scale.set(value, value);
        } else {
            this.transform.scale.to(value);
        }
    }

    // ROTATION IN DEGREES
    @SerializeField(GameMode.Edit)
    get rotation(): number
    {
        return this.transform.rotation;
    }
    set rotation(value: number)
    {
        this.transform.rotation = (value % 360);
    }

    // OUTER pivot — anchors this object in its parent and offsets its children.
    // Lazily allocated so transform.pivot can stay null after Reset()/pooling.
    @SerializeField(GameMode.Edit)
    get pivot(): Vec2
    {
        return this.transform.pivot ??= new Vec2();
    }
    set pivot(v: Vec2)
    {
        this.transform.pivot = v;
        this.innerTransform.pivot = v.clone();
    }

    @SerializeField(GameMode.Edit)
    get innerPosition(): Vec2
    {
        return this.innerTransform.position;
    }
    set innerPosition(vec2: Vec2)
    {
        this.innerTransform.position.x = vec2.x;
        this.innerTransform.position.y = vec2.y;
    }

    @SerializeField(GameMode.Edit)
    get innerScale(): Vec2
    {
        return this.innerTransform.scale;
    }
    set innerScale(value: Vec2 | number)
    {
        if (typeof value === 'number') {
            this.innerTransform.scale.set(value, value);
        } else {
            this.innerTransform.scale.to(value);
        }
    }

    @SerializeField(GameMode.Edit)
    get innerRotation(): number
    {
        return this.innerTransform.rotation;
    }
    set innerRotation(value: number)
    {
        this.innerTransform.rotation = value;
    }

    // INNER pivot — anchor for the sprite's inner transform. Inherits the outer pivot until set
    @SerializeField(GameMode.Edit)
    get innerPivot(): Vec2
    {
        return this.innerTransform.pivot ??= new Vec2(this.pivot.x, this.pivot.y);
    }
    set innerPivot(v: Vec2)
    {
        (this.innerTransform.pivot ??= new Vec2()).set(v.x, v.y);
    }

    @SerializeField(GameMode.Edit) @Percentage
    get alpha(): number
    {
        return this.color.a / 255;
    }
    set alpha(value: number) // THIS ONLY HAS EFFECT OVER THE TEXTURE, NOT ANYTHING RENDERED BY USER (GRAPHIC/TEXTURE) IN OnRender() - TODO?
    {
        value = Math.min(Math.max(value, 0), 1);
        this.color.a = value * 255;
    }

    @SerializeField(GameMode.Edit)
    visible:boolean = true;

    @SerializeField(GameMode.Edit)
    color:Color = new Color(255, 255, 255, 255);

    @SerializeField(GameMode.Edit)
    get flipped(): boolean
    {
        return this.transform.flipped;
    }
    set flipped(value: boolean)
    {
        this.transform.flipped = value;
    }

    @SerializeField(GameMode.Edit)
    get innerFlipped(): boolean
    {
        return this.innerTransform.flipped;
    }
    set innerFlipped(value: boolean)
    {
        this.innerTransform.flipped = value;
    }
    
    @SerializeField(GameMode.Edit)
    childrenInheritInnerTransform: boolean = true;

    // false: a child at (0, 0) sits on this object's texture top left (children move along when the
    // pivot changes). true: it sits on the pivot point, so on this object's position, like Pixi's anchor.
    @SerializeField(GameMode.Edit)
    childrenAtPivot: boolean = GameObject.childrenAtPivotDefault;

    static childrenAtPivotDefault: boolean = false;

    @SerializeField(GameMode.Edit)
    persistent: boolean = false;

    @SerializeField(GameMode.Edit)
    save: boolean = false;

    private _tags: Array<string> | null = null;

    @SerializeField(GameMode.Edit)
    get tags(): Array<string>
    {
        return this._tags ??= [];
    }
    set tags(value: Array<string>)
    {
        this._tags = value;
    }

    private _customData: CustomDataValues | null = null;

    @SerializeField(GameMode.Edit)
    get customData(): CustomDataValues
    {
        return this._customData ??= {};
    }
    set customData(value: CustomDataValues)
    {
        this._customData = value;
    }

    get x(): number
    {
        return this.transform.position.x;
    }
    set x(value: number)
    {
        this.transform.position.x = value;
    }

    get y(): number
    {
        return this.transform.position.y;
    }
    set y(value: number)
    {
        this.transform.position.y = value;
    }

    get scaleX(): number
    {
        return this.scale.x;
    }
    set scaleX(value: number)
    {
        this.scale.x = value;
    }

    get scaleY(): number
    {
        return this.scale.y;
    }
    set scaleY(value: number)
    {
        this.scale.y = value;
    }

    get innerScaleX(): number
    {
        return this.innerScale.x;
    }
    set innerScaleX(value: number)
    {
        this.innerTransform.scale.x = value;
    }

    get innerScaleY(): number
    {
        return this.innerScale.y;
    }
    set innerScaleY(value: number)
    {
        this.innerTransform.scale.y = value;
    }

    get innerX(): number
    {
        return this.innerTransform.position.x;
    }
    set innerX(value: number)
    {
        this.innerTransform.position.x = value;
    }

    get innerY(): number
    {
        return this.innerTransform.position.y;
    }
    set innerY(value: number)
    {
        this.innerTransform.position.y = value;
    }

    get totalScale(): number
    {
        return this.scale.x * this.innerScale.x;
    }

    get totalScaleX(): number
    {
        return this.scale.x * this.innerScale.x;
    }
    get totalScaleY(): number
    {
        return this.scale.y * this.innerScale.y;
    }

    get pivotX(): number
    {
        return this.pivot.x;
    }
    set pivotX(value: number)
    {
        this.innerTransform.pivot ??= new Vec2();
        this.innerTransform.pivot.x = value;

        this.pivot.x = value;
    }

    get pivotY(): number
    {
        return this.pivot.y;
    }
    set pivotY(value: number)
    {
        this.innerTransform.pivot ??= new Vec2();
        this.innerTransform.pivot.y = value;

        this.pivot.y = value;
    }

    // RETURNED this.texture!.width * this.totalScaleX; BEFORE
    // NOW THIS TO GET RID OF widthIncludingChildren get. 
    // THIS CAN BE HEAVY THOUGH, BETTER CACHE THE RESULT IF YOU NEED IT OFTEN
    get width(): number
    {
        return this.GetBoundsWithChildren(false).width;
    }

    get height(): number
    {
        return this.GetBoundsWithChildren(false).height;
    }

    private buildAncestorMatrix(m: MatrixStack)
    {
        var chain: GameObject[] = [];
        var obj: GameObject | null = this.parent;
        while (obj)
        {
            chain.push(obj);
            obj = obj.parent;
        }
        for (var i = chain.length - 1; i >= 0; i--)
            chain[i].ComposeChildSpaceMatrix(m.matrix, m.curWorldM, -1);
    }

    private cornersToRect(corners: {x: number, y: number}[]): Rectangle
    {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var c of corners)
        {
            minX = Math.min(minX, c.x);
            minY = Math.min(minY, c.y);
            maxX = Math.max(maxX, c.x);
            maxY = Math.max(maxY, c.y);
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    private getCorners(m: MatrixStack, x: number, y: number, w: number, h: number): {x: number, y: number}[]
    {
        return [
            m.localToWorld(x, y),
            m.localToWorld(x + w, y),
            m.localToWorld(x + w, y + h),
            m.localToWorld(x, y + h)
        ];
    }

    // local-space rect of this object's own drawn content, before pivot/transform. sprites use
    // their texture bounds; procedural objects (eg Button) override this so bounds, hit tests and
    // the transform tool see them the same way. null means "nothing of its own" (a container).
    GetLocalContentBounds(): Rectangle | null
    {
        return this.texture ? this.texture.localBounds : null;
    }

    // deepest visible child whose bounds contain pWorld, or this object itself, or null
    GetDeepestChildAt(pWorld: Vec2): GameObject | null
    {
        for (var i = this.children.length - 1; i >= 0; i--)
        {
            var child = this.children[i];

            if (!child.visible || !child.visibleInEditor)
                continue;

            var found = child.GetDeepestChildAt(pWorld);
            if (found)
                return found;
        }

        if (Helper.IsPointInRectangle(pWorld, this.GetBounds()))
            return this;

        return null;
    }

    GetBounds(global:boolean = true): Rectangle
    {
        const ownBounds = this.GetLocalContentBounds();
        if (!ownBounds)
            return this.GetBoundsWithChildren(global);

        var m = rapid.matrixStack;
        m.save();
        m.identity();

        // without the ancestors the corners are in parent space. the object's own transform is
        // always applied, so its rotation and inner transform count (also for root objects)
        if (global)
            this.buildAncestorMatrix(m);
        m.save();
        this.ComposeContentMatrix(m.matrix, m.curWorldM, -1);

        const bounds = ownBounds;
        var corners = this.getCorners(m, bounds.x, bounds.y, bounds.width, bounds.height);
        m.restore();
        
        m.restore();

        return this.cornersToRect(corners);
    }

    GetBoundsWithChildren(global:boolean = true, includeRootTransform:boolean = true): Rectangle
    {
        var minX = Infinity;
        var minY = Infinity;
        var maxX = -Infinity;
        var maxY = -Infinity;

        var m = rapid.matrixStack;
        m.save();
        m.identity();

        if (global)
            this.buildAncestorMatrix(m);

        var updateBounds = (obj: GameObject) => {
            const bounds = obj.GetLocalContentBounds();
            if (!bounds)
                return;

            if (bounds.width === 0 && bounds.height === 0)
                return;

            var corners = this.getCorners(m, bounds.x, bounds.y, bounds.width, bounds.height);

            for (var c of corners)
            {
                minX = Math.min(minX, c.x);
                minY = Math.min(minY, c.y);
                maxX = Math.max(maxX, c.x);
                maxY = Math.max(maxY, c.y);
            }
        };

        var recurse = (obj: GameObject, isRoot:boolean = false) => {
            m.save();
            const applyObjectTransform = !isRoot || includeRootTransform;

            // Object texture.
            m.save();
            if (applyObjectTransform)
                obj.ComposeContentMatrix(m.matrix, m.curWorldM, -1);
            else
                obj.ComposeInnerMatrix(m.matrix, m.curWorldM);
            updateBounds(obj);
            m.restore();

            // Child space.
            if (applyObjectTransform)
                obj.ComposeChildSpaceMatrix(m.matrix, m.curWorldM, -1);
            else
            {
                if (obj.childrenInheritInnerTransform)
                    obj.ComposeInnerMatrix(m.matrix, m.curWorldM);
                obj.MoveChildSpaceToPivot(m.matrix, m.curWorldM);
            }

            for (var child of obj.children)
                recurse(child);

            m.restore();
        };

        recurse(this, true);
        
        m.restore();

        if (minX === Infinity)
            return { x: 0, y: 0, width: 0, height: 0 };

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }
    
    GetCenterPosition(): Vec2
    {
        if (!this.texture)
            return new Vec2(0, 0);

        var leftTop = this.GetTopLeftPosition();
        var x = (leftTop.x + this.texture!.width * this.totalScaleX * .5);
        var y = (leftTop.y + this.texture!.height * this.totalScaleY * .5);

        return new Vec2(x, y);
    }

    GetTopLeftPosition(): Vec2
    {
        return new Vec2(
            this.x - this.pivot.x * this.totalScaleX,
            this.y - this.pivot.y * this.totalScaleY
        );
    }

    SetPosition(x: number, y: number): this
    {
        if (Number.isNaN(x) || Number.isNaN(y))
            trace('isNaN SetPosition')

        this.transform.position.set(x, y);

        return this;
    }

    SetScale(scale: number): this
    {
        this.transform.scale.x = scale;
        this.transform.scale.y = scale;

        this.OnResize();

        return this;
    }

    SetScaleXY(x: number, y: number): this
    {
        this.transform.scale.x = x;
        this.transform.scale.y = y;

        this.OnResize();

        return this;
    }

    SetScaleToReachDimensions(width: number, height: number, keepRatio: boolean = false): this
    {
        // TEXTURE CAN STILL BE LOADING
        if (!this.texture)
        {
            this.WhenTextureLoaded(() => this.SetScaleToReachDimensions(width, height, keepRatio));
            return this;
        }

        const scaleX = width / this.texture!.width;
        const scaleY = height / this.texture!.height;

        if (keepRatio)
        {
            const scale = Math.min(scaleX, scaleY);
            this.SetScaleXY(scale, scale);
        }
        else
            this.SetScaleXY(scaleX, scaleY);

        return this;
    }

    // CAN PASS IN PERCENTAGES TOO
    // THESE ARE RELATIVE TO THE SIZE OF THE TEXTURE, NOT THE SIZE OF THE GAMEOBJECT (INCLUDING CHILDREN)
    // MIGHT BE CONFUSING - TODO?
    SetPivot(x: number, y: number): this
    {
        if (!this.texture)
        {
            var xArg = x;
            var yArg = y;
            this.WhenTextureLoaded(() => this.SetPivot(xArg, yArg));
            // STILL CONTINUING,... TO SET PIVOT BEFOREHAND, SINCE MIGHT NEVER GET TEXTURE LOADED, EG FOR UI ELEMENTS
        }
        
        // OPTION TO PASS IN A PERCENTAGE
        if (x > 0 && x <= 1)
        {
            if (!this.texture)
            {
                x = x * this.width;
                //console.error("CANNOT SET PERCENTAGE ON A GAMEOBJECT WITHOUT A TEXTURE. LOAD IT FIRST");
                //return this;
            }
            else
                x = x * this.texture.width;
        }
        if (y > 0 && y <= 1)
        {
            if (!this.texture)
            {
                y = y * this.height;
                //console.error("CANNOT SET PERCENTAGE ON A GAMEOBJECT WITHOUT A TEXTURE. LOAD IT FIRST");
                //return this;
            }
            else
                y = y * this.texture.height;
        }

        this.pivot.x = x;
        this.pivot.y = y;

        // SET PIVOT OVERRIDES INNER PIVOT
        this.innerTransform.pivot = new Vec2(x, y);

        return this;
    }

    SetPivotWhileKeepingPosition(x: number, y: number): this
    {
        // keep the image's top-left where it was, in the space the position is in,
        // so scale, rotation and flips are accounted for
        const toPositionSpace = (world: Vec2) => this.parent ? this.parent.ToLocal(world) : world;

        const before = toPositionSpace(this.ContentToGlobal(new Vec2(), false));
        this.SetPivot(x, y);
        const after = toPositionSpace(this.ContentToGlobal(new Vec2(), false));

        this.SetPosition(this.x + before.x - after.x, this.y + before.y - after.y);

        return this;
    }

    // COLOR DECIDES ALPHA AS WELL
    // SO IT CAN OVERRIDE, EG IF ALPHA IS .5, YOU SET COLOR TO COLOR.WHITE, ALPHA IS NOW 1 - TODO?
    SetColor(color: Color | string): this
    {
        if(typeof color === 'string')
            this.color = Color.fromHex(color);
        else
            this.color.setRGBA(color.r, color.g, color.b, color.a);

        return this;
    }

    SetAlpha(alpha: number): this
    {
        this.color.a = alpha * 255;
        return this;
    }

    SetInnerScale(scale: number): this
    {
        this.innerTransform.scale.x = scale;
        this.innerTransform.scale.y = scale;

        return this;
    }

    SetRotation(rotation: number): this
    {
        this.rotation = rotation;
        return this;
    }

    CenterPivot(): this
    {
        return this.SetPivot(.5, .5);
    }

    CenterInnerPivot(): this
    {
        return this.SetInnerPivot(.5, .5);
    }

    // Inner pivot anchors the inner transform (sprite-only squash/rotate/etc.).
    // Raw texture units; when unset the sprite uses the outer pivot.
    SetInnerPivot(x: number, y: number): this
    {
        if (!this.texture)
        {
            var xArg = x;
            var yArg = y;
            this.WhenTextureLoaded(() => this.SetInnerPivot(xArg, yArg));
            // STILL CONTINUING,... TO SET PIVOT BEFOREHAND, SINCE MIGHT NEVER GET TEXTURE LOADED, EG FOR UI ELEMENTS
        }
        
        // OPTION TO PASS IN A PERCENTAGE
        if (x > 0 && x <= 1)
        {
            if (!this.texture)
            {
                x = x * this.width;
                //console.error("CANNOT SET PERCENTAGE ON A GAMEOBJECT WITHOUT A TEXTURE. LOAD IT FIRST");
                //return this;
            }
            else
                x = x * this.texture.width;
        }
        if (y > 0 && y <= 1)
        {
            if (!this.texture)
            {
                y = y * this.height;
                //console.error("CANNOT SET PERCENTAGE ON A GAMEOBJECT WITHOUT A TEXTURE. LOAD IT FIRST");
                //return this;
            }
            else
                y = y * this.texture.height;
        }

        this.innerTransform.pivot ??= new Vec2();
        this.innerTransform.pivot.x = x;
        this.innerTransform.pivot.y = y;

        return this;
    }

    FlipX(): this
    {
        this.scale.x *= -1;
        return this;
    }

    FlipY(): this
    {
        this.scale.y *= -1;
        return this;
    }
    
    SetName(name: string): this
    {
        this.name = name;
        return this;
    }

    
    /*applyWorldMatrix(m: typeof rapid.matrixStack)
    {
        m.translate(this.position.x, this.position.y);

        if (this.rotation !== 0)
            m.rotate(this.rotation);

        if (this.scale.x !== 1 || this.scale.y !== 1)
            m.scale(this.scale.x, this.scale.y);
    }

    ToGlobal(localPoint: Vec2 = new Vec2()): Vec2
    {
        const m = rapid.matrixStack;

        m.pushMat();
        this.applyWorldMatrix(m);
        const out = m.apply(localPoint) as Vec2;
        m.popMat();

        return out;
    }*/

    // Convert a point from this object's child space (where child.SetPosition(x, y) operates: (0, 0) is
    // the texture's top left, or the pivot with childrenAtPivot) to world space. The inverse of ToLocal().
    ToGlobal(localPoint: Vec2 = new Vec2()): Vec2
    {
        const m = rapid.matrixStack;
        m.save();
        m.identity();

        this.buildAncestorMatrix(m);
        this.ComposeChildSpaceMatrix(m.matrix, m.curWorldM, -1);

        const {x, y} = m.localToWorld(localPoint.x, localPoint.y);

        m.restore();

        return new Vec2(x, y);
    }

    // Convert a point in this object's texture space ((0, 0) is the texture's top left, in texture
    // pixels) to world space, eg a hitbox corner. Pass true/false to include/exclude the inner transform.
    ContentToGlobal(localPoint: Vec2 = new Vec2(), includeInnerTransform: boolean = this.childrenInheritInnerTransform): Vec2
    {
        const m = rapid.matrixStack;
        m.save();
        m.identity();

        this.buildAncestorMatrix(m);
        if (includeInnerTransform)
            this.ComposeContentMatrix(m.matrix, m.curWorldM, -1);
        else
            this.ComposeOuterMatrix(m.matrix, m.curWorldM, -1);

        const {x, y} = m.localToWorld(localPoint.x, localPoint.y);
        
        m.restore();
        
        return new Vec2(x, y);
    }

    // Convert a world point to the outer-transform space.
    // Unlike ToLocal(), this excludes the pivot and inner transform.
    ToOuterLocal(globalPoint: Vec2): Vec2
    {
        const m = rapid.matrixStack;
        m.save();
        m.identity();

        this.buildAncestorMatrix(m);
        this.ApplyTransformToMatrixStack(this.transform);

        const {x, y} = m.worldToLocal(globalPoint.x, globalPoint.y);

        m.restore();

        return new Vec2(x, y);
    }

    // Convert a world point to this object's child space
    // (the space where child.SetPosition(x, y) operates).
    ToLocal(globalPoint: Vec2): Vec2
    {
        const m = rapid.matrixStack;
        m.save();
        m.identity();
        
        this.buildAncestorMatrix(m);
        this.ComposeChildSpaceMatrix(m.matrix, m.curWorldM, -1);
        
        const {x, y} = m.worldToLocal(globalPoint.x, globalPoint.y);
        
        m.restore();
        
        return new Vec2(x, y);
    }

    BringToFront()
    {
        if (this.parent)
        {
            const idx = this.parent.children.indexOf(this);
            if (idx !== -1)
            {
                this.parent.children.splice(idx, 1);
                this.parent.children.push(this);
            }
        }
        else
        {
            this.scene.object.BringToFront(this);
        }
    }

    BringToBack()
    {
        if (this.parent)
        {
            const idx = this.parent.children.indexOf(this);
            if (idx !== -1)
            {
                this.parent.children.splice(idx, 1);
                this.parent.children.unshift(this);
            }
        }
        else
        {
            this.scene.object.BringToBack(this);
        }
    }

    // A GAMEOBJECT INSTANCE IS RETURNED AS ITS OWN TYPE, SAME AS Scene.AddGameObject()
    AddChild<T extends GameObject>(gameObject: T): T;
    AddChild<T extends GameObject = GameObject>(input?: NonNullable<T["entity"]> | string | GameObject | (new (...args: any[]) => T) | Texture): T;
    AddChild<T extends GameObject = GameObject>(input?: NonNullable<T["entity"]> | string | GameObject | (new (...args: any[]) => T) | Texture): T
    {
        // RESET CACHED VALUES SO THEY GET RECALCULATED
        //this.cachedChildrenWidth = -1;
        //this.cachedChildrenHeight = -1;

        return this.scene.AddGameObject<T>(input, this);
    }

    RemoveChild(child: GameObject)
    {
        if (!child.parent)
        {
            console.error("Trying to remove child that doesn't have a parent");
            return;
        }
        if (child.parent != this)
        {
            console.error("Trying to remove child that doesn't belong to this parent");
            return;
        }
        
        // RESET CACHED VALUES SO THEY GET RECALCULATED
        //this.cachedChildrenWidth = -1;
        //this.cachedChildrenHeight = -1;

        /*if (!child.pooled)
        {
            child.parent = null;
            this.children.splice(this.children.indexOf(child), 1);
        }
        else*/
        {
            this.scene.RemoveGameObject(child);
        }
    }

    RemoveFromParent()
    {
        if (this.parent)
            this.parent.RemoveChild(this);
    }
    
    RemoveChildren()
    {
        for (var i = this.children.length - 1; i >= 0; i--)
        {
            this.RemoveChild(this.children[i]);
        }
        
        this.children = [];
    }
    
    MoveChild(child: GameObject, toParent: GameObject)
    {


    }

    // EG: GetChildByName<TextObject>("score").SetText("0")
    GetChildByName<T extends GameObject = GameObject>(name: string): T | null
    {
        for (var i = 0; i < this.children.length; i++)
        {
            if (this.children[i].name == name)
                return this.children[i] as T;
        }
        
        return null;
    }

    ResetValues(): this
    {
        //this.onDestroy?.bind(this);
        //this.onDestroy = null;

        this.name = "";
        this.pluginName = "";
        this.layer = "";
        this.texture = null;
        this.persistent = false;
        this.pooled = false;
        this.save = false;
        this.started = false;
        this.color.setRGBA(255, 255, 255, 255);
        this.active = true;
        this.visible = true;
        this.visibleInEditor = true;
        this._tags = null;
        this.tapHitbox = null;
        this.revertPivotOnSave = false;
        this.resizeable = true;

        this.entity = null;
        
        this.startPosition.set(0);

        this.transform.Reset();
        this.innerTransform.Reset();
        this.childrenInheritInnerTransform = true;
        this.childrenAtPivot = GameObject.childrenAtPivotDefault;
        this.renderParentTransform = null;

        this._OnTextureLoadedCallbacks = null;

        this._customData = null;

        this._events?.clearAll();

        this.RemoveMask();

        this.SetPivot(0, 0);
        this.RemoveShaders();
        this.RemoveChildren();

        return this;
    }

    AddShader<T extends Shader, TArgs extends any[]>(shaderClass: new (...args: TArgs) => T, ...args: TArgs): T;
    AddShader<T extends Shader>(shaderInstance: T): T;
    AddShader<T extends Shader, TArgs extends any[]>(arg: (new (...args: TArgs) => T) | T, ...args: TArgs): T
    {
        var shaderInst = typeof arg === "function" ? new arg(...args) : arg;

        // ONE SHADER PER CLASS: A NEW ONE REPLACES THE OLD, SO EG A FLASH ON EVERY HIT RESTARTS INSTEAD OF STACKING
        const i = this.shaders.findIndex(shader => shader.constructor === shaderInst.constructor);
        if (i !== -1)
            this.shaders[i] = shaderInst;
        else
            this.shaders.push(shaderInst);

        return shaderInst;
    }

    HasShader<T extends Shader>(shaderClass: new (...args: any[]) => T): boolean
    {
        return this.shaders.some(shader => shader instanceof shaderClass);
    }

    RemoveShader<T extends Shader>(shaderClass: new (...args: any[]) => T): T | null
    {
        const i = this.shaders.findIndex(shader => shader instanceof shaderClass);

        if (i !== -1)
            return this.shaders.splice(i, 1)[0] as T;

        return null;
    }
    
    RemoveShaders()
    {
        this._shaders = null;
    }
    
    Remove(clear:boolean = true)
    {
        /*if (this.parent)
        {
            this.parent.RemoveChild(this);
            this.parent = null;
            return;
        }*/

        this.scene.RemoveGameObject(this, clear);
    }
}
