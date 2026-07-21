import type { Component } from "../controllers/componentController";
import { assetsHandler } from "../handlers/assetsHandler";
import mitt from "../libraries/mitt";
import { Color, MaskType, MatrixStack, Texture, Vec2 } from "../libraries/new-rapid-render";
import type { Scene } from "../scenes/scene";
import type { ComponentCtor, Ctor, DropFirst, Events, Rectangle, Shader } from "../types/bareTypes";
import { Entity, entityVarsNested, GameObjectClass, RefreshEntityVars } from '../types/bareTypes';
import { Hitbox } from '../types/hitbox';
import { getOwnSaveFieldNames, InspectorField, Percentage, Save } from "../utils/decorators";
import { Helper } from '../utils/helper';

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

    static gameObjectCounter = -1; // ONE BACK TO NOT COUNT THE DUMMY GAMEOBJECT INSTANCED IN BAREGAME
 
    scene: Scene;

    name:string;
    pluginName:string;
    uniqueID:string = "";

    active:boolean = true;
    texture: Texture | null;
    
    shaders: Shader[] = [];
    private mask: GameObject | null = null;
    private maskType: MaskType = MaskType.EQUAL;

    transform: Transform = new Transform();
    innerTransform: Transform = new Transform();

    children: Array<GameObject> = [];
    parent: GameObject | null = null;

    addedToLevel:boolean = false;
    started:boolean = false;
    pooled:boolean = false;
    revertPivotOnSave: boolean = false; // TODO

    resizeable: boolean = true;

    tapHitbox: Hitbox | null = null; // PHASE THIS OUT, MAKE INTO COMPONENT? TODO
  
    startPosition = new Vec2();

    texturePromise: Promise<Texture> | null = null;

    private renderParentTransform: Float32Array | null = null;

    levelEntity: Entity | null = null; 
    entity: Entity | null = null; 
    
    visibleInEditor:boolean = true;

    OnTextureLoadedCallbacks: Function[] = [];

    events = mitt<Events>();

    private imagePath: string = "";

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
        
        if (texturePath != "")
        {
            this.Init(texturePath);
        }
    }
 
    // ONLY FOR PLUGIN - MOVE - TODO
    static RegisterGameObject(cls: GameObjectClass, defaultPoolSize: number = 1): void
    {
        // bare.AddClass redefined cls.name to the true source name, so read it directly.
        const className = cls.name;
        const alreadyRegistered = !!GameObject.registeredGameObjects[className];

        if (!alreadyRegistered)
        {
            GameObject.registeredGameObjects[className] = cls;
        }

        GameObject.RegisterEntityVars(cls);
    }

    static RegisterEntityVars(cls: any): void
    {
        const className = cls.name;

        // ADD FIELDS EXPLICITLY MARKED FOR SERIALIZATION TO entityVarsNested.
        // @InspectorField ONLY CONTROLS EDITOR EXPOSURE, AS IT DOES FOR COMPONENTS.
        // MAKE THIS ALSO WORK WITH INHERITANCE OF MULTIPLE CUSTOM CLASSES - TODOR
        var vars = getOwnSaveFieldNames(cls);
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

    OnPointerDown(callback = null)
    {
        if (this.scene)
        {
            this.scene.OnPointerDown(this, callback);
        }
    }

    OnPointerUp(callback = null)
    {
        if (this.scene)
        {
            this.scene.OnPointerUp(this, callback);
        }
    }

    OnPointerEnter(callback = null)
    {
        if (this.scene)
        {
            this.scene.OnPointerEnter(this, callback);
        }
    }

    OnPointerLeave(callback = null)
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
        // OVERRIDE
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
                    o.scene.AddGameObject(childEntity, o);
                }
            },
            components: (o, v) => {
                for (const component in v)
                {
                    const className = Helper.CapitalizeFirstLetter(component) + "Component";
                    var ComponentClass = bare.componentClasses[className];
                    if (!ComponentClass)
                    {
                        console.error('Component class not found: ' + className + '. Add it with bareEngine.AddClass(' + Helper.CapitalizeFirstLetter(component) + 'Component);');
                        return;
                    }
                    var componentValues = v[component];
                    var componentInstance = new ComponentClass(o.scene);
                    for (const key in componentValues)
                    {
                        componentInstance[key] = componentValues[key];
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

    SetStartPosition(x: number, y: number)
    {
        this.startPosition.x = x;
        this.startPosition.y = y;
    }

    async Init(texturePath: string): Promise<void> 
    {
        var split = texturePath.split("/");
        this.name = split[split.length - 1]; //

        this.SetStartPosition(this.x, this.y);

        await this.InitTexture(texturePath);
    }

    async InitTexture(texturePath: string):Promise<Texture>
    {
        if (texturePath.endsWith("NONE"))
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

        if (this.texture != window.redPixelTexture) // redPixelTexture MEANS IT'S NOT FOUND
        {
            var onTextureLoadedCallbacksCached = this.OnTextureLoadedCallbacks;
            this.OnTextureLoadedCallbacks = [];
            
            for (var i = 0; i < onTextureLoadedCallbacksCached.length; i++)
            {
                onTextureLoadedCallbacksCached[i]();
            }
        }

        return this;
    }

    WhenTextureLoaded(callback: () => void)
    {
        if (this.texture && this.texture != window.redPixelTexture)
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
        this.addedToLevel = true;
        this.OnAdded();
    }

    OnAdded()
    {
        // FOR OVERRIDE
    }

    Removed()
    {
        this.addedToLevel = false;
        this.started = false;
        this.OnRemoved();
    }

    OnRemoved()
    {
        // FOR OVERRIDE
    }

    OnResize()
    {
        // FOR OVERRIDE
    }

    Update(deltaTime: number)
    {
        if (!this.active)
            return;

        this.OnUpdate(deltaTime);

        for (var child of this.children)
        {
            child.Update(deltaTime);
        }
    }

    FixedUpdate(fixedDeltaTime: number)
    {
        if (!this.active)
            return;

        this.OnFixedUpdate(fixedDeltaTime);

        for (var child of this.children)
        {
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

    }

    /** @virtual */
    Render(inheritedColor?: Color)
    {
        inheritedColor = inheritedColor ? Helper.MultiplyColors(inheritedColor, this.color) : this.color;

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
        for (var i = this.shaders.length - 1; i >= 0; i--)
        {
            var shader = this.shaders[i];

            if (shader.Update)
            {
                var remove = shader.Update(this);
                if (remove)
                    this.shaders.splice(i, 1);
            }
        }

        rapid.matrixStack.save();
        
        if (this.mask)
            this.renderParentTransform = rapid.matrixStack.getTransform();
        
        this.ApplyTransformToMatrixStack(this.transform);
        this.RenderTransformed(inheritedColor);

        rapid.matrixStack.save();
        this.ApplyChildTransform();

        // Render children with inherited color
        for (var i = 0; i < this.children.length; i++)
        {
            this.children[i].Render(inheritedColor);
        }

        rapid.matrixStack.restore();

        rapid.matrixStack.restore();
        
        this.OnRender(inheritedColor);
    }

    // pos / rot / scale only. Pivot is applied separately at the content boundary:
    // children use transform.pivot, the sprite uses innerPivot (see RenderSprite / GetBounds).
    ApplyTransformToMatrixStack(transform: Transform)
    {
        this.applyTransform(rapid.matrixStack, transform);
    }

    // Establishes the space children render in, relative to this object's already-applied
    // outer transform. By default children are anchored at the outer pivot (the same origin
    // the sprite content starts from), but NOT the inner transform. Override to fold the inner
    // transform in as well, so children track the sprite's inner squash / flip / rotate.
    protected ApplyChildTransform()
    {
        rapid.matrixStack.translate(-this.pivot.x, -this.pivot.y);
    }

    protected ApplyInnerTransformToMatrixStack()
    {
        this.applyInnerTransform(rapid.matrixStack, this);
    }

    public RenderTransformed(inheritedColor?: Color)
    {
        if (!this.texture)
            return;

        rapid.matrixStack.save();

        // Sprite is anchored at the OUTER pivot; the inner transform pivots around the inner pivot.
        rapid.matrixStack.translate(-this.pivot.x, -this.pivot.y);
        this.applyInnerTransform(rapid.matrixStack, this);

        if (this.texture)
            this.RenderSprite(inheritedColor);

        rapid.matrixStack.restore();
    }

    OnRender(inheritedColor?: Color)
    {
        // FOR OVERRIDE
    }

    PostRender()
    {
        if (!this.visible)
            return;
        
        if (window.debug)
        {
            // OUTER PIVOT / ORIGIN — BLACK CIRCLE (world space so nested children draw correctly)
            var originWorld = this.ToGlobal(this.pivot);
            rapid.matrixStack.save();
            rapid.matrixStack.translate(originWorld.x, originWorld.y);
            rapid.drawCircle({
                radius: 4 * this.scene.ScreenPxToWorldScale(),
                color: new Color(0, 0, 0, 255),
                segments: 16,
            });

            rapid.matrixStack.restore();

            // INNER PIVOT — SLIGHTLY SMALLER WHITE CIRCLE
            var innerPivotWorld = this.ToGlobal(this.innerPivot, true);
            rapid.matrixStack.save();
            rapid.matrixStack.translate(innerPivotWorld.x, innerPivotWorld.y);
            rapid.drawCircle({
                radius: 2 * this.scene.ScreenPxToWorldScale(),
                color: new Color(255, 255, 255, 255),
                segments: 16,
            });
            rapid.matrixStack.restore();
        }

        this.OnPostRender();

        // RECURSE SO CHILDREN (AND THEIR DEBUG VISUALS) ALSO POST-RENDER
        for (var i = 0; i < this.children.length; i++)
        {
            this.children[i].PostRender();
        }
    }

    OnPostRender()
    {
        // FOR OVERRIDE
    }

    RenderSprite(color?: Color)
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

        if (this.shaders.length > 0)
        {
            const glShaders = this.shaders.map(shader => shader.shader);
            texture = rapid.applyFilters(this.texture, glShaders);
        }

        rapid.drawSprite({
            texture: texture,
            color: renderColor,
            position: new Vec2(0, 0),
        });

        if (this.mask)
        {
            //rapid.clearMask();
            rapid.exitMask()
        }
    }

    SetMask(mask: GameObject, type: MaskType = MaskType.EQUAL)
    {
        this.mask = mask;
        this.maskType = type;

        this.mask.visible = false;
    }

    RemoveMask()
    {
        if (!this.mask)
            return;

        this.mask.visible = true;
        this.mask = null;
    }

    @InspectorField @Save
    get position(): Vec2
    {
        return this.transform.position;
    }
    set position(vec2: Vec2)
    {
        this.SetPosition(vec2.x, vec2.y);
    }

    @InspectorField @Save
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
    @InspectorField @Save
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
    @InspectorField @Save
    get pivot(): Vec2
    {
        return this.transform.pivot ??= new Vec2();
    }
    set pivot(v: Vec2)
    {
        this.transform.pivot = v;
    }

    @InspectorField @Save
    get innerPosition(): Vec2
    {
        return this.innerTransform.position;
    }
    set innerPosition(vec2: Vec2)
    {
        this.innerTransform.position.x = vec2.x;
        this.innerTransform.position.y = vec2.y;
    }

    @InspectorField @Save
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

    @InspectorField @Save
    get innerRotation(): number
    {
        return this.innerTransform.rotation;
    }
    set innerRotation(value: number)
    {
        this.innerTransform.rotation = value;
    }

    // INNER pivot — anchor for the sprite's inner transform. Inherits the outer pivot until set
    @InspectorField @Save
    get innerPivot(): Vec2
    {
        return this.innerTransform.pivot ??= new Vec2(this.pivot.x, this.pivot.y);
    }
    set innerPivot(v: Vec2)
    {
        (this.innerTransform.pivot ??= new Vec2()).set(v.x, v.y);
    }

    @InspectorField @Save @Percentage
    get alpha(): number
    {
        return this.color.a / 255;
    }
    set alpha(value: number) // THIS ONLY HAS EFFECT OVER THE TEXTURE, NOT ANYTHING RENDERED BY USER (GRAPHIC/TEXTURE) IN OnRender() - TODO?
    {
        value = Math.min(Math.max(value, 0), 1);
        this.color.a = value * 255;
    }

    @InspectorField @Save
    visible:boolean = true;

    @InspectorField @Save
    color:Color = new Color(255, 255, 255, 255);

    @InspectorField @Save
    get flipped(): boolean
    {
        return this.transform.flipped;
    }
    set flipped(value: boolean)
    {
        this.transform.flipped = value;
    }

    @InspectorField @Save
    get innerFlipped(): boolean
    {
        return this.innerTransform.flipped;
    }
    set innerFlipped(value: boolean)
    {
        this.innerTransform.flipped = value;
    }

    @InspectorField @Save
    customName: string = "";

    @InspectorField @Save
    persistent: boolean = false;

    @InspectorField @Save
    save: boolean = false;

    @InspectorField @Save
    tags:Array<string> = [];

    @InspectorField @Save
    customData: Record<string, any> = {};

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
        this.pivot.x = value;
    }

    get pivotY(): number
    {
        return this.pivot.y;
    }
    set pivotY(value: number)
    {
        this.pivot.y = value;
    }

    get width(): number
    {
        if (!this.texture)
        {
            return 0;
        }

        return this.texture!.width * this.totalScaleX;
    }

    get height(): number
    {
        if (!this.texture)
        {
            return 0;
        }

        return this.texture!.height * this.totalScaleY;
    }

    get widthIncludingChildren()
    {
        // COMMENTED OUT, TOO HARD TO CATCH ALL CASES OF CHILDREN
        //if (this.cachedChildrenWidth != -1)
        //    return this.cachedChildrenWidth;
        
        //this.cachedChildrenWidth = computedWidth;

        return this.GetBoundsWithChildren().width;
    }

    get heightIncludingChildren()
    {
        // COMMENTED OUT, TOO HARD TO CATCH ALL CASES OF CHILDREN
        //if (this.cachedChildrenHeight != -1)
        //    return this.cachedChildrenHeight;

        //this.cachedChildrenHeight = computedHeight;

        return this.GetBoundsWithChildren().height;
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
        {
            var ancestor = chain[i];
            this.applyTransform(m, ancestor.transform);
            m.translate(-ancestor.pivot.x, -ancestor.pivot.y);
        }
    }

    private applyTransform(m: MatrixStack, t: Transform)
    {
        m.translate(t.position.x, t.position.y);
        m.rotate(t.rotation * (Math.PI / 180));
        m.scale(t.scale.x * (t.flipped ? -1 : 1), t.scale.y);
    }

    private applyInnerTransform(m: MatrixStack, obj: GameObject)
    {
        var pivot = obj.innerPivot;
        m.translate(pivot.x, pivot.y);
        this.applyTransform(m, obj.innerTransform);
        m.translate(-pivot.x, -pivot.y);
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

    private getCorners(m: MatrixStack, px: number, py: number, w: number, h: number): {x: number, y: number}[]
    {
        return [
            m.localToWorld(px, py),
            m.localToWorld(w, py),
            m.localToWorld(w, h),
            m.localToWorld(px, h)
        ];
    }

    GetBounds(global:boolean = true): Rectangle
    {
        if (!this.texture)
            return this.GetBoundsWithChildren(global);

        if (!global || !this.parent)
        {
            return {
                x: this.x - this.pivot.x * this.totalScaleX,
                y: this.y - this.pivot.y * this.totalScaleY,
                width: this.texture!.width * this.totalScaleX,
                height: this.texture!.height * this.totalScaleY
            };
        }

        var m = rapid.matrixStack;
        m.save();
        m.identity();
        
        this.buildAncestorMatrix(m);
        this.applyTransform(m, this.transform);

        m.save();
        m.translate(-this.pivot.x, -this.pivot.y);
        this.applyInnerTransform(m, this);

        var corners = this.getCorners(m, 0, 0, this.texture!.width, this.texture!.height);
        m.restore();
        
        m.restore();

        return this.cornersToRect(corners);
    }

    GetBoundsWithChildren(global:boolean = true): Rectangle
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
            var ow = 0, oh = 0;
            if (obj.texture)
            {
                ow = obj.texture.width;
                oh = obj.texture.height;
            }
            else
            {
                ow = obj.width;
                oh = obj.height;
            }
            if (ow === 0 && oh === 0) return;

            var corners = this.getCorners(m, 0, 0, ow, oh);

            for (var c of corners)
            {
                minX = Math.min(minX, c.x);
                minY = Math.min(minY, c.y);
                maxX = Math.max(maxX, c.x);
                maxY = Math.max(maxY, c.y);
            }
        };

        var recurse = (obj: GameObject) => {
            m.save();
            this.applyTransform(m, obj.transform);

            m.save();
            m.translate(-obj.pivot.x, -obj.pivot.y);
            this.applyInnerTransform(m, obj);
            updateBounds(obj);
            m.restore();

            m.translate(-obj.pivot.x, -obj.pivot.y);
            for (var child of obj.children)
                recurse(child);

            m.restore();
        };

        recurse(this);
        
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

    SetScaleToReachDimensions(width: number, height: number): this
    {
        this.SetScaleXY(width / this.texture!.width, height / this.texture!.height);
        return this;
    }

    // CAN PASS IN PERCENTAGES TOO
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

        return this;
    }

    SetPivotWhileKeepingPosition(x: number, y: number): this
    {
        const oldPivot = new Vec2(this.pivot.x, this.pivot.y);
        this.SetPivot(x, y);
        this.SetPosition(this.x + this.pivot.x - oldPivot.x, this.y + this.pivot.y - oldPivot.y);

        return this;
    }

    SetColor(color: Color | string): this
    {
        if(typeof color === 'string')
            this.color = Color.fromHex(color);
        else
            this.color.setRGBA(color.r, color.g, color.b, color.a);

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

    // Convert a point from this object's child space to world space.
    // Pass includeInnerTransform to convert from texture space instead (the space the sprite is rendered in).
    ToGlobal(localPoint: Vec2 = new Vec2(), includeInnerTransform: boolean = false): Vec2
    {
        const m = rapid.matrixStack;
        m.save();
        m.identity();

        this.buildAncestorMatrix(m);
        this.applyTransform(m, this.transform);

        m.translate(-this.pivot.x, -this.pivot.y);

        if (includeInnerTransform)
            this.applyInnerTransform(m, this);

        const {x, y} = m.localToWorld(localPoint.x, localPoint.y);
        
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
        this.applyTransform(m, this.transform);
        m.translate(-this.pivot.x, -this.pivot.y);
        
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

    AddChild(input?: Entity | string | GameObject | GameObjectClass | Texture): GameObject
    {
        // RESET CACHED VALUES SO THEY GET RECALCULATED
        //this.cachedChildrenWidth = -1;
        //this.cachedChildrenHeight = -1;

        if (input instanceof GameObject)
        {
            // REMOVE GameObject FROM ITS PARENT OR SCENE FIRST
            input.Remove(false); // DON'T WANT TO CLEAR!

            // THEN ADD IT AS NEW CHILD
            var child = input;
            child.parent = this;
            this.children.push(child);

            return child;
        }
        else
        {
            // NO GameObject SUPPLIED, A NEW one WILL BE CREATED AND ADDED (FROM POOL)
            return this.scene.AddGameObject(input, this);
        }
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

        if (!child.pooled)
        {
            child.parent = null;
            this.children.splice(this.children.indexOf(child), 1);
        }
        else
        {
            this.scene.RemoveGameObject(child, this);
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

    GetChildByName(name: string)
    {
        for (var i = 0; i < this.children.length; i++)
        {
            if (this.children[i].name == name)
                return this.children[i];
        }
        
        return null;
    }

    ResetValues(): this
    {
        //this.onDestroy?.bind(this);
        //this.onDestroy = null;

        this.name = "";
        this.pluginName = "";
        this.texture = null;
        this.persistent = false;
        this.pooled = false;
        this.save = false;
        this.started = false;
        this.color.setRGBA(255, 255, 255, 255);
        this.active = true;
        this.visible = true;
        this.visibleInEditor = true;
        this.tags = [];
        this.customName = "";
        this.tapHitbox = null;
        this.revertPivotOnSave = false;
        this.resizeable = true;

        this.entity = null;
        
        this.startPosition.set(0);

        this.transform.Reset();
        this.innerTransform.Reset();
        this.renderParentTransform = null;

        this.OnTextureLoadedCallbacks = [];

        this.customData = {};

        this.events.clearAll();

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
        this.shaders = [];
    }
    
    Remove(clear:boolean = true)
    {
        /*if (this.parent)
        {
            this.parent.RemoveChild(this);
            this.parent = null;
            return;
        }*/

        this.scene.RemoveGameObject(this, this.parent || undefined, clear);
    }

    OnRemove()
    {
        // FOR OVERRIDE
    }
}
