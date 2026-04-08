import { assetsHandler } from "../handlers/assetsHandler";
import { Hitbox } from '../types/hitbox';
import { Entity, GameObjectClass } from '../types/bareTypes';
import { Helper } from '../utils/helper';
import { MakePath, MakePathForEntity, Scene } from '../main';
import { Vec2, Texture, Color, GLShader, Uniform, MaskType, MatrixStack } from "../libraries/rapid-render";
import type { Component, Ctor, Rectangle } from "../types/bareTypes";

export class Transform {
    position = new Vec2();
    scale = new Vec2(1, 1);
    rotation = 0;
    flipped = false;

    Reset()
    {
        this.position = new Vec2();
        this.scale = new Vec2(1, 1);
        this.rotation = 0;
        this.flipped = false;
    }
}

export class GameObject
{
    static gameObjectCounter = -1; // ONE BACK TO NOT COUNT THE DUMMY GAMEOBJECT INSTANCED IN BAREGAME
 
    scene: Scene;

    name:string;
    pluginName:string;
    customName: string = "";
    uniqueID:string = "";
    pivot:Vec2 = new Vec2();
    pivotBasedOnHitbox:Vec2 = new Vec2();
    visible:boolean = true;
    persistent: boolean = false;
    save: boolean = false;
    tags:Array<string> = [];
    texture: Texture | null;
    color:Color = new Color(255, 255, 255, 255);
    shader: GLShader | undefined;
    uniforms: Uniform | undefined;
    shaders: any[] = [];
    private mask: GameObject | null = null;
    private maskType: MaskType = MaskType.Include;

    transform: Transform = new Transform();
    innerTransform: Transform = new Transform();

    children: Array<GameObject> = [];
    parent: GameObject | null = null;

    addedToLevel:boolean = false;
    pooled:boolean = false;
    revertPivotOnSave: boolean = false; // TODO

    tapHitbox: Hitbox | null = null; // PHASE THIS OUT, MAKE INTO COMPONENT? TODO
    hitboxColor:Color = new Color(255,255,255,80); // ^

    startPosition = new Vec2();

    texturePromise: Promise<Texture> | null = null;

    private renderParentTransform: Float32Array | null = null;

    levelEntity: Entity | null = null; 
    entity: Entity | null = null; 
    
    visibleInEditor:boolean = true;

    customData: Record<string, any> = {};

    //onDestroy:Function | null = null;

    //private cachedChildrenWidth: number = -1;
    //private cachedChildrenHeight: number = -1;

    //levelEditorAlpha: number = 1; // BIT HACKY VAR TO FADE OUT OBJECTS IN EDITOR BUT NOT ADJUST ACTUALY ALPHA VALUES (HAVE TO STAY IN INTACT FOR SAVING)
    
    constructor(scene: Scene, x:number = 0, y:number = 0, texturePath: string = "")
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
    AddComponent<T extends Component<this>>(componentClass: Ctor<T>): T;
    AddComponent<T extends Component<this>>(componentInstance: T): T;
    AddComponent<T extends Component<this>>(arg: Ctor<T> | T): T
    {
        var componentController = this.scene.Get("componentController"); // NO HARD REF TO COMPONENTCONTROLLER ON PURPOSE

        if (componentController)
            return componentController.AddComponent(this, arg);
        else
        {
            console.error("ComponentController not registered. Call bare.AddClass(ComponentController) at Awake() of your game.");
            return (typeof arg === "function" ? new arg() : arg);
        }
    }

    GetComponent<T extends Component<this>>(componentClass: Ctor<T>): T | null
    {
        var componentController = this.scene.Get("componentController");

        if (componentController)
            return componentController.GetComponent(this, componentClass);
        else
        {
            console.error("ComponentController not registered. Call bare.AddClass(ComponentController) at OnAwake() of your game.");
            return null;
        }
    }

    get components(): Array<Component<this>> { 
        return this.scene.Get("componentController").GetComponentsFrom(this); 
    }
    
