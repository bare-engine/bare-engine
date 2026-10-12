import { RegisterController } from "../globals";
import { Vec2 } from "../libraries/rapid-render";
import type { Scene } from "../scenes/scene";
import { BareEvent, CameraScaleMode, Rectangle, type Size } from "../types/bareTypes";
import { Enum, InspectorField, Limit, Locked } from "../utils/decorators";
import { Helper } from "../utils/helper";

type Point = { x: number, y: number };

// the scale that fits an area into a view: Contain shows all of it, Cover fills the view with it
function FitScale(view: Size, area: Size, mode: CameraScaleMode): number
{
    const sx = view.width / area.width;
    const sy = view.height / area.height;

    return mode == CameraScaleMode.Cover ? Math.max(sx, sy) : Math.min(sx, sy);
}

function HasSize(size: Size): boolean
{
    return size.width > 0 && size.height > 0;
}

// one axis of a view centered at `center`: centered on the bounds if it's bigger than them, else kept inside them
function ClampAxis(center: number, boundsStart: number, boundsLength: number, viewLength: number): number
{
    if (viewLength >= boundsLength)
        return boundsStart + boundsLength / 2;

    return Helper.Clamp(center, boundsStart + viewLength / 2, boundsStart + boundsLength - viewLength / 2);
}

export class CameraHandler {
    // the center the camera shows, kept within the bounds, without shake
    @InspectorField position: Vec2 = new Vec2(0, 0);

    // the zoom as set. it can be below what the bounds allow, `zoom` reads it raised to that
    private rawZoom: number = 1;

    // kept at or above the zoom where the bounds stop the camera zooming out, so changes to it always show
    @InspectorField @Limit(0.1)
    get zoom(): number { return Math.max(this.rawZoom, this.GetMinZoom()); }
    set zoom(zoom: number) { this.rawZoom = zoom; }

    // "logical area" you want to fit/cover on screen, with the scale mode
    @InspectorField dimensions: Size = { width: 0, height: 0 };

    // world bounds the camera is allowed to show
    @InspectorField bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

    @InspectorField @Enum(CameraScaleMode)
    scaleMode: CameraScaleMode = CameraScaleMode.Cover;

    // the scale that fits `dimensions` to the screen, `zoom` applies on top of it
    @InspectorField @Locked
    get zoomFit(): number
    {
        if (this.scaleMode == CameraScaleMode.None || !HasSize(this.dimensions))
            return 1;

        return FitScale(this.GetViewport(), this.dimensions, this.scaleMode);
    }

    scene: Scene;

    private shake: { x: number, y: number, startMs: number, durationMs: number, decay: boolean } | null = null;
    // the offset applied when the camera was last drawn
    private readonly shakeOffset: Vec2 = new Vec2(0, 0);

    private follow: { target: Point, speed: number } | null = null;

    constructor(scene: Scene)
    {
        this.scene = scene;

        bare.events.persistent.on(BareEvent.level_loaded, ({ level }) => {
            if (!this.scene.UI && level.dimensions)
                this.SetBounds({ x: 0, y: 0, width: level.dimensions.width, height: level.dimensions.height });
        });
    }

    Awake()
    {
        this.ResetForStart();
    }

    Update(deltaTime: number)
    {
        if (!this.follow)
            return;

        const { target, speed } = this.follow;
        const t = speed == Infinity ? 1 : 1 - Math.exp(-speed * deltaTime);

        this.SetPosition(Helper.Lerp(this.position.x, target.x, t), Helper.Lerp(this.position.y, target.y, t));
    }

    OnResize(prevWidth: number, prevHeight: number, newWidth: number, newHeight: number)
    {
        if (this.scene?.UI)
        {
            this.dimensions.width = newWidth;
            this.dimensions.height = newHeight;
            this.position.x = newWidth / 2;
            this.position.y = newHeight / 2;
            return;
        }

        if (prevWidth == this.dimensions.width && prevHeight == this.dimensions.height)
        {
            // Camera is tracking the screen size: keep it centered the same way it was
            // by shifting the center by half the size delta. A default-centered camera
            // stays centered (oldW/2 -> newW/2); an intentionally offset camera keeps
            // its offset. Without this the view stays centered on the old screen center
            // while the world/physics bounds move to 0..newW, so bounds look shifted.
            this.position.x += (newWidth - prevWidth) / 2;
            this.position.y += (newHeight - prevHeight) / 2;

            this.dimensions.width = newWidth;
            this.dimensions.height = newHeight;
        }
    }

    ResetForStart()
    {
        this.dimensions.width = bare.width;
        this.dimensions.height = bare.height;

        this.rawZoom = 1;
        this.scaleMode = CameraScaleMode.Cover;

        this.position.x = bare.width / 2;
        this.position.y = bare.height / 2;

        this.follow = null;
        this.StopShake();
    }

    SetZoom(zoom: number): this
    {
        this.zoom = zoom;

        return this;
    }

    // the zoom set with SetZoom, raised to what the bounds allow
    GetZoom(): number
    {
        return this.zoom;
    }

    // center position
    SetPosition(x: number, y: number): this
    {
        this.position.x = x;
        this.position.y = y;
        this.ClampToBounds();

        return this;
    }

    AddPosition(dx: number, dy: number): Vec2
    {
        this.SetPosition(this.position.x + dx, this.position.y + dy);
        return this.position;
    }

