import { Color, Vec2 } from "../libraries/rapid-render";
import { GameObject } from "../objects/gameObject";
import type { Scene } from "../scenes/scene";
import { BareEvent, BareEventPayload, CollisionHandlingType, HitboxType, Rectangle2Vec } from '../types/bareTypes';
import { Hitbox } from "../types/hitbox";
import { Helper } from "../utils/helper";
import { RegisterController } from "../globals";
import { InspectorField } from "../utils/decorators";

type AnyPress = (go: any, ...args: any[]) => any;

type Handler<Arg extends GameObject = GameObject> = (go?: Arg | null, ...args: any[]) => any;

export type ButtonHandlers<Arg extends GameObject = GameObject> = {
  OnPress?: Handler<Arg>;
  OnRelease?: Handler<Arg>;
  OnEnter?: Handler<Arg>;
  OnLeave?: Handler<Arg>;
  showPointer?: boolean;
};

export class HitboxController
{
    public active: boolean = true;
    public showDebug: boolean = true;

    private currentHitboxHover: Hitbox | null = null;
    private currentHitboxDown: Hitbox | null = null;
    private currentTouchHitboxesDown = new Map<number, Hitbox>();
    private currentHitboxHoverPath: Hitbox[] = [];

    private exclusiveLayers: int[] = [];

    public scene: Scene;

    // CROSS-SCENE POINTER OCCLUSION: THE TOPMOST HITBOXCONTROLLER UNDER THE CURSOR CLAIMS THE
    // POINTER FOR THE FRAME (SCENES UPDATE TOP-TO-BOTTOM), LOWER ONES SEE IT CLAIMED AND YIELD.
    // FRAME-STAMPED SO NO PER-FRAME RESET CALL IS NEEDED FROM THE CORE LOOP. THE OWNER IS TRACKED
    // SO A CONTROLLER NEVER BLOCKS ITS OWN RE-ENTRANT Update (eg PointerDown CALLS Update AGAIN).
    private static pointerClaimedFrame: int = -1;
    private static pointerClaimedBy: HitboxController | null = null;

    @InspectorField
    private get hitboxesNum():int { return this.GetAll().length; }

    private PointerClaimedByOther(): boolean
    {
        return HitboxController.pointerClaimedFrame === bare.count
            && HitboxController.pointerClaimedBy !== this;
    }

    private ClaimPointer(): void
    {
        HitboxController.pointerClaimedFrame = bare.count;
        HitboxController.pointerClaimedBy = this;
    }

    constructor(scene: Scene)
    {
        this.scene = scene;
    }

	Start(): void
	{
        bare.SetCursor('inherit');

        // THE MOUSE LISTENER MUST RUN BEFORE HIT TESTING SO POINTERDOWN USES THIS EVENT'S
        // POSITION. FORCE THE LAZY CONTROLLER TO EXIST BEFORE REGISTERING OUR LISTENER.
        void this.scene.mouse;

        bare.events.on(BareEvent.pointer_down, this.PointerDown.bind(this));
        bare.events.on(BareEvent.pointer_up, this.PointerUp.bind(this));
    }

    Update(): void
    {
        if (!this.active)
            return;

        if (bare.mobile && !bare.mouse.IsDown())
            return;

        // A HIGHER SCENE ALREADY GRABBED THE POINTER THIS FRAME - DROP OUR STALE HOVER AND YIELD.
        // DON'T TOUCH THE CURSOR: THE CLAIMING SCENE OWNS IT THIS FRAME (eg KEEPS ITS 'pointer').
        if (this.PointerClaimedByOther())
        {
            this.SetHover(null, false);
            return;
        }

        this.HandleUpdate(this.scene.object.GetLayers());

        if (this.currentHitboxHover)
            this.ClaimPointer();
    }

