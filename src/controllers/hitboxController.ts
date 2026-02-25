import { BareEngine } from "../bareEngine";
import { Vec2 } from "../libraries/rapid-render";
import { Scene } from "../main";
import { GameObject } from "../objects/gameObject";
import { BareEvent, BareEventPayload, CollisionHandlingType } from '../types/bareTypes';
import { HitboxType } from "../types/gamesTypes";
import { Hitbox } from "../types/hitbox";
import { Helper } from "../utils/helper";
import { mouseController } from "./mouseController";
import { objectController } from "./objectController";

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

    private exclusiveLayers: int[] = [];

    public scene: Scene;

    public preventUpdateOneFrame: boolean = false;

    constructor(scene: Scene)
    {
        this.scene = scene;
    }

	Start(): void
	{
        bareEngine.SetCursor('inherit');//

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

        this.HandleUpdate(objectController.GetLayers());

        if (this.currentHitboxHover)
        {

        }
    }

    Render()
    {
        if (!window.debug)
            return;

        var objs = objectController.GetAllObjects();

        for (var i = objs.length - 1; i >= 0; i--)
        {
            var obj = objs[i];
            var hitbox = obj.tapHitbox;

            if ((obj as any).isPhysicsObject)
                hitbox = (obj as any).physicsHitbox;
            
            if (!hitbox?.active)
                continue;

            if (hitbox.type == HitboxType.Circle)
            {
                const center = this.GetHitboxCircleCenter(hitbox);
                const radius = this.GetHitboxRadius(hitbox);
                
                rapid.renderCircle({
                    offset: new Vec2(center.x, center.y),
                    radius: radius,
                    segments: 32
                });
            }
            else if (hitbox.type == HitboxType.Rectangle)
            {
                const rect = this.GetHitboxRect(hitbox);
                
                rapid.renderRect({
                    offset: new Vec2(rect.x1, rect.y1),
                    width: rect.width,
                    height: rect.height,
                    color: obj.hitboxColor
                });
            }
        }
    }

    HandleUpdate(layers: GameObject[][])
    {
        if (this.currentHitboxHover)
        {
            const mouse = mouseController.world.position;
            const isInsideCurrentHitbox = this.IsPointInsideHitbox(this.currentHitboxHover, mouse);
            if (!isInsideCurrentHitbox)
            {
                this.HandleHitboxLeave(this.currentHitboxHover);
            }
            else
            {
                //return; // COMMENTED, CAN STILL BE OTHER HITBOXES WITHIN CURRENT HITBOX
            }
        }

        var l = Object.keys(this.scene.layerInfos).length;
        for (var i = 0; i < layers.length; i++)
        {
            const layer = i;

            if (layer > l - 1)
                continue;

            if (this.exclusiveLayers.length > 0 && !this.exclusiveLayers.includes(layer))
                continue;

            var layerCollisionHandlingType = this.scene.layerInfos[i].pointerCollisionType ?? CollisionHandlingType.POINT;

            var objs = layers[i];
            var fullBreak = false;

            var closestDistSqr = 100000;
            var curClosestHitbox: Hitbox | null = null;
                
            const mouse = mouseController.world.position;
            
            for (var j = objs.length - 1; j >= 0; j--)
            {
                var obj = objs[j];
                var hitbox = obj.tapHitbox;
                
                if (!hitbox?.active)
                    continue;

                if (!hitbox.parent.visible && !bareEngine.levelEditorOpen)
                    continue;

                if (!hitbox.parent.visibleInEditor)
                    continue;

                if (layerCollisionHandlingType == CollisionHandlingType.POINT)
                {
                    const isInside = this.IsPointInsideHitbox(hitbox, mouse);
                    if (isInside)
                    {
                        if (hitbox != this.currentHitboxHover)
                            this.HandleHitboxEnter(hitbox);
                        
                        fullBreak = true;
                        break;
                    }
                }
                else if (layerCollisionHandlingType == CollisionHandlingType.RADIUS)
                {
                    const center = this.GetHitboxCenter(hitbox);
                    const distToHitboxSqr = Helper.DistanceNoSqr(mouse, center);
                    const isInside = this.IsPointInsideHitbox(hitbox, mouse);

                    if (isInside && distToHitboxSqr < closestDistSqr)
                    {
                        closestDistSqr = distToHitboxSqr;
                        curClosestHitbox = hitbox;
                        
                        if (hitbox == this.currentHitboxHover)
                        {
                            curClosestHitbox = null;
                        }
                    }
                }

                if (fullBreak)
                    break;
            }

            if (layerCollisionHandlingType == CollisionHandlingType.RADIUS && curClosestHitbox)
            {
                this.HandleHitboxEnter(curClosestHitbox);
            }

            if (layerCollisionHandlingType == CollisionHandlingType.POINT && fullBreak)
                break;
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
        const localEdge = new Vec2(localCenter.x + hitbox.radius, localCenter.y);

        const worldCenter = parent.ToGlobal(localCenter);
        const worldEdge = parent.ToGlobal(localEdge);

        return Helper.Distance(worldCenter, worldEdge);
    }

    private GetHitboxRect(hitbox: Hitbox)
    {
        const rect = hitbox.rectangle;
        const parent = hitbox.parent;

        const totalScaleX = parent.totalScaleX;
        const totalScaleY = parent.totalScaleY;
        const pivotWorld = new Vec2(
            parent.pivot.x * parent.totalScaleX,
            parent.pivot.y * parent.totalScaleY
        );
        const topLeftWorld = parent.position
            .add(new Vec2(rect.x * totalScaleX, rect.y * totalScaleY))
            .subtract(pivotWorld);
        const bottomRightWorld = parent.position
            .add(new Vec2(
                (rect.x + rect.width) * totalScaleX,
                (rect.y + rect.height) * totalScaleY
            ))
            .subtract(pivotWorld);

        let x1, y1, x2, y2;

        x1 = Math.min(topLeftWorld.x, bottomRightWorld.x);
        y1 = Math.min(topLeftWorld.y, bottomRightWorld.y);
        x2 = Math.max(topLeftWorld.x, bottomRightWorld.x);
        y2 = Math.max(topLeftWorld.y, bottomRightWorld.y);

        return {
            x1,
            y1,
            x2,
            y2,
            width: x2 - x1,
            height: y2 - y1
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

    private DistanceToHitboxCenterSqr(hitbox: Hitbox, point: Vec2): number
    {
        const center = this.GetHitboxCenter(hitbox);
        return Helper.DistanceNoSqr(point, center);
    }

    private IsPointInsideHitbox(hitbox: Hitbox, point: Vec2): boolean
    {
        if (hitbox.type === HitboxType.Circle)
        {
            const hitboxPosition = this.GetHitboxCircleCenter(hitbox);
            const distToHitboxSqr = Helper.DistanceNoSqr(point, hitboxPosition);
            const radius = this.GetHitboxRadius(hitbox);
            const radiusSqr = radius * radius;

            return distToHitboxSqr < radiusSqr;
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

    private HandleHitboxLeave(hitbox: Hitbox): void
    {
        hitbox.OnLeave?.(hitbox.parent);
        bareEngine.SetCursor('inherit');
        this.currentHitboxHover = null;
    }

    private HandleHitboxEnter(hitbox: Hitbox): void
    {
        if (this.currentHitboxHover)
        {
            this.HandleHitboxLeave(this.currentHitboxHover);
        }

        bareEngine.SetCursor('pointer');
        hitbox.OnEnter?.(hitbox.parent);
        this.currentHitboxHover = hitbox;
    }

    private PointerDown({ mouseX, mouseY, event, isLeftButton }: BareEventPayload['pointer_down']): void
    {
        if (!isLeftButton)
            return;

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
                this.HandleHitboxLeave(this.currentHitboxHover);
            }
        }

        event.preventDefault();
    }

    Activate()
    {
        this.active = true;
    }

    Clear()
    {
        bareEngine.SetCursor('inherit');
        this.currentHitboxHover = null;
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
        bareEngine.SetCursor('inherit');
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
BareEngine.RegisterController(HitboxController);
