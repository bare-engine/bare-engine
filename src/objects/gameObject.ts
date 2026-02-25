import { assetsHandler } from "../handlers/assetsHandler";
import { Hitbox } from '../types/hitbox';
import { Entity, GameObjectClass } from '../types/bareTypes';
import { Helper } from '../utils/helper';
import { MakePath, Scene } from '../main';
import { Vec2, Texture, Color, GLShader, Uniform, MaskType } from "../libraries/rapid-render";
import type { Component, Ctor } from "../types/bareTypes";

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

    addedToLevel:boolean = false;
    pooled:boolean = false;

    texture: Texture | null;
    onDestroy:Function | null = null;

    transform: Transform = new Transform();
    innerTransform: Transform = new Transform();
    visibleInEditor:boolean = true;
    color:Color = new Color(255, 255, 255, 255);
    children: Array<GameObject> = [];
    parent: GameObject | null = null;

    shader: GLShader | undefined;
    uniforms: Uniform | undefined;

    tapHitbox: Hitbox | null = null; // COULD MAKE THIS ANY, TO UNREF HITBOX - TODO
    hitboxColor:Color = new Color(255,255,255,80);

    revertPivotOnSave: boolean = false;

    shaders: any[] = [];
    
    startPosition = new Vec2();
    
    texturePromise: Promise<Texture> | null = null;

    // CAN I GET RID OF THESE TWO?! TODO
    levelEntity: Entity | null = null; // USED IN COMBINATION WITH ENTITY, TO ALWAYS VARS SAME IN levelEntity, AND ONLY LOOK FOR CHANGES FROM ENTITY AND SAVE THOSE
    entity: Entity | null = null;

    private mask: GameObject | null = null;
    private maskType: MaskType = MaskType.Include;
    private renderParentTransform: Float32Array | null = null;

    public scene: Scene | null = null;

    //private cachedChildrenWidth: number = -1;
    //private cachedChildrenHeight: number = -1;

    //levelEditorAlpha: number = 1; // BIT HACKY VAR TO FADE OUT OBJECTS IN EDITOR BUT NOT ADJUST ACTUALY ALPHA VALUES (HAVE TO STAY IN INTACT FOR SAVING)
    
    constructor(scene: Scene | null = null, x:number = 0, y:number = 0, texturePath: string = "")
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
        this.OnPointerDown();
        this.OnPointerUp();
        this.OnPointerEnter();
        this.OnPointerLeave();

        this.tapHitbox = null;
    }

    // CAN SUPPY A CLASS OR INSTANCE OF COMPONENT
    AddComponent<T extends Component<this>>(componentClass: Ctor<T>): T;
    AddComponent<T extends Component<this>>(componentInstance: T): T;
    AddComponent<T extends Component<this>>(arg: Ctor<T> | T): T
    {
        var componentController = this.scene.Get("componentController");
        if (componentController)
            return componentController.AddComponent(this, arg);// NO HARD REF TO COMPONENTCONTROLLER ON PURPOSE
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
            return componentController.GetComponent(this, componentClass);// NO HARD REF TO COMPONENTCONTROLLER ON PURPOSE
        else
        {
            console.error("ComponentController not registered. Call bare.AddClass(ComponentController) at OnAwake() of your game.");
            return null;
        }
    }

    RemoveComponent<T extends Component<this>>(componentClass: Ctor<T>): boolean;
    RemoveComponent<T extends Component<this>>(componentInstance: T): boolean;
    RemoveComponent<T extends Component<this>>(arg: Ctor<T> | T): boolean
    {
        var componentController = this.scene.Get("componentController");
        if (componentController)
            return componentController.RemoveComponent(this, arg);// NO HARD REF TO COMPONENTCONTROLLER ON PURPOSE
        else
        {
            console.error("ComponentController not registered. Call bare.AddClass(ComponentController) at Awake() of your game.");
            return false;
        }
    }
    
    ApplyEntityVarsToGameObject(entity: Entity, obj: GameObject)
    {
        // FOR OVERRIDE
    }

    ApplyEntityToGameObject(entity: Entity, addComponents: boolean)
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
    
    static FromTexture(texture: Texture): GameObject
    {
        var obj = new GameObject();
        obj.SetTexture(texture);
        return obj;
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
        if (cached) {
            this.SetTexture(cached);
            return cached;
        }

        this.texturePromise = assetsHandler.GetTexturePromise(texturePath);
        const tex = await this.texturePromise;
        if (assetsHandler.HasTexture(texturePath)) {
            this.SetTexture(tex);
        }

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
                var tex = assetsHandler.GetTexture(MakePath(this.entity.imagePath!, this.entity.name));
                if (tex)
                {
                    this.SetTexture(tex);
                    callback();
                }
                else
                {
                    assetsHandler.GetTexturePromise(MakePath(this.entity.imagePath!, this.entity.name)).then(tex => {
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
        this.ResetValues();
        this.addedToLevel = false;
    }

    /** @virtual */
	Update(deltaTime: number)
    {
        
	}

    /** @virtual */
    PreRender()
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
        this.renderParentTransform = rapid.matrixStack.getTransform();
        
        this.ApplyTransformToMatrixStack(this.transform);
        this.RenderTransformed(effectiveColor);

        // Render children with inherited color
        for (var i = 0; i < this.children.length; i++)
        {
            this.children[i].Render(effectiveColor);
        }

        rapid.restore();
    }

    ApplyTransformToMatrixStack(transform: Transform)
    {
        rapid.matrixStack.translate(transform.position.x, transform.position.y)
        rapid.matrixStack.scale(transform.scale.x * (transform.flipped ? -1 : 1), transform.scale.y);
        rapid.matrixStack.rotate(transform.rotation * (Math.PI / 180));
    }

    public RenderTransformed(inheritedColor?: Color)
    {
        // OVERRIDE

        rapid.save();
        this.ApplyTransformToMatrixStack(this.innerTransform);

        if (this.texture)
            this.RenderSprite(inheritedColor);
        
        this.OnRender();

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

    set innerScaleX(value: number)
    {
        this.innerTransform.scale.x = value;
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
        if (!this.texture && this.children.length > 0)
        {
            // RETURNING WIDTH OF CHILDREN IF THERE'S NO TEXTURE
            return this.widthIncludingChildren;
        }

        if (!this.texture)
        {
            return 0;
        }

        return this.texture!.width * this.totalScaleX;
    }

    get height(): number
    {
        if (!this.texture && this.children.length > 0)
        {
            // RETURNING WIDTH OF CHILDREN IF THERE'S NO TEXTURE
            return this.heightIncludingChildren;
        }

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
        
        var computedWidth = 0;

        if (this.texture)
            computedWidth = this.texture.width * this.totalScaleX;

        if (this.children.length > 0)
        {
            var minX = Number.MAX_VALUE;
            var maxX = Number.MIN_VALUE;

            for (var i = 0; i < this.children.length; i++)
            {
                var child = this.children[i];
                if (!child.visible)
                    continue;
                minX = Math.min(minX, child.x);
                maxX = Math.max(maxX, child.x + child.width/**child.totalScaleX*/);
            }

            var childrenWidht = (maxX - minX);
            computedWidth = Math.max(computedWidth, childrenWidht);
        }

        //this.cachedChildrenWidth = computedWidth;

        return computedWidth;
    }

    get heightIncludingChildren()
    {
        // COMMENTED OUT, TOO HARD TO CATCH ALL CASES OF CHILDREN
        //if (this.cachedChildrenHeight != -1)
        //    return this.cachedChildrenHeight;

        var computedHeight = 0;

        if (this.texture)
            computedHeight = this.texture.height * this.totalScaleY;

        if (this.children.length > 0)
        {
            var minY = Number.MAX_VALUE;
            var maxY = Number.MIN_VALUE;

            for (var i = 0; i < this.children.length; i++)
            {
                var child = this.children[i];
                if (!child.visible)
                    continue;
                minY = Math.min(minY, child.y);
                maxY = Math.max(maxY, child.y + child.height);
            }

            var childrenHeight = (maxY - minY);
            computedHeight = Math.max(computedHeight, childrenHeight);
        }

        //this.cachedChildrenHeight = computedHeight;

        return computedHeight;
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
                console.error("CANNOT SET PERCENTAGE ON A GAMEOBJECT WITHOUT A TEXTURE. LOAD IT FIRST");
                return this;
            }
                
            x = x * this.width;
        }
        if (y > 0 && y <= 1)
        {
            if (!this.texture)
            {
                console.error("CANNOT SET PERCENTAGE ON A GAMEOBJECT WITHOUT A TEXTURE. LOAD IT FIRST");
                return this;
            }
                
            y = y * this.height;
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

    GetLeftTopPosition(): Vec2
    {
        return new Vec2(this.x - this.pivot.x, this.y - this.pivot.y);
    }

    GetCenterPosition(): Vec2
    {
        if (!this.texture)
            return new Vec2(0, 0);

        var leftTop = this.GetLeftTopPosition();
        var x = (leftTop.x + this.texture!.width * .5);
        var y = (leftTop.y + this.texture!.height * .5);

        return new Vec2(x, y);
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

    OnCollisionStart(collidingObject: GameObject)
    {
        
    }

    OnCollisionUpdate(collidingObject: GameObject)
    {
        
    }

    OnCollisionEnd(collidingObject: GameObject)
    {
        
    }

    AddChild(input?: Entity | string | GameObject | GameObjectClass | Texture): GameObject
    {
        // RESET CACHED VALUES SO THEY GET RECALCULATED
        //this.cachedChildrenWidth = -1;
        //this.cachedChildrenHeight = -1;

        if (input instanceof GameObject)
        {
            var child = input;
            child.parent = this;
            this.children.push(child);

            return child;
        }
        else
        {
            return this.scene.AddGameObject(input, this); // CHILD WILL BE POOLED
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

    ResetValues()
    {
        this.onDestroy?.bind(this);
        this.onDestroy = null;

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
        this.levelEntity = null;
        
        this.startPosition.set(0);
        this.pivotBasedOnHitbox.set(0);

        this.transform.Reset();
        this.innerTransform.Reset();
        this.renderParentTransform = null;

        this.RemoveMask();

        this.SetPivot(0, 0);
        this.RemoveShaders();
        this.RemoveChildren();
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

	Destroy()
	{

	}
}