    Render()
    {
        if (!bare.debug || !this.showDebug)
            return;

        var objs = this.GetAllObjectsWithChildren();

        for (var i = objs.length - 1; i >= 0; i--)
        {
            var obj = objs[i];
            var hitbox = obj.tapHitbox;

            var color = Color.fromHex('#f700ff57');
            
            if (!hitbox?.active)
                continue;

            if (hitbox.type == HitboxType.Circle)
            {
                const center = this.GetCircleCenter(hitbox);
                const radius = this.GetRadius(hitbox);
                
                rapid.drawCircle({
                    radius,
                    color,
                    segments: 32,
                    position: new Vec2(center.x, center.y),
                });
            }
            else if (hitbox.type == HitboxType.Rectangle)
            {
                const rect = this.GetRect(hitbox);
                
                rapid.drawRect({
                    width: rect.width,
                    height: rect.height,
                    color,
                    position: new Vec2(rect.x1, rect.y1),
                });
            }
        }
    }

    HandleUpdate(layers: GameObject[][])
    {
        const mouse = bare.mouse.world.position;
        const hitbox = this.GetHitboxAt(layers, mouse) ?? this.GetInactiveHoverAt(mouse);
        this.SetHover(hitbox);
    }

    private GetInactiveHoverAt(mouse: Vec2): Hitbox | null
    {
        // TransformTool temporarily disables a selected object's hitbox while its frame/body is
        // hovered. Preserve that object's hover semantics until the pointer actually leaves its
        // bounds; otherwise OnLeave can hide a child overlay immediately after OnEnter showed it.
        for (var i = this.currentHitboxHoverPath.length - 1; i >= 0; i--)
        {
            const hitbox = this.currentHitboxHoverPath[i];
            if (!hitbox.active && hitbox.parent.visibleInEditor && this.IsPointInside(hitbox, mouse))
                return hitbox;
        }

        return null;
    }

    // the hitbox at a world point, eg a click the hover hasn't caught up to yet
    GetHitboxAtPoint(world: Vec2): Hitbox | null
    {
        return this.GetHitboxAt(this.scene.object.GetLayers(), world);
    }

    private GetHitboxAt(layers: GameObject[][], mouse: Vec2): Hitbox | null
    {
        var layersSettings = this.scene.settingsData.layers;
        var l = layersSettings.length;
        for (var i = layers.length - 1; i >= 0; i--)
        {
            const layer = i;

            if (layer > l - 1)
                continue;

            if (this.exclusiveLayers.length > 0 && !this.exclusiveLayers.includes(layer))
                continue;

            var layerName = layersSettings[layer];
            var layerInfo = this.scene.settingsData.layersInfo[layerName];
            var layerCollisionHandlingType = layerInfo.pointerCollisionType;

            var objs = layers[i];
            var closestDistSqr = 100000;
            var curClosestHitbox: Hitbox | null = null;
            
            for (var j = objs.length - 1; j >= 0; j--)
            {
                var obj = objs[j];

                if (layerCollisionHandlingType == CollisionHandlingType.POINT)
                {
                    const hitbox = this.GetTopInObject(obj, mouse);
                    if (hitbox)
                    {
                        return hitbox;
                    }
                }
                else if (layerCollisionHandlingType == CollisionHandlingType.RADIUS)
                {
                    const hitboxes = this.GetAllInObject(obj, mouse);
                    for (var k = 0; k < hitboxes.length; k++)
                    {
                        const hitbox = hitboxes[k];
                        const center = this.GetCenter(hitbox);
                        const distToHitboxSqr = Helper.DistanceNoSqr(mouse, center);

                        if (distToHitboxSqr < closestDistSqr)
                        {
                            closestDistSqr = distToHitboxSqr;
                            curClosestHitbox = hitbox;
                        }
                    }
                }
            }

            if (layerCollisionHandlingType == CollisionHandlingType.RADIUS && curClosestHitbox)
                return curClosestHitbox;
        }

        return null;
    }

