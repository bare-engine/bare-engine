import { globalEvents, pipes } from "../main";
import { GameObject } from "../objects/gameObject";
import { Helper } from "../utils/helper";
import { Hitbox } from "../types/hitbox";
import { HitboxType } from "../types/gamesTypes";
import { BareEventPayload, CollisionHandlingType, UI_LAYER, BareEvent, Events } from '../types/bareTypes';
import { Vec2 } from "../libraries/rapid-render";
import { mouseController } from "./mouseController";
import { ObjectController } from "./objectController";
import { Emitter } from "../libraries/mitt";
import { BareEngine } from "../bareEngine";

type AnyPress = (go: any, ...args: any[]) => any;

type Handler<Arg extends GameObject = GameObject> = (go?: Arg | null, ...args: any[]) => any;

type ButtonHandlers<Arg extends GameObject = GameObject> = {
  OnPress?: Handler<Arg>;
  OnRelease?: Handler<Arg>;
  OnEnter?: Handler<Arg>;
  OnLeave?: Handler<Arg>;
};

export class HitboxController
{
    public active: boolean = true;
    private objectController: ObjectController;

    private currentHitboxHover: Hitbox | null = null;
    private currentHitboxDown: Hitbox | null = null;

    private exclusiveLayers: int[] = [];

    constructor(objectController: ObjectController, events:Emitter<Events>)
    {
        this.objectController = objectController;
    }

	Start(): void
	{
        bare.events.on(BareEvent.pointer_down, this.PointerDown.bind(this));
        bare.events.on(BareEvent.pointer_up, this.PointerUp.bind(this));
        //bare.events.on(BareEvent.pointer_move, this.PointerMove.bind(this));
    }

    private PointerMove({ mouseX, mouseY, event }: BareEventPayload['pointer_move']): void
    {
        this.Update();
    }

    Update(): void
    {
        if (!this.active)
            return;

        if (isMobile && !mouseController.IsMouseDown())
            return;

        if (this.currentHitboxHover)
        {
            const isUIObject = this.IsUIObject(this.currentHitboxHover.parent);
            const mouse = isUIObject ? mouseController.screen.position : mouseController.world.position;
            const isInsideCurrentHitbox = this.IsPointInsideHitbox(this.currentHitboxHover, mouse, isUIObject);
            if (!isInsideCurrentHitbox)
            {
                this.HandleHitboxLeave(this.currentHitboxHover);
            }
        }
        
        this.HandleUpdate(this.objectController.GetLayers(), false);
    }

    Render()
    {
        if (!window.debug)
            return;

        var objs = this.objectController.GetAllObjects();

        for (var i = objs.length - 1; i >= 0; i--)
        {
            var obj = objs[i];
            var hitbox = obj.tapHitbox;
            const isUIObject = this.IsUIObject(obj);

            if ((obj as any).isPhysicsObject)
                hitbox = (obj as any).physicsHitbox;
            
            if (!hitbox?.active)
                continue;

            if (isUIObject)
            {
                rapid.save();
                rapid.matrixStack.identity();
            }

            if (hitbox.type == HitboxType.Circle)
            {
                const center = this.GetHitboxCircleCenter(hitbox, isUIObject);
                const radius = this.GetHitboxRadius(hitbox, isUIObject);
                
                rapid.renderCircle({
                    offset: new Vec2(center.x, center.y),
                    radius: radius,
                    segments: 32,
                    points: [],
                });
            }
            else if (hitbox.type == HitboxType.Rectangle)
            {
                const rect = this.GetHitboxRect(hitbox, isUIObject);
                
                rapid.renderRect({
                    offset: new Vec2(rect.x1, rect.y1),
                    width: rect.width,
                    height: rect.height,
                    points: [],
                    color: obj.hitboxColor
                });
            }

            if (isUIObject)
            {
                rapid.restore();
            }
        }
    }

