import { RegisterController } from "../globals";
import { Vec2 } from "../libraries/rapid-render";
import type { Scene } from "../scenes/scene";
import { BareEvent, CameraScaleMode, Rectangle, type Size } from "../types/bareTypes";
import { Enum, InspectorField, Limit, Locked } from "../utils/decorators";
import { Helper } from "../utils/helper";

export class CameraHandler {
    // actual camera center (after clamping)
    position: Vec2 = new Vec2(0, 0);

    // target camera center
    @InspectorField target: Vec2 = new Vec2(0, 0);

    @InspectorField @Limit(0.1)
    zoom: number = 1;

    // "logical area" you want to fit/cover on screen when zoomFit is applied
    dimensions: Size = { width: 0, height: 0 };

    @InspectorField
    private get _dimensions(): Size { return this.dimensions; }
    private set _dimensions(dimensions: Size) { this.SetDimensions(dimensions.width, dimensions.height); }
    
    // world bounds the camera is allowed to show
    @InspectorField bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

    // screen-space size content is fit/centered into, top-left anchored; {0,0} = use the actual render target size (rapid.width/height)
    @InspectorField viewportSize: Size = { width: 0, height: 0 };

    scaleMode: CameraScaleMode = CameraScaleMode.Cover;
   
    @InspectorField
    @Enum(CameraScaleMode)
    private get _scaleMode(): CameraScaleMode { return this.scaleMode; }
    private set _scaleMode(mode: CameraScaleMode) { this.SetScaleMode(mode); }

    // derived
    @InspectorField @Locked zoomFit: number = 1;
    offset: Vec2 = new Vec2(0, 0);

    scene: Scene;

    // shake
    private shakeActive: boolean = false;
    private shakeStartMs: number = 0;
    private shakeDurationMs: number = 0;
    private shakeIntensityX: number = 0;
    private shakeIntensityY: number = 0;
    private shakeDecay: boolean = true;
    // the offset applied when the camera was last drawn
    private shakeOffset: Vec2 = new Vec2(0, 0);

    get topLeftTargetX(): number
    {
        return this.target.x - this.offset.x
    }
    set topLeftTargetX(value: number)
    {
        this.target.x = value - this.offset.x;
    }
    get topLeftTargetY(): number
    {
        return this.target.y - this.dimensions.height / 2;
    }
    set topLeftTargetY(value: number)
    {
        this.target.y = value + this.dimensions.height / 2;
    }

    constructor(scene: Scene)
    {
        this.scene = scene;
        //events.persistent.on(BareEvent.gameStarted, () => this.ResetForStart());

        bare.events.persistent.on(BareEvent.level_loaded, ({ level }) => {
            if (this.scene.UI)
                return; //

            const dims: Size = level.dimensions;
            
            //if (this.bounds.x == 0 && this.bounds.y == 0 && this.bounds.width == 0 && this.bounds.height == 0)
            if (dims)
                this.SetBounds({ x: 0, y: 0, width: dims.width, height: dims.height });

            this.CalculateZoomFit();
        });
    }

    Awake()
    {
        this.ResetForStart();
    }

    OnResize(prevWidth: number, prevHeight: number, newWidth: number, newHeight: number)
    {
        if (this.scene?.UI)
        {
            this.dimensions.width = newWidth;
            this.dimensions.height = newHeight;
            this.target.x = newWidth / 2;
            this.target.y = newHeight / 2;
            this.position.x = this.target.x;
            this.position.y = this.target.y;
            this.zoomFit = 1;
            return;
        }

        if (prevWidth == this.dimensions.width && prevHeight == this.dimensions.height)
        {
            // Camera is tracking the screen size: keep it centered the same way it was
            // by shifting the center by half the size delta. A default-centered camera
            // stays centered (oldW/2 -> newW/2); an intentionally offset camera keeps
            // its offset. Without this the view stays centered on the old screen center
            // while the world/physics bounds move to 0..newW, so bounds look shifted.
            const dx = (newWidth - this.dimensions.width) / 2;
            const dy = (newHeight - this.dimensions.height) / 2;

            this.dimensions.width = newWidth;
            this.dimensions.height = newHeight;

            this.target.x += dx;
            this.target.y += dy;
            this.position.x += dx;
            this.position.y += dy;
        }
        this.CalculateZoomFit();
    }

    ResetForStart()
    {
        this.dimensions.width = bare.width;
        this.dimensions.height = bare.height;

        //this.bounds = { x: 0, y: 0, width: bareEngine.width, height: bareEngine.height };

        this.zoomFit = 1;
        this.zoom = 1;
        this.scaleMode = CameraScaleMode.Cover;

        this.target.x = bare.width / 2;
        this.target.y = bare.height / 2;

        this.position.x = this.target.x;
        this.position.y = this.target.y;

        this.offset.x = 0;
        this.offset.y = 0;

        this.CalculateZoomFit();

        this.StopShake();
    }

