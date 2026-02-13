import { Vec2 } from "../libraries/rapid-render";
import { events, pipes, Scene } from "../main";
import { BareEvent, type CameraRenderInfo, type Dimensions } from "../types/bareTypes";
import { CameraScaleMode, Rectangle } from "../types/gamesTypes";
import { Helper } from "../utils/helper";

class CameraHandler {
  scaleMode: CameraScaleMode = CameraScaleMode.Cover;
  zoom: number = 1;

  // "logical area" you want to fit/cover on screen when zoomFit is applied
  dimensions: Dimensions = { width: 0, height: 0 };

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

  constructor()
  {
    //events.persistent.on(BareEvent.gameStarted, () => this.ResetForStart());

    events.persistent.on(BareEvent.game_awake, () => {
      this.SetPosition(bare.width / 2, bare.height / 2);
    });

    events.persistent.on(BareEvent.level_loaded, ({ level }) => {
      const dims: Dimensions = level.dimensions;
      this.SetBounds({ x: 0, y: 0, width: dims.width, height: dims.height });
      this.CalculateZoomFit();
      // default to level center
      //this.SetPosition(dims.width / 2, dims.height / 2);
    });

    events.persistent.on(BareEvent.game_resize, () => this.CalculateZoomFit());
    
    events.persistent.on(BareEvent.game_clear, ({ full }: { full: boolean }) => {
        //if (full)
            this.ResetForStart();
    });

    pipes.set("cameraHandler_GetRenderInfo", (levelEditorOpen: boolean) => this.GetRenderInfo(levelEditorOpen));
    pipes.set("cameraHandler_ScreenToWorld", (x: number, y: number) => this.ScreenToWorld(x, y));
    pipes.set("cameraHandler_WorldToScreen", (x: number, y: number) => this.WorldToScreen(x, y));
    pipes.set("cameraHandler_GetZoom", () => this.GetZoom());
  }

  ResetForStart()
  {
    this.dimensions.width = bare.width;
    this.dimensions.height = bare.height;

    this.bounds = { x: 0, y: 0, width: bare.width, height: bare.height };

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
    if (!globalThis.levelController?.currentLevel) return;
    const dims = globalThis.levelController.currentLevel.dimensions;
    this.SetBounds({ x: 0, y: 0, width: dims.width, height: dims.height });
  }
  
  SetDimensionsToLevel() 
  {
    if (!globalThis.levelController?.currentLevel) return;
    const dims = globalThis.levelController.currentLevel.dimensions;
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

    const contain = this.scaleMode === CameraScaleMode.Contain;
    this.zoomFit = contain ? Math.min(sx, sy) : Math.max(sx, sy);

    if (!Number.isFinite(this.zoomFit) || this.zoomFit <= 0)
        this.zoomFit = 1;
  }

  GetRenderInfo(levelEditorOpen: boolean): CameraRenderInfo
  {
    const scale = this.GetZoom();

    const screenW = Math.max(1, rapid.width);
    const screenH = Math.max(1, rapid.height);

    let cx = this.target.x;
    let cy = this.target.y;

    const hasBounds = this.bounds.width > 0 && this.bounds.height > 0;

    if (!levelEditorOpen && hasBounds)
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

    this.position.x = cx;
    this.position.y = cy;

    // offset so that camera center maps to screen center (world units)
    this.offset.x = -screenW / 2 / scale;
    this.offset.y = -screenH / 2 / scale;

    return {
      position: this.position,
      offset: this.offset,
      scale,
    };
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
}

// CREATE CAMERA PROXY, SO THAT WE CAN INTERCEPT cameraHandler REFERENCES WHEN CALLING ITS METHODS
// AND SET THE scene FIELD. THEN WE USE THAT TO APPLY THE CAMERA TRANSFORM ONLY FOR THAT SCENE
// THIS PREVENTS NEEDING TO HAVE CAMERA HANDLERS ON EVERY SCENE, WHICH IS REALLY NOT NEEDED
// A GAME WILL HAVE ONE SCENE WITH A CAMERA HANDLER MOST OF THE TIME, SO NOW THAT'S ENFORCED
// CAN ALWAYS COME BACK TO THIS WHEN THAT TURNS OUT UNTRUE
function createProxy<T extends object>(target: T): T
{
    return new Proxy(target, {
        get(obj, prop, receiver)
        {
            (obj as CameraHandler).scene = window.currentSceneProcessing;

            const value = Reflect.get(obj, prop, receiver);
            
            // preserve method "this"
            if (typeof value === "function")
            {
                return value.bind(obj);
            }

            return value;
        }
    });
}

export const cameraHandler = createProxy(new CameraHandler());
globalThis.cameraHandler = cameraHandler;