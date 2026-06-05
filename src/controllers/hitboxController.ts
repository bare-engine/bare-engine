import { Color, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import type { Scene } from "../scenes/scene";
import { BareEvent, BareEventPayload, CollisionHandlingType, HitboxType } from '../types/bareTypes';
import { Hitbox } from "../types/hitbox";
import { Helper } from "../utils/helper";
import { RegisterController } from "../globals";
import { mouseController } from "./mouseController";

type AnyPress = (go: any, ...args: any[]) => any;

type Handler<Arg extends GameObject = GameObject> = (go?: Arg | null, ...args: any[]) => any;

export type ButtonHandlers<Arg extends GameObject = GameObject> = {
  OnPress?: Handler<Arg>;
  OnRelease?: Handler<Arg>;
  OnEnter?: Handler<Arg>;
  OnLeave?: Handler<Arg>;
};

export class HitboxController
{
    public active: boolean = true;

    private currentHitboxHover: Hitbox | null = null;
    private currentHitboxDown: Hitbox | null = null;
    private currentHitboxHoverPath: Hitbox[] = [];

    private exclusiveLayers: int[] = [];

    public scene: Scene;

    public preventUpdateOneFrame: boolean = false;

    constructor(scene: Scene)
    {
        this.scene = scene;
    }

	Start(): void
	{
        bare.SetCursor('inherit');

        this.scene.events.on(BareEvent.pointer_down, this.PointerDown.bind(this));
        this.scene.events.on(BareEvent.pointer_up, this.PointerUp.bind(this));
    }

    Update(): void
    {
        if (this.preventUpdateOneFrame)
        {
            this.preventUpdateOneFrame = false;
            return;
        }

        if (!this.active)
            return;

        if (isMobile && !mouseController.IsMouseDown())
            return;

        this.HandleUpdate(this.scene.objectController.GetLayers());
    }

    Render()
    {
        if (!window.debug)
            return;

        var objs = this.GetAllObjectsWithChildren();

        for (var i = objs.length - 1; i >= 0; i--)
        {
            var obj = objs[i];
            var hitbox = obj.tapHitbox;

            var color = Color.fromHex('#f700ff57');

            // physicsHitbox SHOULD NOT REALLY BE HANDLED HERE - TODO
            if ((obj as any).isPhysicsObject)
            {
                hitbox = (obj as any).physicsHitbox;
                if (!(obj as any).collide)
                    continue;
            }
            
            if (!hitbox?.active)
                continue;

            if (hitbox.type == HitboxType.Circle)
            {
                const center = this.GetHitboxCircleCenter(hitbox);
                const radius = this.GetHitboxRadius(hitbox);
                
                rapid.drawCircle({
                    radius,
                    color,
                    segments: 32,
                    position: new Vec2(center.x, center.y),
                });
            }
            else if (hitbox.type == HitboxType.Rectangle)
            {
                const rect = this.GetHitboxRect(hitbox);
                
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
        const mouse = mouseController.world.position;
        var foundHover = false;

        var layersSettings = this.scene.settingsData.layers;
        var l = layersSettings.length;
        for (var i = 0; i < layers.length; i++)
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
            var fullBreak = false;

            var closestDistSqr = 100000;
            var curClosestHitbox: Hitbox | null = null;
            
            for (var j = objs.length - 1; j >= 0; j--)
            {
                var obj = objs[j];

                if (layerCollisionHandlingType == CollisionHandlingType.POINT)
                {
                    const hitbox = this.GetTopHitboxInObject(obj, mouse);
                    if (hitbox)
                    {
                        this.SetHoverHitbox(hitbox);
                        foundHover = true;
                        fullBreak = true;
                        break;
                    }
                }
                else if (layerCollisionHandlingType == CollisionHandlingType.RADIUS)
                {
                    const hitboxes = this.GetHitboxesInObject(obj, mouse);
                    for (var k = 0; k < hitboxes.length; k++)
                    {
                        const hitbox = hitboxes[k];
                        const center = this.GetHitboxCenter(hitbox);
                        const distToHitboxSqr = Helper.DistanceNoSqr(mouse, center);

                        if (distToHitboxSqr < closestDistSqr)
                        {
                            closestDistSqr = distToHitboxSqr;
                            curClosestHitbox = hitbox;
                        }
                    }
                }

                if (fullBreak)
                    break;
            }

            if (layerCollisionHandlingType == CollisionHandlingType.RADIUS && curClosestHitbox)
            {
                this.SetHoverHitbox(curClosestHitbox);
                foundHover = true;
            }

            if (layerCollisionHandlingType == CollisionHandlingType.POINT && fullBreak)
                break;
        }

        if (!foundHover)
        {
            this.SetHoverHitbox(null);
        }
    }

    private GetHitboxCircleCenter(hitbox: Hitbox): Vec2
    {
        const parent = hitbox.parent;
        const localCenter = new Vec2(
            hitbox.circleOffset.x + parent.pivot.x,
            hitbox.circleOffset.y + parent.pivot.y
        );
        const worldCenter = parent.ToGlobal(localCenter);

        return worldCenter;
    }

    private GetHitboxRadius(hitbox: Hitbox): number
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

    private GetHitboxRect(hitbox: Hitbox)
    {
        const rect = hitbox.rectangle;
        const parent = hitbox.parent;

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

    private GetHitboxCenter(hitbox: Hitbox): Vec2
    {
        if (hitbox.type === HitboxType.Circle)
        {
            return this.GetHitboxCircleCenter(hitbox);
        }

        const rect = this.GetHitboxRect(hitbox);
        return new Vec2(rect.x1 + rect.width / 2, rect.y1 + rect.height / 2);
    }

    private IsPointInsideHitbox(hitbox: Hitbox, point: Vec2): boolean
    {
        if (hitbox.type === HitboxType.Circle)
        {
            const center = this.GetHitboxCircleCenter(hitbox);
            const radius = this.GetHitboxRadius(hitbox);
            const distSqr = Helper.DistanceNoSqr(point, center);

            return distSqr < radius * radius;
        } 
        else if (hitbox.type === HitboxType.Rectangle)
        {
            const rect = this.GetHitboxRect(hitbox);
            
            return point.x >= rect.x1 && 
                   point.x <= rect.x2 &&
                   point.y >= rect.y1 && 
                   point.y <= rect.y2;
        }
        
        return false;
    }

    private IsHitboxTouchable(hitbox: Hitbox | null): hitbox is Hitbox
    {
        if (!hitbox?.active)
            return false;

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

    private GetTopHitboxInObject(obj: GameObject, point: Vec2): Hitbox | null
    {
        for (var i = obj.children.length - 1; i >= 0; i--)
        {
            const childHitbox = this.GetTopHitboxInObject(obj.children[i], point);
            if (childHitbox)
                return childHitbox;
        }

        const hitbox = obj.tapHitbox;
        if (!this.IsHitboxTouchable(hitbox))
            return null;

        return this.IsPointInsideHitbox(hitbox, point) ? hitbox : null;
    }

    private GetHitboxesInObject(obj: GameObject, point: Vec2): Hitbox[]
    {
        var hitboxes: Hitbox[] = [];

        const collect = (current: GameObject) => {
            for (var i = current.children.length - 1; i >= 0; i--)
            {
                collect(current.children[i]);
            }

            const hitbox = current.tapHitbox;
            if (this.IsHitboxTouchable(hitbox) && this.IsPointInsideHitbox(hitbox, point))
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
            if (this.IsHitboxTouchable(obj.tapHitbox))
            {
                path.unshift(obj.tapHitbox);
            }

            obj = obj.parent;
        }

        return path;
    }

    private SetHoverHitbox(hitbox: Hitbox | null): void
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

        bare.SetCursor(this.currentHitboxHover ? 'pointer' : 'inherit');
    }

    private GetAllObjectsWithChildren(): GameObject[]
    {
        var allObjects: GameObject[] = [];
        var objs = this.scene.objectController.GetAllObjects();

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
        
        this.currentHitboxDown = this.currentHitboxHover;
        this.currentHitboxDown?.OnPress?.(this.currentHitboxDown.parent, event);

        event.preventDefault();
    }

    private PointerUp({ mouseX, mouseY, event }: BareEventPayload['pointer_up']): void
    {
        if (!this.currentHitboxDown)
            return;

        if (!this.currentHitboxDown.shouldReleaseOnTop || this.currentHitboxHover == this.currentHitboxDown)
            this.currentHitboxDown?.OnRelease?.(this.currentHitboxDown.parent, event);

        this.currentHitboxDown = null;

        if (isMobile)
        {
            if (this.currentHitboxHover)
            {
                this.SetHoverHitbox(null);
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
    }

    SetExclusiveLayer(...layers: int[])
    {
        this.exclusiveLayers = layers;
    }

    ClearExclusiveLayers()
    {
        this.exclusiveLayers.length = 0;
    }

    GetCurrentHitboxHover(): Hitbox | null
    {
        return this.currentHitboxHover;
    }

    GetCurrentHitboxDown(): Hitbox | null
    {
        return this.currentHitboxDown;
    }

    ResetCurrentHover()
    {
        this.currentHitboxHover = null;
        this.currentHitboxHoverPath = [];
        bare.SetCursor('inherit');
    }

    AssignButton<T extends GameObject>(gameObject: T, onPress: (go: T, ...args: any[]) => any): Hitbox;
    AssignButton(gameObject: GameObject, onPress: AnyPress): Hitbox;
    AssignButton(gameObject: GameObject, handlers: ButtonHandlers<any>): Hitbox;
    AssignButton(gameObject: GameObject, arg: any): Hitbox
    {
        const handlers: ButtonHandlers<any> = (typeof arg === "function" ? { OnPress: arg } : arg);
        var rect = { x1: 0, y1: 0, x2: gameObject.width, y2: gameObject.height };
        const hitbox = new Hitbox(gameObject, rect);

        hitbox.OnPress   = (...a: any[]) => handlers.OnPress?.(gameObject, ...a);
        hitbox.OnRelease = (...a: any[]) => handlers.OnRelease?.(gameObject, ...a);
        hitbox.OnEnter   = (...a: any[]) => handlers.OnEnter?.(gameObject, ...a);
        hitbox.OnLeave   = (...a: any[]) => handlers.OnLeave?.(gameObject, ...a);

        gameObject.tapHitbox = hitbox;
        
        return hitbox;
    }

    OnPointerDown(gameobject: GameObject, callback: AnyPress): void
    {
        this.AssignCallback(gameobject, "OnPress", callback);
    }

    OnPointerUp(gameobject: GameObject, callback: AnyPress): void
    {
        this.AssignCallback(gameobject, "OnRelease", callback);
    }

    OnPointerEnter(gameobject: GameObject, callback: AnyPress): void
    {
        this.AssignCallback(gameobject, "OnEnter", callback);
    }

    OnPointerLeave(gameobject: GameObject, callback: AnyPress): void
    {
        this.AssignCallback(gameobject, "OnLeave", callback);
    }

    AssignCallback(gameobject: GameObject, type: "OnPress" | "OnRelease" | "OnEnter" | "OnLeave", callback: AnyPress): void
    {
        var rect = {x1: 0, y1: 0, x2: gameobject.width, y2: gameobject.height};
        const hitbox = gameobject.tapHitbox ?? new Hitbox(gameobject, rect);
        hitbox[type] = callback;
        gameobject.tapHitbox = hitbox;
    }
}

export var hitboxController:HitboxController;
RegisterController(HitboxController);