    // the center the camera shows, already kept within the bounds, without shake.
    // read right after SetPosition, it gives the new position, not the one from the last frame
    GetPosition(): Vec2
    {
        return this.position;
    }

    // moves the camera toward the target every frame, after the scene's update. speed is how fast it
    // catches up, higher follows tighter; leave it out to stay locked on
    Follow(target: Point, speed: number = Infinity): this
    {
        this.follow = { target, speed };

        return this;
    }

    StopFollow(): this
    {
        this.follow = null;

        return this;
    }

    SetDimensions(width: number, height: number): this
    {
        this.dimensions.width = width;
        this.dimensions.height = height;

        return this;
    }

    SetDimensionsToLevel(): this
    {
        var levelHandler = this.scene.Get("level");
        if (!levelHandler)
            return this;

        const dims = levelHandler.currentLevel.dimensions;
        this.SetDimensions(dims.width, dims.height);

        return this;
    }

    SetScaleMode(mode: CameraScaleMode): this
    {
        this.scaleMode = mode;

        return this;
    }

    SetBounds(bounds: Rectangle): this
    {
        this.bounds = bounds;

        return this;
    }

    DisableBounds(): this
    {
        this.bounds = { x: 0, y: 0, width: 0, height: 0 };

        return this;
    }

    // the zoom that shows an area of this many world units, like the whole level. With the
    // Contain and Cover scale modes, the camera never zooms out past its bounds anyway
    GetZoomToFit(width: number, height: number): number
    {
        return FitScale(this.GetViewport(), { width, height }, CameraScaleMode.Contain) / this.zoomFit;
    }

    // world to screen scale: the zoom combined with the fit to the screen
    GetScale(): number
    {
        return this.zoomFit * this.zoom;
    }

    // the lowest zoom the bounds allow: Cover never shows past them, Contain never zooms out
    // past the "fit" view. 0 without bounds or with CameraScaleMode.None
    private GetMinZoom(): number
    {
        if (this.scaleMode == CameraScaleMode.None || !HasSize(this.bounds))
            return 0;

        return FitScale(this.GetViewport(), this.bounds, this.scaleMode) / this.zoomFit;
    }

    private GetViewport(): Size
    {
        return { width: Math.max(1, rapid.width), height: Math.max(1, rapid.height) };
    }

    // the center as drawn: the position plus shake
    private GetDrawPosition(): Vec2
    {
        return new Vec2(this.position.x + this.shakeOffset.x, this.position.y + this.shakeOffset.y);
    }

    SetTransform(): void
    {
        if (!HasSize(this.dimensions))
            return;

        // zoom or screen size may have changed since SetPosition
        this.ClampToBounds();

        const scale = this.GetScale();
        this.UpdateShake(scale);

        rapid.applyCamera({
            position: this.GetDrawPosition(),
            scale: 1 / scale,
        });
    }

    // written back into position, so it can't drift unbounded while pressed against an edge
    // (otherwise AddPosition accumulates off-screen and reversing direction does nothing)
    private ClampToBounds(): void
    {
        if (bare.levelEditorOpen || !HasSize(this.bounds))
            return;

        const scale = this.GetScale();
        const { width: screenW, height: screenH } = this.GetViewport();

        this.position.x = ClampAxis(this.position.x, this.bounds.x, this.bounds.width, screenW / scale);
        this.position.y = ClampAxis(this.position.y, this.bounds.y, this.bounds.height, screenH / scale);
    }

    ScreenToWorld(x: number, y: number): Vec2
    {
        const scale = this.GetScale();
        const { width: screenW, height: screenH } = this.GetViewport();
        const center = this.GetDrawPosition();

        return new Vec2((x - screenW / 2) / scale + center.x, (y - screenH / 2) / scale + center.y);
    }

    WorldToScreen(x: number, y: number): Vec2
    {
        const scale = this.GetScale();
        const { width: screenW, height: screenH } = this.GetViewport();
        const center = this.GetDrawPosition();

        return new Vec2((x - center.x) * scale + screenW / 2, (y - center.y) * scale + screenH / 2);
    }

    // amount is in screen pixels: one number for both axes, or { x, y }
    StartShake(amount: number | Point = 5, seconds: number = 0.3, decay: boolean = true): this
    {
        const { x, y } = typeof amount == "number" ? { x: amount, y: amount } : amount;

        this.shake = {
            x: Math.max(0, x),
            y: Math.max(0, y),
            startMs: bare.gameTime,
            durationMs: Math.max(0, seconds * 1000),
            decay,
        };

        return this;
    }

    StopShake(): this
    {
        this.shake = null;
        this.shakeOffset.x = 0;
        this.shakeOffset.y = 0;

        return this;
    }

    private UpdateShake(scale: number): void
    {
        const shake = this.shake;
        const elapsed = shake ? Math.max(0, bare.gameTime - shake.startMs) : 0;
        if (!shake || elapsed >= shake.durationMs)
        {
            this.StopShake();
            return;
        }

        const decay = shake.decay ? (1 - elapsed / shake.durationMs) : 1;

        this.shakeOffset.x = (Math.random() * 2 - 1) * (shake.x * decay / scale);
        this.shakeOffset.y = (Math.random() * 2 - 1) * (shake.y * decay / scale);
    }

    Clear()
    {
        this.ResetForStart();
    }
}

RegisterController(CameraHandler);
