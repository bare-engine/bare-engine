import { BareEngine } from "../exports";
import { Vec2 } from "../libraries/rapid-render";
import { Scene } from "../main";
import { BareEvent, CameraScaleMode, Rectangle, type Size } from "../types/bareTypes";
import { Helper } from "../utils/helper";

export class CameraHandler {
  scaleMode: CameraScaleMode = CameraScaleMode.Cover;
  zoom: number = 1;

  // "logical area" you want to fit/cover on screen when zoomFit is applied
  dimensions: Size = { width: 0, height: 0 };

  // world bounds the camera is allowed to show
  bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

  // target camera center (unbounded)
  target: Vec2 = new Vec2(0, 0);

  // actual camera center (after clamping)
  position: Vec2 = new Vec2(0, 0);

  // derived
  zoomFit: number = 1;
  offset: Vec2 = new Vec2(0, 0);
  scene: Scene;

  // shake
  private shakeActive: boolean = false;
  private shakeStartMs: number = 0;
  private shakeDurationMs: number = 0;
  private shakeIntensityX: number = 0;
  private shakeIntensityY: number = 0;
  private shakeDecay: boolean = true;

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

    this.scene.events.persistent.on(BareEvent.level_loaded, ({ level }) => {
      const dims: Size = level.dimensions;
      this.SetBounds({ x: 0, y: 0, width: dims.width, height: dims.height });
      //this.SetDimensions(dims.width,  dims.height );
      this.CalculateZoomFit();
      // default to level center
      //this.SetPosition(dims.width / 2, dims.height / 2);
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
      this.dimensions.width = newWidth;
      this.dimensions.height = newHeight;
    }
    this.CalculateZoomFit();
  }

  ResetForStart()
  {
    this.dimensions.width = bare.width;
    this.dimensions.height = bare.height;

    //this.bounds = { x: 0, y: 0, width: bare.width, height: bare.height };

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

  // center position
  SetPosition(x: number, y: number)
  {
    this.target.x = x;
    this.target.y = y;
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

  GetPosition(): Vec2 
  {
    return this.position;
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
    this.CalculateZoomFit();
  }

  SetBoundsToScreen() 
  {
    this.SetBounds({ x: 0, y: 0, width: bare.width, height: bare.height });
  }

  SetBoundsToLevel() 
  {
    var levelHandler = this.scene.Get("levelHandler");
    if (!levelHandler)
      return;

    const dims = levelHandler.currentLevel.dimensions;
    this.SetBounds({ x: 0, y: 0, width: dims.width, height: dims.height });
  }
  
  SetDimensionsToLevel() 
  {
    var levelHandler = this.scene.Get("levelHandler");
    if (!levelHandler)
      return;

    const dims = levelHandler.currentLevel.dimensions;
    this.SetDimensions(dims.width, dims.height);
  }

    GetZoom(): number
    {
        let finalScale = this.zoomFit * this.zoom;

        const hasBounds = this.bounds.width > 0 && this.bounds.height > 0;
        if (hasBounds) {
            const screenW = Math.max(1, rapid.width);
            const screenH = Math.max(1, rapid.height);

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

    const screenW = Math.max(1, rapid.width);
    const screenH = Math.max(1, rapid.height);

    const sx = screenW / w;
    const sy = screenH / h;

    const contain = (this.scaleMode == CameraScaleMode.Contain);
    this.zoomFit = contain ? Math.min(sx, sy) : Math.max(sx, sy);

    if (!Number.isFinite(this.zoomFit) || this.zoomFit <= 0)
        this.zoomFit = 1;
  }

  SetTransform(): void
  {
    if (this.dimensions.width == 0 || this.dimensions.height == 0)
        return;
    
    //if (this.dimensions.width == bare.width && this.dimensions.height == bare.height)
    //    return;

    //if (this.position.x == 0 && this.position.y == 0 && this.zoom == 1)
    //  return;

    const scale = this.GetZoom();

    const screenW = Math.max(1, rapid.width);
    const screenH = Math.max(1, rapid.height);

    let cx = this.target.x;
    let cy = this.target.y;

    const hasBounds = this.bounds.width > 0 && this.bounds.height > 0;

    if (!bareEngine.levelEditorOpen && hasBounds)
    {
        const bx = this.bounds.x;
        const by = this.bounds.y;
        const bw = this.bounds.width;
        const bh = this.bounds.height;

        const viewW = screenW / scale;
        const viewH = screenH / scale;

        // For BOTH modes:
        // - if viewport bigger than bounds on an axis => center on that axis
        // - else clamp on that axis
        if (viewW >= bw) cx = bx + bw / 2;
        else cx = Helper.Clamp(cx, bx + viewW / 2, bx + bw - viewW / 2);

        if (viewH >= bh) cy = by + bh / 2;
        else cy = Helper.Clamp(cy, by + viewH / 2, by + bh - viewH / 2);
    }

    const shake = this.GetShakeOffset(scale);
    this.position.x = cx + shake.x;
    this.position.y = cy + shake.y;

    // offset so that camera center maps to screen center (world units)
    this.offset.x = -screenW / 2 / scale;
    this.offset.y = -screenH / 2 / scale;

    // SET TRANSFORM
    rapid.matrixStack.translate(this.offset.x, this.offset.y);
    rapid.renderCamera({
        position: this.position,
        scale: 1 / scale,
        saveTransform: false
    });
  }

  ScreenToWorld(x: number, y: number)
  {
    const p = new Vec2();
    const scale = this.GetZoom();

    const screenW = Math.max(1, rapid.width);
    const screenH = Math.max(1, rapid.height);

    p.x = (x - screenW / 2) / scale + this.position.x;
    p.y = (y - screenH / 2) / scale + this.position.y;

    return p;
  }

  WorldToScreen(x: number, y: number)
  {
    const p = new Vec2();
    const scale = this.GetZoom();

    const screenW = Math.max(1, rapid.width);
    const screenH = Math.max(1, rapid.height);

    p.x = (x - this.position.x) * scale + screenW / 2;
    p.y = (y - this.position.y) * scale + screenH / 2;

    return p;
  }

  StartShakeXY(shakeX: number = 5, shakeY: number = 5, seconds: number = 0.3, decay: boolean = true)
  {
    this.shakeActive = true;
    this.shakeStartMs = bareEngine.time;
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
  }

  private GetShakeOffset(scale: number): Vec2
  {
    if (!this.shakeActive || this.shakeDurationMs <= 0 || (this.shakeIntensityX <= 0 && this.shakeIntensityY <= 0))
      return new Vec2(0, 0);

    const elapsed = Math.max(0, bareEngine.time - this.shakeStartMs);
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

export var cameraHandler:CameraHandler;
BareEngine.RegisterController(CameraHandler);