    RemoveComponent<T extends Component<this>>(componentClass: Ctor<T>): boolean;
    RemoveComponent<T extends Component<this>>(componentInstance: T): boolean;
    RemoveComponent<T extends Component<this>>(arg: Ctor<T> | T): boolean
    {
        var componentController = this.scene.Get("componentController");

        if (componentController)
            return componentController.RemoveComponent(this, arg);
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
        const cached = assetsHandler.GetTexture(texturePath);
        if (cached)
        {
            this.SetTexture(cached);
            return cached;
        }

        this.texturePromise = assetsHandler.GetTexturePromise(texturePath);
        const tex = await this.texturePromise;
        this.SetTexture(tex);
        this.texturePromise = null;

        return tex;
    }

    WhenTextureLoaded(callback: () => void)
    {
        if (this.texturePromise != null)
        {
            this.texturePromise.then(() => callback());
        }
        else
        {
            if (!this.texture && this.entity) // HORRID, TODO, ALWAYS LOAD TEXURE BEFORE?
            {
                var tex = assetsHandler.GetTexture(MakePathForEntity(this.entity));
                if (tex)
                {
                    this.SetTexture(tex);
                    callback();
                }
                else
                {
                    assetsHandler.GetTexturePromise(MakePathForEntity(this.entity)).then(tex => {
                        this.SetTexture(tex);
                        callback();
                    });
                }
            }
            else 
                callback();
        }
    }

    SetTexture(texture:Texture): GameObject
    {
        this.texture = texture;

        return this;
    }

    OnAwake()
    {
        // FOR OVERRIDE
    }

    Added()
    {
        this.addedToLevel = true;
    }

    Removed()
    {
        this.addedToLevel = false;
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
        if (bareEngine.levelEditorOpen)
        {
            if (!this.visibleInEditor)
                return;
            
            // STILL RENDERS EVEN IF VISIBLE IS FALSE IN EDITOR 
        }
        else
        if (!this.visibleInEditor || !this.visible || this.alpha == 0 || this.scale.x == 0 || this.scale.y == 0 || this.innerScale.x == 0 || this.innerScale.y == 0)
            return;
        
        for (var shader of this.shaders)
        {
            if (shader.update)
                shader.update(this);
        }

        const effectiveColor = inheritedColor ? Helper.MultiplyColors(inheritedColor, this.color) : this.color;

        rapid.save();
        
        if (this.mask)
            this.renderParentTransform = rapid.matrixStack.getTransform();
        
        this.ApplyTransformToMatrixStack(this.transform);
        this.RenderTransformed(effectiveColor);

        rapid.save();
        rapid.matrixStack.translate(-this.pivot.x, -this.pivot.y);

        // Render children with inherited color
        for (var i = 0; i < this.children.length; i++)
        {
            this.children[i].Render(effectiveColor);
        }
        
        rapid.restore();

        rapid.restore();
        
        this.OnRender();
    }

    ApplyTransformToMatrixStack(transform: Transform)
    {
        rapid.matrixStack.translate(transform.position.x, transform.position.y)
        rapid.matrixStack.rotate(transform.rotation * (Math.PI / 180));
        rapid.matrixStack.scale(transform.scale.x * (transform.flipped ? -1 : 1), transform.scale.y);
    }

    public RenderTransformed(inheritedColor?: Color)
    {
        if (!this.texture)
            return;

        rapid.save();

        this.ApplyTransformToMatrixStack(this.innerTransform);

        if (this.texture)
            this.RenderSprite(inheritedColor);

        rapid.restore();
    }

    OnRender()
    {
        // FOR OVERRIDE
    }

    PostRender()
    {
        if (!this.visible)
            return;
        
        if (window.debug)
        {
            rapid.save();
            rapid.matrixStack.translate(this.x, this.y)

            rapid.renderCircle({
                offset: new Vec2(0, 0),
                radius: 4 / this.scene.GetCameraZoom(),
                color: new Color(0, 0, 0, 255),
                segments: 16
            });

            rapid.restore();
        }

        this.OnPostRender();
    }