    HandleUpdate(layers: GameObject[][], isUI: boolean)
    {
        if (this.currentHitboxHover)
        {
            const isUIObject = this.IsUIObject(this.currentHitboxHover.parent);
            const mouse = isUIObject ? mouseController.screen.position : mouseController.world.position;
            const isInsideCurrentHitbox = this.IsPointInsideHitbox(this.currentHitboxHover, mouse, isUIObject);
            if (!isInsideCurrentHitbox)
            {
                this.HandleHitboxLeave(this.currentHitboxHover);
            }
            else
            {
                //return; // COMMENTED, CAN STILL BE OTHER HITBOXES WITHIN CURRENT HITBOX
            }
        }

        var l = Object.keys(bare.layerInfos).length;
        for (var i = 0; i < layers.length; i++)
        {
            const layer = i;

            if (layer > l - 1)
                continue;

            if (this.exclusiveLayers.length > 0 && !this.exclusiveLayers.includes(layer))
                continue;

            var layerInfoI = (isUI ? UI_LAYER + i : i); 
            var layerCollisionHandlingType = bare.layerInfos[layerInfoI].pointerCollisionType ?? CollisionHandlingType.POINT;

            var objs = layers[i];
            var fullBreak = false;

            var closestDistSqr = 100000;
            var curClosestHitbox: Hitbox | null = null;

            for (var j = objs.length - 1; j >= 0; j--)
            {
                var obj = objs[j];
                var hitbox = obj.tapHitbox;
                
                if (!hitbox?.active)
                    continue;

                if (!hitbox.parent.visible && !bare.levelEditorOpen)
                    continue;

                if (!hitbox.parent.visibleInEditor)
                    continue;
                
                const mouse = isUI ? mouseController.screen.position : mouseController.world.position;

                if (layerCollisionHandlingType == CollisionHandlingType.POINT)
                {
                    if (hitbox === this.currentHitboxHover)
                        continue;

                    const isInside = this.IsPointInsideHitbox(hitbox, mouse, isUI);
                    if (isInside)
                    {
                        this.HandleHitboxEnter(hitbox);
                        fullBreak = true;
                        break;
                    }
                }
                else if (layerCollisionHandlingType == CollisionHandlingType.RADIUS)
                {
                    const center = this.GetHitboxCenter(hitbox, isUI);
                    const distToHitboxSqr = Helper.DistanceNoSqr(mouse, center);
                    const isInside = this.IsPointInsideHitbox(hitbox, mouse, isUI);

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
            }

            if (layerCollisionHandlingType == CollisionHandlingType.RADIUS && curClosestHitbox)
            {
                this.HandleHitboxEnter(curClosestHitbox);
            }

            if (layerCollisionHandlingType == CollisionHandlingType.POINT && fullBreak)
                break;
        }
    }

    private ToScreenSpace(point: Vec2, isUIObject: boolean): Vec2
    {
        if (isUIObject)
            return point;

        return currentSceneProcessing.WorldToScreen(point.x, point.y);
    }

    private GetHitboxCircleCenter(hitbox: Hitbox, isUIObject: boolean): Vec2
    {
        const parent = hitbox.parent;
        const localCenter = new Vec2(
            hitbox.circleOffset.x + parent.pivot.x,
            hitbox.circleOffset.y + parent.pivot.y
        );
        const worldCenter = parent.ToGlobal(localCenter);

        if (isUIObject)
            return this.ToScreenSpace(worldCenter, true);

        return worldCenter;
    }

    private GetHitboxRadius(hitbox: Hitbox, isUIObject: boolean): number
    {
        const parent = hitbox.parent;
        const localCenter = new Vec2(
            hitbox.circleOffset.x + parent.pivot.x,
            hitbox.circleOffset.y + parent.pivot.y
        );
        const localEdge = new Vec2(localCenter.x + hitbox.radius, localCenter.y);

        const worldCenter = parent.ToGlobal(localCenter);
        const worldEdge = parent.ToGlobal(localEdge);

        if (isUIObject)
        {
            const screenCenter = this.ToScreenSpace(worldCenter, true);
            const screenEdge = this.ToScreenSpace(worldEdge, true);
            return Helper.Distance(screenCenter, screenEdge);
        }

        return Helper.Distance(worldCenter, worldEdge);
    }

    private GetHitboxRect(hitbox: Hitbox, isUIObject: boolean)
    {
        const rect = hitbox.rectangle;
        const parent = hitbox.parent;

        const innerScaleX = parent.innerScale.x;
        const innerScaleY = parent.innerScale.y;
        const pivotWorld = new Vec2(
            parent.pivot.x * parent.totalScaleX,
            parent.pivot.y * parent.totalScaleY
        );
        const topLeftWorld = parent.position
            .add(new Vec2(rect.x * innerScaleX, rect.y * innerScaleY))
            .subtract(pivotWorld);
        const bottomRightWorld = parent.position
            .add(new Vec2(
                (rect.x + rect.width) * innerScaleX,
                (rect.y + rect.height) * innerScaleY
            ))
            .subtract(pivotWorld);

        let x1, y1, x2, y2;

        if (isUIObject)
        {
            const topLeft = this.ToScreenSpace(topLeftWorld, true);
            const bottomRight = this.ToScreenSpace(bottomRightWorld, true);
            x1 = Math.min(topLeft.x, bottomRight.x);
            y1 = Math.min(topLeft.y, bottomRight.y);
            x2 = Math.max(topLeft.x, bottomRight.x);
            y2 = Math.max(topLeft.y, bottomRight.y);
        }
        else
        {
            x1 = Math.min(topLeftWorld.x, bottomRightWorld.x);
            y1 = Math.min(topLeftWorld.y, bottomRightWorld.y);
            x2 = Math.max(topLeftWorld.x, bottomRightWorld.x);
            y2 = Math.max(topLeftWorld.y, bottomRightWorld.y);
        }

        return {
            x1,
            y1,
            x2,
            y2,
            width: x2 - x1,
            height: y2 - y1
        };
    }

    private GetHitboxCenter(hitbox: Hitbox, isUIObject: boolean): Vec2
    {
        if (hitbox.type === HitboxType.Circle)
        {
            return this.GetHitboxCircleCenter(hitbox, isUIObject);
        }

        const rect = this.GetHitboxRect(hitbox, isUIObject);
        return new Vec2(rect.x1 + rect.width / 2, rect.y1 + rect.height / 2);
    }

    private DistanceToHitboxCenterSqr(hitbox: Hitbox, point: Vec2, isUIObject: boolean): number
    {
        const center = this.GetHitboxCenter(hitbox, isUIObject);
        return Helper.DistanceNoSqr(point, center);
    }

    private IsPointInsideHitbox(hitbox: Hitbox, point: Vec2, isUIObject: boolean): boolean
    {
        if (hitbox.type === HitboxType.Circle)
        {
            const hitboxPosition = this.GetHitboxCircleCenter(hitbox, isUIObject);
            const distToHitboxSqr = Helper.DistanceNoSqr(point, hitboxPosition);
            const radius = this.GetHitboxRadius(hitbox, isUIObject);
            const radiusSqr = radius * radius;

            return distToHitboxSqr < radiusSqr;
        } 
        else if (hitbox.type === HitboxType.Rectangle)
        {
            const rect = this.GetHitboxRect(hitbox, isUIObject);
            
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
        bare.SetCursor('inherit');
        this.currentHitboxHover = null;
    }

    private HandleHitboxEnter(hitbox: Hitbox): void
    {
        if (this.currentHitboxHover)
        {
            this.HandleHitboxLeave(this.currentHitboxHover);
        }

        bare.SetCursor('pointer');
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
        bare.SetCursor('inherit');
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
        bare.SetCursor('inherit');
    }

    private IsUIObject(obj: GameObject): boolean
    {
        return (uiController.GetObjectLayer(obj) != -1);
    }

    AssignButton<T extends GameObject>(gameObject: T, onPress: (go: T, ...args: any[]) => any): Hitbox;
    AssignButton(gameObject: GameObject, onPress: AnyPress): Hitbox;
    AssignButton(gameObject: GameObject, handlers: ButtonHandlers<any>): Hitbox;
    AssignButton(gameObject: GameObject, arg: any): Hitbox
    {
        const handlers: ButtonHandlers<any> = (typeof arg === "function" ? { OnPress: arg } : arg);
        const hitbox = new Hitbox(gameObject, 50);

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


export const hitboxController = BareEngine.RegisterControllerProxy(HitboxController);