    SetZoom(zoom: number)
    {
        this.zoom = zoom;
    }

    // center position
    SetPosition(x: number, y: number)
    {
        this.target.x = x;
        this.target.y = y;
        this.ClampTargetToBounds(this.GetScale());

        // move the drawn position along, keeping the current shake, so ScreenToWorld and
        // WorldToScreen match the new position right away instead of from the next frame
        this.position.x = this.target.x + this.shakeOffset.x;
        this.position.y = this.target.y + this.shakeOffset.y;
    }

    // top-left position
    SetPositionTopLeft(x: number, y: number)
    {
        this.SetPosition(x + this.dimensions.width / 2, y + this.dimensions.height / 2);
    }

    AddPosition(dx: number, dy: number): Vec2
    {
        this.SetPosition(this.target.x + dx, this.target.y + dy);
        return this.target;
    }

    // the center the camera shows, already kept within the bounds, without shake.
    // read right after SetPosition, it gives the new position, not the one from the last frame
    GetPosition(): Vec2
    {
        return this.target;
    }

    SetDimensions(width: number, height: number)
    {
        this.dimensions.width = width;
        this.dimensions.height = height;
        this.CalculateZoomFit();
    }

    DisableBounds()
    {
        this.bounds = { x: 0, y: 0, width: 0, height: 0 };
    }

    SetScaleMode(mode: CameraScaleMode)
    {
        this.scaleMode = mode;
        this.CalculateZoomFit();
    }

    SetBounds(bounds: Rectangle)
    {
        this.bounds = bounds;
    }

    SetBoundsToScreen()
    {
        this.SetBounds({ x: 0, y: 0, width: bare.width, height: bare.height });
    }

    SetBoundsToLevel()
    {
        var levelHandler = this.scene.Get("level");
        if (!levelHandler)
            return;

        const dims = levelHandler.currentLevel.dimensions;
        this.SetBounds({ x: 0, y: 0, width: dims.width, height: dims.height });
    }

    SetDimensionsToLevel()
    {
        var levelHandler = this.scene.Get("level");
        if (!levelHandler)
            return;

        const dims = levelHandler.currentLevel.dimensions;
        this.SetDimensions(dims.width, dims.height);
    }

    SetBoundsAndDimensionsToLevel()
    {
        this.SetBoundsToLevel();
        this.SetDimensionsToLevel();
    }

    // screen-space size to fit/center content into; falls back to the actual render target size
    private GetViewport(): Size
    {
        if (this.viewportSize.width > 0 && this.viewportSize.height > 0)
            return this.viewportSize;

        return { width: Math.max(1, rapid.width), height: Math.max(1, rapid.height) };
    }

    // the zoom set with SetZoom
    GetZoom(): number
    {
        return this.zoom;
    }

    // the zoom that shows an area of this many world units, like the whole level. With the
    // Contain and Cover scale modes, the camera never zooms out past its bounds anyway
    GetZoomToFit(width: number, height: number): number
    {
        const { width: screenW, height: screenH } = this.GetViewport();

        return Math.min(screenW / width, screenH / height) / this.zoomFit;
    }

    // world to screen scale: the zoom combined with the fit to the screen, kept within the bounds
    GetScale(): number
    {
        let finalScale = this.zoomFit * this.zoom;

        const hasBounds = this.bounds.width > 0 && this.bounds.height > 0;
        if (hasBounds && this.scaleMode !== CameraScaleMode.None) {
            const { width: screenW, height: screenH } = this.GetViewport();

            const coverFit = Math.max(
                screenW / this.bounds.width,
                screenH / this.bounds.height
            );

            const containFit = Math.min(
                screenW / this.bounds.width,
                screenH / this.bounds.height
            );

            if (this.scaleMode === CameraScaleMode.Cover) {
                if (finalScale < coverFit) finalScale = coverFit;
            } else {
                // Contain: don't allow zooming out past the "fit" view
                if (finalScale < containFit) finalScale = containFit;
            }
        }

        return finalScale;
    }

    // zoomFit so that `dimensions` contain/cover the *screen*
    CalculateZoomFit()
    {
        if (this.dimensions.width == 0 || this.dimensions.height == 0)
            return;

        const w = Math.max(1, this.dimensions.width);
        const h = Math.max(1, this.dimensions.height);

        const { width: screenW, height: screenH } = this.GetViewport();

        const sx = screenW / w;
        const sy = screenH / h;

        if (this.scaleMode == CameraScaleMode.None)
            this.zoomFit = 1;
        else
        {
            const contain = (this.scaleMode == CameraScaleMode.Contain);
            this.zoomFit = contain ? Math.min(sx, sy) : Math.max(sx, sy);
        }

        if (!Number.isFinite(this.zoomFit) || this.zoomFit <= 0)
            this.zoomFit = 1;
    }