    OnPostRender()
    {
        // FOR OVERRIDE
    }

    RenderSprite(color?: Color)
    {
        if (this.mask)
        {
            rapid.drawMask(this.maskType, () => {
                rapid.save();
                if (this.renderParentTransform)
                {
                    rapid.matrixStack.setTransform(this.renderParentTransform);
                }
                this.mask.visible = true;
                this.mask.Render();
                this.mask.visible = false;
                rapid.restore();
            });
        }
        
        const renderColor = color || this.color;
        rapid.renderSprite({
            texture: this.texture!,
            offset: new Vec2(-this.pivot.x, -this.pivot.y),
            color: renderColor, 
            shader: this.shader, 
            uniforms: this.uniforms
        });

        if (this.mask)
        {
            rapid.clearMask();
        }
    }

    SetMask(mask: GameObject, type: MaskType = MaskType.Include)
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

    AddShader(shader: any)
    {
        this.shaders.push(shader);
        shader.start(this);
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

    set position(vec2: Vec2)
    {
        this.transform.position.x = vec2.x;
        this.transform.position.y = vec2.y;
    }

    get position(): Vec2
    {
        return this.transform.position;
    }

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

    set innerPosition(vec2: Vec2)
    {
        this.innerTransform.position.x = vec2.x;
        this.innerTransform.position.y = vec2.y;
    }

    get innerPosition(): Vec2
    {
        return this.innerTransform.position;
    }

    set rotation(value: number)
    {
        this.transform.rotation = (value % 360);
    }

    get rotation(): number
    {
        return this.transform.rotation;
    }

    set innerRotation(value: number)
    {
        this.innerTransform.rotation = value;
    }

    get innerRotation(): number
    {
        return this.innerTransform.rotation;
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

    get flipped(): boolean
    {
        return this.transform.flipped;
    }

    set flipped(value: boolean)
    {
        this.transform.flipped = value;
    }

    get innerFlipped(): boolean
    {
        return this.innerTransform.flipped;
    }

    set innerFlipped(value: boolean)
    {
        this.innerTransform.flipped = value;
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

    set alpha(value: number)
    {
        value = Math.min(Math.max(value, 0), 1);
        this.color.a = value * 255;
    }

    get alpha()
    {
        return this.color.a / 255;
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
            this.applyTransform(m, ancestor);
            m.translate(-ancestor.pivot.x, -ancestor.pivot.y);
        }
    }

    private applyTransform(m: MatrixStack, t: { position?: { x: number, y: number }, rotation: number, scale: { x: number, y: number }, flipped: boolean })
    {
        var tx = t.position!.x;
        var ty = t.position!.y;
        m.translate(tx, ty);
        m.rotate(t.rotation * (Math.PI / 180));
        m.scale(t.scale.x * (t.flipped ? -1 : 1), t.scale.y);
    }

    private cornersToRect(corners: number[][]): Rectangle
    {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var c of corners)
        {
            minX = Math.min(minX, c[0]);
            minY = Math.min(minY, c[1]);
            maxX = Math.max(maxX, c[0]);
            maxY = Math.max(maxY, c[1]);
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    private getCorners(m: MatrixStack, px: number, py: number, w: number, h: number): number[][]
    {
        return [
            m.apply(px, py) as number[],
            m.apply(w, py) as number[],
            m.apply(w, h) as number[],
            m.apply(px, h) as number[]
        ];
    }

    GetBounds(global:boolean = true): Rectangle
    {
        if (!global || !this.parent)
        {
            return {
                x: this.x - this.pivot.x * this.totalScaleX,
                y: this.y - this.pivot.y * this.totalScaleY,
                width: this.texture!.width * this.totalScaleX,
                height: this.texture!.height * this.totalScaleY
            };
        }

        var m = new MatrixStack();
        m.pushIdentity();
        this.buildAncestorMatrix(m);
        this.applyTransform(m, this);

        m.pushMat();
        this.applyTransform(m, this.innerTransform);

        var px = -this.pivot.x;
        var py = -this.pivot.y;
        var corners = this.getCorners(m, px, py, this.texture!.width + px, this.texture!.height + py);
        m.popMat();

        return this.cornersToRect(corners);
    }

    GetBoundsWithChildren(global:boolean = true): Rectangle
    {
        var minX = Infinity;
        var minY = Infinity;
        var maxX = -Infinity;
        var maxY = -Infinity;

        var m = new MatrixStack();
        m.pushIdentity();

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

            var px = -obj.pivot.x;
            var py = -obj.pivot.y;
            var corners = this.getCorners(m, px, py, ow + px, oh + py);

            for (var c of corners)
            {
                minX = Math.min(minX, c[0]);
                minY = Math.min(minY, c[1]);
                maxX = Math.max(maxX, c[0]);
                maxY = Math.max(maxY, c[1]);
            }
        };

        var recurse = (obj: GameObject) => {
            m.pushMat();
            this.applyTransform(m, obj);

            m.pushMat();
            this.applyTransform(m, obj.innerTransform);
            updateBounds(obj);
            m.popMat();

            m.translate(-obj.pivot.x, -obj.pivot.y);
            for (var child of obj.children)
                recurse(child);

            m.popMat();
        };

        recurse(this);

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

    SetPosition(x: number, y: number): GameObject
    {
        if (Number.isNaN(x) || Number.isNaN(y))
            trace('isNaN SetPosition')

        this.transform.position.set(x, y);

        return this;
    }

    SetScale(scale: number): GameObject
    {
        this.transform.scale.x = scale
        this.transform.scale.y = scale

        return this;
    }

    SetScaleXY(x: number, y: number): GameObject
    {
        this.transform.scale.x = x;
        this.transform.scale.y = y;

        return this;
    }

    SetScaleToReachDimensions(width: number, height: number): GameObject
    {
        this.SetScaleXY(width / this.texture!.width, height / this.texture!.height);
        return this;
    }

    // CAN PASS IN PERCENTAGES TOO, TEXTURE HAS TO BE LOADED
    SetPivot(x: number, y: number): GameObject
    {
        if (this.texturePromise)
        {
            this.texturePromise.then(() => this.SetPivot(x, y));
            return this; // NOT DOING AWAIT SINCE THEN EVERY SETPIVOT WOULD NEED TO BE AWAITED, ANNOYING. THOUGH THIS SEEMS HACKY TOO, TODO
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

    SetPivotWhileKeepingPosition(x: number, y: number): GameObject
    {
        const oldPivot = new Vec2(this.pivot.x, this.pivot.y);
        this.SetPivot(x, y);
        this.SetPosition(this.x + this.pivot.x - oldPivot.x, this.y + this.pivot.y - oldPivot.y);

        return this;
    }

    SetColor(color: Color | string): GameObject
    {
        if(typeof color === 'string')
            this.color = Color.fromHex(color);
        else
            this.color = color;

        return this;
    }

    SetInnerScale(scale: number): GameObject
    {
        this.innerTransform.scale.x = scale;
        this.innerTransform.scale.y = scale;

        return this;
    }

    SetRotation(rotation: number): GameObject
    {
        this.rotation = rotation;
        return this;
    }

    CenterPivot(): GameObject
    {
        return this.SetPivot(.5, .5);
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

    // COULD CACHE SOME TRANSFORMS? TODO, CLEANUP WITH TRANSFORM
    // TODO: FIX, DOESNT WORK FOR HITBOX
    ToGlobal(localPoint: Vec2 = new Vec2()): Vec2
    {
        let p = new Vec2(localPoint.x, localPoint.y);
        let obj: GameObject | null = this;

        while (obj)
        {
            // INNER TRANSFORM
            p.x *= obj.innerScale.x;
            p.y *= obj.innerScale.y;
            p.x *= obj.flipped ? -1 : 1;

            if (obj.innerTransform.rotation !== 0)
            {
                const r = obj.innerTransform.rotation * Math.PI / 180;
                const cos = Math.cos(r), sin = Math.sin(r);
                const x = p.x, y = p.y;
                p.x = x * cos - y * sin;
                p.y = x * sin + y * cos;
            }

            p.x += obj.innerTransform.position.x;
            p.y += obj.innerTransform.position.y;

            // OUTER TRANSFORM
            p.x -= obj.pivot.x;
            p.y -= obj.pivot.y;

            p.x *= obj.scale.x;
            p.y *= obj.scale.y;

            if (obj.transform.rotation !== 0)
            {
                const r = obj.transform.rotation * Math.PI / 180;
                const cos = Math.cos(r), sin = Math.sin(r);
                const x = p.x, y = p.y;
                p.x = x * cos - y * sin;
                p.y = x * sin + y * cos;
            }

            p.x += obj.x;
            p.y += obj.y;

            obj = obj.parent;
        }

        return p;
    }

    ToLocal(globalPoint: Vec2): Vec2
    {
        let p = new Vec2(globalPoint.x, globalPoint.y);

        // collect all parents to apply reverse
        const chain: GameObject[] = [];
        let obj: GameObject | null = this;
        while (obj) {
            chain.push(obj);
            obj = obj.parent;
        }

        for (let i = chain.length - 1; i >= 0; i--)
        {
            const o = chain[i];

            // OUTER TRANSFORM (reverse)
            p.x -= o.x;
            p.y -= o.y;

            if (o.transform.rotation !== 0)
            {
                const r = -o.transform.rotation * Math.PI / 180;
                const cos = Math.cos(r), sin = Math.sin(r);
                const x = p.x, y = p.y;
                p.x = x * cos - y * sin;
                p.y = x * sin + y * cos;
            }

            p.x /= o.scale.x;
            p.y /= o.scale.y;

            p.x += o.pivot.x;
            p.y += o.pivot.y;

            // INNER TRANSFORM (reverse)
            p.x -= o.innerTransform.position.x;
            p.y -= o.innerTransform.position.y;

            if (o.innerTransform.rotation !== 0)
            {
                const r = -o.innerTransform.rotation * Math.PI / 180;
                const cos = Math.cos(r), sin = Math.sin(r);
                const x = p.x, y = p.y;
                p.x = x * cos - y * sin;
                p.y = x * sin + y * cos;
            }

            if (o.flipped)
                p.x *= -1;

            p.x /= o.innerScale.x;
            p.y /= o.innerScale.y;
        }

        return p;
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
            this.scene.objectController.BringToFront(this);
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
            this.scene.objectController.BringToBack(this);
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

            // THEN ADD IT AS CHILD
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

    ResetValues(): GameObject
    {
        //this.onDestroy?.bind(this);
        //this.onDestroy = null;

        this.name = "";
        this.pluginName = "";
        this.texture = null;
        this.persistent = false;
        this.pooled = false;
        this.save = false;
        this.color.setRGBA(255, 255, 255, 255);
        this.visible = true;
        this.visibleInEditor = true;
        this.tags = [];
        this.customName = "";
        this.tapHitbox = null;
        this.revertPivotOnSave = false;

        this.entity = null;
        
        this.startPosition.set(0);
        this.pivotBasedOnHitbox.set(0);

        this.transform.Reset();
        this.innerTransform.Reset();
        this.renderParentTransform = null;

        this.customData = {};

        this.RemoveMask();

        this.SetPivot(0, 0);
        this.RemoveShaders();
        this.RemoveChildren();

        return this;
    }
    
    RemoveShaders()
    {
        for (var shader of this.shaders)
        {
            shader.stop(this);
        }
        this.shaders = [];

        this.shader = undefined;
        this.uniforms = undefined;
    }
    
    Remove(clear:boolean = true)
    {
        if (this.parent)
        {
            this.parent.RemoveChild(this);
            this.parent = null;
            return;
        }

        this.scene.RemoveGameObject(this, undefined, clear);
    }

	Destroy()
	{

	}
}