    private GetCircleCenter(hitbox: Hitbox): Vec2
    {
        const parent = hitbox.parent;
        const localCenter = new Vec2(
            hitbox.circleOffset.x + parent.pivot.x,
            hitbox.circleOffset.y + parent.pivot.y
        );
        const worldCenter = parent.ToGlobal(localCenter);

        return worldCenter;
    }

    private GetRadius(hitbox: Hitbox): number
    {
        const parent = hitbox.parent;
        const localCenter = new Vec2(
            hitbox.circleOffset.x + parent.pivot.x,
            hitbox.circleOffset.y + parent.pivot.y
        );
        const radius = hitbox.GetRadius();
        const localEdge = new Vec2(localCenter.x + radius, localCenter.y);

        const worldCenter = parent.ToGlobal(localCenter);
        const worldEdge = parent.ToGlobal(localEdge);

        return Helper.Distance(worldCenter, worldEdge);
    }

    public GetRect(hitbox: Hitbox)
    {
        const rect = hitbox.rectangle;
        const parent = hitbox.parent;

        // Inner transform is excluded so juice tweens (innerScale/innerPosition/innerRotation)
        // don't move or resize the hitbox; keep this aligned with arcadePhysicsController.
        const topLeft = parent.ToGlobal(new Vec2(rect.x, rect.y));
        const topRight = parent.ToGlobal(new Vec2(rect.x + rect.width, rect.y));
        const bottomRight = parent.ToGlobal(new Vec2(rect.x + rect.width, rect.y + rect.height));
        const bottomLeft = parent.ToGlobal(new Vec2(rect.x, rect.y + rect.height));

        const minX = Math.min(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
        const minY = Math.min(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);
        const maxX = Math.max(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
        const maxY = Math.max(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);

        return {
            x1: minX,
            y1: minY,
            x2: maxX,
            y2: maxY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    private GetCenter(hitbox: Hitbox): Vec2
    {
        if (hitbox.type === HitboxType.Circle)
        {
            return this.GetCircleCenter(hitbox);
        }

        const rect = this.GetRect(hitbox);
        return new Vec2(rect.x1 + rect.width / 2, rect.y1 + rect.height / 2);
    }

    private IsPointInside(hitbox: Hitbox, point: Vec2): boolean
    {
        if (hitbox.type === HitboxType.Circle)
        {
            const center = this.GetCircleCenter(hitbox);
            const radius = this.GetRadius(hitbox);
            const distSqr = Helper.DistanceNoSqr(point, center);

            return distSqr < radius * radius;
        } 
        else if (hitbox.type === HitboxType.Rectangle)
        {
            const rect = this.GetRect(hitbox);
            
            return point.x >= rect.x1 && 
                   point.x <= rect.x2 &&
                   point.y >= rect.y1 && 
                   point.y <= rect.y2;
        }
        
        return false;
    }

    private IsTouchable(hitbox: Hitbox | null): hitbox is Hitbox
    {
        if (!hitbox?.active)
            return false;

        if (!hitbox?.affectedByVisibility)
            return true;

        var obj: GameObject | null = hitbox.parent;
        while (obj)
        {
            if (!obj.visible && !bare.levelEditorOpen)
                return false;

            if (!obj.visibleInEditor)
                return false;

            obj = obj.parent;
        }

        return true;
    }
    
    GetAll()
    {
        var hitboxes: Hitbox[] = [];

        const collect = (current: GameObject) => {
            for (var i = current.children.length - 1; i >= 0; i--)
            {
                collect(current.children[i]);
            }

            if (current.tapHitbox)
                hitboxes.push(current.tapHitbox);
        };

        var layers = this.scene.object.GetLayers();
        var layersSettings = this.scene.settingsData.layers;
        var l = layersSettings.length;

        for (var i = 0; i < layers.length; i++)
        {
            const layer = i;

            if (layer > l - 1)
                continue;

            if (this.exclusiveLayers.length > 0 && !this.exclusiveLayers.includes(layer))
                continue;

            var objs = layers[i];

            for (var j = objs.length - 1; j >= 0; j--)
            {
                var obj = objs[j];
                collect(obj);
            }
        }

        return hitboxes;
    }

    private GetTopInObject(obj: GameObject, point: Vec2): Hitbox | null
    {
        for (var i = obj.children.length - 1; i >= 0; i--)
        {
            const childHitbox = this.GetTopInObject(obj.children[i], point);
            if (childHitbox)
                return childHitbox;
        }

        const hitbox = obj.tapHitbox;
        if (!this.IsTouchable(hitbox))
            return null;

        return this.IsPointInside(hitbox, point) ? hitbox : null;
    }

    private GetAllInObject(obj: GameObject, point: Vec2): Hitbox[]
    {
        var hitboxes: Hitbox[] = [];

        const collect = (current: GameObject) => {
            for (var i = current.children.length - 1; i >= 0; i--)
            {
                collect(current.children[i]);
            }

            const hitbox = current.tapHitbox;
            if (this.IsTouchable(hitbox) && this.IsPointInside(hitbox, point))
            {
                hitboxes.push(hitbox);
            }
        };

        collect(obj);

        return hitboxes;
    }

    private BuildHoverPath(hitbox: Hitbox | null): Hitbox[]
    {
        if (!hitbox)
            return [];

        var path: Hitbox[] = [];
        var obj: GameObject | null = hitbox.parent;

        while (obj)
        {
            // Keep an inactive ancestor that was already hovered. Selected objects temporarily
            // disable their own hitbox, but an active child can still become the topmost hit.
            if (this.IsTouchable(obj.tapHitbox) || (obj.tapHitbox && this.currentHitboxHoverPath.includes(obj.tapHitbox)))
            {
                path.unshift(obj.tapHitbox);
            }

            obj = obj.parent;
        }

        return path;
    }

    private SetHover(hitbox: Hitbox | null, updateCursor: boolean = true): void
    {
        const newHoverPath = this.BuildHoverPath(hitbox);
        var commonPathLength = 0;

        while (
            commonPathLength < this.currentHitboxHoverPath.length &&
            commonPathLength < newHoverPath.length &&
            this.currentHitboxHoverPath[commonPathLength] == newHoverPath[commonPathLength]
        )
        {
            commonPathLength++;
        }

        for (var i = this.currentHitboxHoverPath.length - 1; i >= commonPathLength; i--)
        {
            const leavingHitbox = this.currentHitboxHoverPath[i];
            leavingHitbox.OnLeave?.(leavingHitbox.parent);
        }

        for (var i = commonPathLength; i < newHoverPath.length; i++)
        {
            const enteringHitbox = newHoverPath[i];
            enteringHitbox.OnEnter?.(enteringHitbox.parent);
        }

        this.currentHitboxHoverPath = newHoverPath;
        this.currentHitboxHover = newHoverPath.length > 0 ? newHoverPath[newHoverPath.length - 1] : null;

        if (updateCursor)
            bare.SetCursor(this.currentHitboxHover?.showPointer ? 'pointer' : 'inherit');
    }

    private GetAllObjectsWithChildren(): GameObject[]
    {
        var allObjects: GameObject[] = [];
        var objs = this.scene.object.GetAll();

        const collect = (obj: GameObject) => {
            allObjects.push(obj);
            for (var i = 0; i < obj.children.length; i++)
            {
                collect(obj.children[i]);
            }
        };

        for (var i = 0; i < objs.length; i++)
        {
            collect(objs[i]);
        }

        return allObjects;
    }

    private PointerDown({ mouseX, mouseY, event }: BareEventPayload['pointer_down']): void
    {
        this.Update();

        const hitbox = this.currentHitboxHover;
        if (bare.multiTouch && event.pointerType === 'touch')
        {
            if (hitbox)
                this.currentTouchHitboxesDown.set(event.pointerId, hitbox);
        }
        else
        {
            this.currentHitboxDown = hitbox;
        }

        hitbox?.OnPress?.(hitbox.parent, event);

        event.preventDefault();
    }

    private PointerUp({ mouseX, mouseY, event }: BareEventPayload['pointer_up']): void
    {
        if (bare.multiTouch && event.pointerType === 'touch')
        {
            const hitboxDown = this.currentTouchHitboxesDown.get(event.pointerId);
            if (!hitboxDown)
                return;

            const worldPosition = this.scene.ScreenToWorld(mouseX, mouseY);
            const hitboxUp = this.GetHitboxAt(this.scene.object.GetLayers(), worldPosition);

            if (!hitboxDown.shouldReleaseOnTop || hitboxUp === hitboxDown)
                hitboxDown.OnRelease?.(hitboxDown.parent, event);

            this.currentTouchHitboxesDown.delete(event.pointerId);
            if (bare.mobile && this.currentTouchHitboxesDown.size === 0)
                this.SetHover(null);

            event.preventDefault();
            return;
        }

        if (!this.currentHitboxDown)
            return;

        if (!this.currentHitboxDown.shouldReleaseOnTop || this.currentHitboxHover == this.currentHitboxDown)
            this.currentHitboxDown?.OnRelease?.(this.currentHitboxDown.parent, event);

        this.currentHitboxDown = null;
        this.currentTouchHitboxesDown.clear();

        if (bare.mobile)
        {
            if (this.currentHitboxHover)
            {
                this.SetHover(null);
            }
        }

        event.preventDefault();
    }

    Activate()
    {
        this.active = true;
    }

    Reset()
    {
        this.ClearExclusiveLayers();
        this.ResetCurrentHover();
        this.currentHitboxDown = null;
        this.currentTouchHitboxesDown.clear();
    }

    SetExclusiveLayer(...layers: int[])
    {
        this.exclusiveLayers = layers;
    }

    ClearExclusiveLayers()
    {
        this.exclusiveLayers.length = 0;
    }

    GetCurrentHover(): Hitbox | null
    {
        return this.currentHitboxHover;
    }

    GetCurrentDown(): Hitbox | null
    {
        return this.currentHitboxDown;
    }

    ResetCurrentHover()
    {
        this.currentHitboxHover = null;
        this.currentHitboxHoverPath = [];
        bare.SetCursor('inherit');
    }

    // Hitboxes are stored unscaled; GetRect applies the object's world transform.
    private GetLocalRect(gameObject: GameObject): Rectangle2Vec
    {
        const bounds = gameObject.texture?.localBounds;
        if (bounds)
        {
            return {
                x1: bounds.x,
                y1: bounds.y,
                x2: bounds.x + bounds.width,
                y2: bounds.y + bounds.height
            };
        }

        const childBounds = gameObject.GetBoundsWithChildren(false, false);
        if (childBounds.width !== 0 || childBounds.height !== 0)
        {
            return {
                x1: childBounds.x,
                y1: childBounds.y,
                x2: childBounds.x + childBounds.width,
                y2: childBounds.y + childBounds.height
            };
        }

        // Procedural objects such as Button have no texture or children, but
        // expose their local dimensions through width and height.
        return {
            x1: 0,
            y1: 0,
            x2: gameObject.width,
            y2: gameObject.height
        };
    }

    AssignButton<T extends GameObject>(gameObject: T, onPress: (go: T, ...args: any[]) => any): Hitbox;
    AssignButton(gameObject: GameObject, onPress: AnyPress): Hitbox;
    AssignButton(gameObject: GameObject, handlers: ButtonHandlers<any>): Hitbox;
    AssignButton(gameObject: GameObject, arg: any): Hitbox
    {
        const handlers: ButtonHandlers<any> = (typeof arg === "function" ? { OnPress: arg } : arg);
        var rect = this.GetLocalRect(gameObject);
        const hitbox = new Hitbox(gameObject, rect);

        hitbox.OnPress   = (...a: any[]) => handlers.OnPress?.(gameObject, ...a);
        hitbox.OnRelease = (...a: any[]) => handlers.OnRelease?.(gameObject, ...a);
        hitbox.OnEnter   = (...a: any[]) => handlers.OnEnter?.(gameObject, ...a);
        hitbox.OnLeave   = (...a: any[]) => handlers.OnLeave?.(gameObject, ...a);
        hitbox.showPointer = handlers?.showPointer ?? true;

        gameObject.tapHitbox = hitbox;
        
        return hitbox;
    }

    SetCircleHitbox(gameobject: GameObject, radius?: number): Hitbox
    {
        const rect = this.GetLocalRect(gameobject);
        const circleRadius = radius ?? Math.min(rect.x2 - rect.x1, rect.y2 - rect.y1) / 2;

        if (circleRadius <= 0)
            throw new Error("Cannot add circle hitbox to an object with no size. GameObject likely has not loaded its texture yet. Load the texture before adding the GameObject, or provide a radius.");

        const hitbox = gameobject.tapHitbox ?? new Hitbox(gameobject, circleRadius);
        hitbox.type = HitboxType.Circle;
        hitbox.radius = circleRadius;
        gameobject.tapHitbox = hitbox;

        return hitbox;
    }

    OnPointerDown(gameobject: GameObject, callback: AnyPress): Hitbox
    {
        return this.AssignCallback(gameobject, "OnPress", callback);
    }

    OffPointerDown(gameobject: GameObject): void
    {
        this.AssignCallback(gameobject, "OnPress", null);
    }

    OnPointerUp(gameobject: GameObject, callback: AnyPress): void
    {
        this.AssignCallback(gameobject, "OnRelease", callback);
    }

    OffPointerUp(gameobject: GameObject): void
    {
        this.AssignCallback(gameobject, "OnRelease", null);
    }

    OnPointerEnter(gameobject: GameObject, callback: AnyPress): void
    {
        this.AssignCallback(gameobject, "OnEnter", callback);
    }

    OffPointerEnter(gameobject: GameObject): void
    {
        this.AssignCallback(gameobject, "OnEnter", null);
    }

    OnPointerLeave(gameobject: GameObject, callback: AnyPress): void
    {
        this.AssignCallback(gameobject, "OnLeave", callback);
    }

    OffPointerLeave(gameobject: GameObject): void
    {
        this.AssignCallback(gameobject, "OnLeave", null);
    }

    OffPointers(gameobject: GameObject): void
    {
        gameobject.tapHitbox = null;
    }

    OffAllPointers(): void
    {
        var objects = this.GetAllObjectsWithChildren();
        for (var i = objects.length - 1; i >= 0; i--)
        {
            this.OffPointers(objects[i]);
        }
    }

    SetShowPointerCursor(gameobject: GameObject, show: boolean): void
    {
        if (!gameobject.tapHitbox)
        {
            throw new Error("Cannot show pointer cursor for an object with no hitbox.");
        }

        gameobject.tapHitbox.showPointer = show;
    }

    AssignCallback(gameobject: GameObject, type: "OnPress" | "OnRelease" | "OnEnter" | "OnLeave", callback: AnyPress): Hitbox
    {
        var rect = this.GetLocalRect(gameobject);

        if (rect.x1 === 0 && rect.y1 === 0 && rect.x2 === 0 && rect.y2 === 0)
            throw new Error("Cannot add hitbox to an object with no size. GameObject likely has not loaded its texture yet. Load the texture before adding the GameObject, or use this.obj.WhenTextureLoaded(...) to queue a callback.");

        const hitbox = gameobject.tapHitbox ?? new Hitbox(gameobject, rect);
        hitbox[type] = callback;
        gameobject.tapHitbox = hitbox;

        return hitbox;
    }
}

RegisterController(HitboxController);