    SetTransform(): void
    {
        if (this.dimensions.width == 0 || this.dimensions.height == 0)
            return;

        //if (this.dimensions.width == bareEngine.width && this.dimensions.height == bareEngine.height)
        //    return;

        //if (this.position.x == 0 && this.position.y == 0 && this.zoom == 1)
        //  return;

        const scale = this.GetScale();

        const { width: screenW, height: screenH } = this.GetViewport();

        // zoom or screen size may have changed since SetPosition
        this.ClampTargetToBounds(scale);

        this.shakeOffset = this.GetShakeOffset(scale);
        this.position.x = this.target.x + this.shakeOffset.x;
        this.position.y = this.target.y + this.shakeOffset.y;

        // offset so that camera center maps to screen center (world units)
        this.offset.x = -screenW / 2 / scale;
        this.offset.y = -screenH / 2 / scale;

        // SET TRANSFORM
        // applyCamera centers on rapid's view itself; only a custom viewportSize needs the difference
        rapid.matrixStack.translate((screenW - rapid.width) / 2, (screenH - rapid.height) / 2);
        rapid.applyCamera({
                position: this.position,
                scale: 1 / scale,
            });
    }

    private ClampTargetToBounds(scale: number): void
    {
        const hasBounds = this.bounds.width > 0 && this.bounds.height > 0;
        if (bare.levelEditorOpen || !hasBounds)
            return;

        const { width: screenW, height: screenH } = this.GetViewport();

        const bx = this.bounds.x;
        const by = this.bounds.y;
        const bw = this.bounds.width;
        const bh = this.bounds.height;

        const viewW = screenW / scale;
        const viewH = screenH / scale;

        // For BOTH modes:
        // - if viewport bigger than bounds on an axis => center on that axis
        // - else clamp on that axis
        // Written back into target so it can't drift unbounded while pressed against an edge
        // (otherwise AddPosition accumulates off-screen and reversing direction does nothing).
        if (viewW >= bw) this.target.x = bx + bw / 2;
        else this.target.x = Helper.Clamp(this.target.x, bx + viewW / 2, bx + bw - viewW / 2);

        if (viewH >= bh) this.target.y = by + bh / 2;
        else this.target.y = Helper.Clamp(this.target.y, by + viewH / 2, by + bh - viewH / 2);
    }

    ScreenToWorld(x: number, y: number)
    {
        const p = new Vec2();
        const scale = this.GetScale();

        const { width: screenW, height: screenH } = this.GetViewport();

        p.x = (x - screenW / 2) / scale + this.position.x;
        p.y = (y - screenH / 2) / scale + this.position.y;

        return p;
    }

    WorldToScreen(x: number, y: number)
    {
        const p = new Vec2();
        const scale = this.GetScale();

        const { width: screenW, height: screenH } = this.GetViewport();

        p.x = (x - this.position.x) * scale + screenW / 2;
        p.y = (y - this.position.y) * scale + screenH / 2;

        return p;
    }

    StartShakeXY(shakeX: number = 5, shakeY: number = 5, seconds: number = 0.3, decay: boolean = true)
    {
        this.shakeActive = true;
        this.shakeStartMs = bare.time;
        this.shakeDurationMs = Math.max(0, seconds * 1000);
        this.shakeIntensityX = Math.max(0, shakeX);
        this.shakeIntensityY = Math.max(0, shakeY);
        this.shakeDecay = decay;
    }

    StartShake(shake: number = 5, seconds: number = 0.3, decay: boolean = true)
    {
        this.StartShakeXY(shake, shake, seconds, decay);
    }

    StopShake()
    {
        this.shakeActive = false;
        this.shakeStartMs = 0;
        this.shakeDurationMs = 0;
        this.shakeIntensityX = 0;
        this.shakeIntensityY = 0;
        this.shakeOffset = new Vec2(0, 0);
    }

    private GetShakeOffset(scale: number): Vec2
    {
        if (!this.shakeActive || this.shakeDurationMs <= 0 || (this.shakeIntensityX <= 0 && this.shakeIntensityY <= 0))
            return new Vec2(0, 0);

        const elapsed = Math.max(0, bare.time - this.shakeStartMs);
        if (elapsed >= this.shakeDurationMs)
        {
            this.StopShake();
            return new Vec2(0, 0);
        }

        const decay = this.shakeDecay ? (1 - elapsed / this.shakeDurationMs) : 1;
        const ampX = this.shakeIntensityX * decay;
        const ampY = this.shakeIntensityY * decay;

        const x = (Math.random() * 2 - 1) * (ampX / scale);
        const y = (Math.random() * 2 - 1) * (ampY / scale);

        return new Vec2(x, y);
    }

    Clear()
    {
        this.ResetForStart();
    }
}

RegisterController(CameraHandler);
