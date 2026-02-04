import { Vec2 } from "../libraries/rapid-render";
import { events, pipes } from "../main";
import type { Dimensions } from "./bareTypes";
import { CameraScaleMode, Rectangle } from "./gamesTypes";
import { Helper } from "./helper";

export type CameraRenderInfo = {
  position: Vec2; // camera center in world space (after clamping)
  offset: Vec2;   // world offset so camera center maps to screen center
  scale: number;  // final scale used for rendering
};

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

  constructor()
  {
    //events.persistent.on("gameStarted", () => this.ResetForStart());

    events.persistent.on("levelLoaded", ({ level }) => {
      const dims: Dimensions = level.dimensions;
      this.SetCameraBounds({ x: 0, y: 0, width: dims.width, height: dims.height });
      this.CalculateCameraZoomFit();
      // default to level center
      this.SetCameraPosition(dims.width / 2, dims.height / 2);
    });

    events.persistent.on("resize", () => this.CalculateCameraZoomFit());
    events.persistent.on("clear", ({ full }: { full: boolean }) => {
        if (full)
            this.ResetForStart();
    });

    pipes.set("cameraHandler_GetRenderInfo", (levelEditorOpen: boolean) => this.GetRenderInfo(levelEditorOpen));
    pipes.set("cameraHandler_ScreenToWorld", (x: number, y: number) => this.ScreenToWorld(x, y));
    pipes.set("cameraHandler_WorldToScreen", (x: number, y: number) => this.WorldToScreen(x, y));
    pipes.set("cameraHandler_GetCameraZoom", () => this.GetCameraZoom());
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

    this.CalculateCameraZoomFit();
  }

  // center position
  SetCameraPosition(x: number, y: number)
  {
    this.target.x = x;
    this.target.y = y;
  }

  // top-left position
  SetCameraPositionTopLeft(x: number, y: number) 
  {
    this.SetCameraPosition(x + this.dimensions.width / 2, y + this.dimensions.height / 2);
  }

  AddCameraPosition(dx: number, dy: number): Vec2 
  {
    this.SetCameraPosition(this.target.x + dx, this.target.y + dy);
    return this.target;
  }

  GetCameraPosition(): Vec2 
  {
    return this.position;
  }

  SetCameraDimensions(width: number, height: number)
  {
    this.dimensions.width = width;
    this.dimensions.height = height;
    this.CalculateCameraZoomFit();
  }

  DisableBounds() 
  {
    this.bounds = { x: 0, y: 0, width: 0, height: 0 };
  }

  SetCameraScaleMode(mode: CameraScaleMode)
  {
    this.scaleMode = mode;
    this.CalculateCameraZoomFit();
  }

  SetCameraBounds(bounds: Rectangle)
  {
    this.bounds = bounds;
    this.CalculateCameraZoomFit();
  }

  SetCameraBoundsToScreen() 
  {
    this.SetCameraBounds({ x: 0, y: 0, width: bare.width, height: bare.height });
  }

  SetCameraBoundsToLevel() 
  {
    if (!globalThis.levelController?.currentLevel) return;
    const dims = globalThis.levelController.currentLevel.dimensions;
    this.SetCameraBounds({ x: 0, y: 0, width: dims.width, height: dims.height });
  }
  
  SetCameraDimensionsToLevel() 
  {
    if (!globalThis.levelController?.currentLevel) return;
    const dims = globalThis.levelController.currentLevel.dimensions;
    this.SetCameraDimensions(dims.width, dims.height);
  }

    GetCameraZoom(): number
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
  CalculateCameraZoomFit()
  {
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
    const scale = this.GetCameraZoom();

    const screenW = Math.max(1, rapid.width);
    const screenH = Math.max(1, rapid.height);

    const viewW = screenW / scale; // viewport size in world units
    const viewH = screenH / scale;

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
    const scale = this.GetCameraZoom();

    const screenW = Math.max(1, rapid.width);
    const screenH = Math.max(1, rapid.height);

    p.x = (x - screenW / 2) / scale + this.position.x;
    p.y = (y - screenH / 2) / scale + this.position.y;

    return p;
  }

  WorldToScreen(x: number, y: number)
  {
    const p = new Vec2();
    const scale = this.GetCameraZoom();

    const screenW = Math.max(1, rapid.width);
    const screenH = Math.max(1, rapid.height);

    p.x = (x - this.position.x) * scale + screenW / 2;
    p.y = (y - this.position.y) * scale + screenH / 2;

    return p;
  }
}

export const cameraHandler = new CameraHandler();
