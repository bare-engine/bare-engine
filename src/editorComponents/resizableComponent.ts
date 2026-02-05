import { BaseComponent } from '../controllers/componentController'
import { hitboxController } from '../controllers/hitboxController';
import { keyboardController } from '../controllers/keyboardController';
import { mouseController } from '../controllers/mouseController';
import { Color, Vec2 } from '../libraries/rapid-render';

type Edge =
  | 'left' | 'right' | 'top' | 'bottom'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export class ResizableComponent extends BaseComponent
{
  minSize = 0;
  resizing = false;

  edgeMargin = 20;

  edge: Edge | null = null;
  hoverEdge: Edge | null = null;

  // free-drag resize (no hover)
  freeResize = false;
  freeResizePending = false;
  freeResizeThreshold = 10;
  freeStartPos = new Vec2(0, 0);

  // rect at press
  startX = 0;
  startY = 0;
  startW = 0;
  startH = 0;

  startCenter = new Vec2(0, 0);
  startAspect = 1;

  pressOffset = new Vec2(0, 0);
  draggingPivot: boolean;

  OnUpdate(): void
  {
    this.hoverEdge = null;

    if (!this.go.tapHitbox) return;

    const mouse = mouseController.world.position;
    const hb = this.go.tapHitbox.rectangle;
    const hoveredHitbox = hitboxController.GetCurrentHitboxHover();
    const hoveringThis = hoveredHitbox?.parent === this.go;
    const zoom = bare.GetCameraZoom();

    const fromCenter = keyboardController.IsKeyDown('alt');
    const keepAspect = keyboardController.IsKeyDown('shift');

    // ================= PRESS =================
    if (mouseController.IsMousePressed())
    {
      const hovered = hitboxController.GetCurrentHitboxHover();
      const hoveredGo = hovered?.parent;
      const edgeCandidate = (hoveredGo === this.go || hovered == null) ? this.getEdge(mouse, hb, zoom) : null;

      this.draggingPivot = (hovered && hovered.parent.name == "dot") ? true : false;

      if (edgeCandidate)
      {
        this.edge = edgeCandidate;

        this.resizing = true;
        this.freeResize = false;
        this.freeResizePending = false;

        this.startX = this.go.x;
        this.startY = this.go.y;
        this.startW = hb.width;
        this.startH = hb.height;

        this.startCenter.set(
          this.startX + this.startW * 0.5,
          this.startY + this.startH * 0.5
        );

        this.startAspect = this.startW / Math.max(1, this.startH);

        const left = this.startX;
        const right = this.startX + this.startW;
        const top = this.startY;
        const bottom = this.startY + this.startH;

        switch (edgeCandidate)
        {
          case 'left':         this.pressOffset.set(mouse.x - left, 0); break;
          case 'right':        this.pressOffset.set(mouse.x - right, 0); break;
          case 'top':          this.pressOffset.set(0, mouse.y - top); break;
          case 'bottom':       this.pressOffset.set(0, mouse.y - bottom); break;
          case 'top-left':     this.pressOffset.set(mouse.x - left, mouse.y - top); break;
          case 'top-right':    this.pressOffset.set(mouse.x - right, mouse.y - top); break;
          case 'bottom-left':  this.pressOffset.set(mouse.x - left, mouse.y - bottom); break;
          case 'bottom-right': this.pressOffset.set(mouse.x - right, mouse.y - bottom); break;
        }
      }
      else if (hovered == null)
      {
        if (this.go.x == 0 && this.go.y == 0 && this.go.width == 0 && this.go.height == 0)
        {
          // FREE RESIZE, ONLY FOR RECT AT 0,0 WITH NO SIZE. SETTING THIS IN HITBOX EDITOR AT INIT WHEN NO HITBOX
          this.freeResize = false;
          this.freeResizePending = true;
          this.resizing = false;
          this.edge = null;

          this.freeStartPos = mouseController.world.positionOnDown.clone();
          this.hoverEdge = null;
          return;
        }
      }
    }

    // ================= FREE RESIZE THRESHOLD =================
    if (mouseController.IsMouseDown() && this.freeResizePending && !this.resizing)
    {
      const dx = mouse.x - this.freeStartPos.x;
      const dy = mouse.y - this.freeStartPos.y;

      const threshold = this.freeResizeThreshold / zoom;
      if ((dx * dx + dy * dy) >= (threshold * threshold))
      {
        this.freeResizePending = false;
        this.freeResize = true;
        this.resizing = true;
        this.edge = null;
      }
    }

    // ================= DRAG =================
    if (mouseController.IsMouseDown() && this.resizing)
    {
      // --- FREE RESIZE MODE ---
      if (this.freeResize)
      {
        let w = mouse.x - this.freeStartPos.x;
        let h = mouse.y - this.freeStartPos.y;
        let x = this.freeStartPos.x;
        let y = this.freeStartPos.y;

        if (w < 0) x += w;
        if (h < 0) y += h;

        w = Math.max(this.minSize, Math.abs(w));
        h = Math.max(this.minSize, Math.abs(h));

        this.go.x = x;
        this.go.y = y;
        this.go.scale.x = w;
        this.go.scale.y = h;
        this.go.tapHitbox.rectangle = { x: 0, y: 0, width: w, height: h };
      }
      // --- EDGE / HANDLE RESIZE ---
      else if (this.edge)
      {
        const edge = this.edge;

        const handleX = mouse.x - this.pressOffset.x;
        const handleY = mouse.y - this.pressOffset.y;

        let x = this.startX;
        let y = this.startY;
        let w = this.startW;
        let h = this.startH;

        if (edge === 'left' || edge === 'right')
        {
          let dx = handleX - (edge === 'left' ? this.startX : this.startX + this.startW);
          if (fromCenter) dx *= 2;

          w = Math.max(this.minSize, this.startW + (edge === 'left' ? -dx : dx));
          if (keepAspect) h = w / this.startAspect;

          if (fromCenter)
          {
            x = this.startCenter.x - w * 0.5;
            y = this.startCenter.y - h * 0.5;
          }
          else if (edge === 'left')
          {
            x = this.startX + (this.startW - w);
          }
        }

        if (edge === 'top' || edge === 'bottom')
        {
          let dy = handleY - (edge === 'top' ? this.startY : this.startY + this.startH);
          if (fromCenter) dy *= 2;

          h = Math.max(this.minSize, this.startH + (edge === 'top' ? -dy : dy));
          if (keepAspect) w = h * this.startAspect;

          if (fromCenter)
          {
            x = this.startCenter.x - w * 0.5;
            y = this.startCenter.y - h * 0.5;
          }
          else if (edge === 'top')
          {
            y = this.startY + (this.startH - h);
          }
        }

        if (edge.includes('-'))
        {
          let dx = handleX - (edge.includes('left') ? this.startX : this.startX + this.startW);
          let dy = handleY - (edge.includes('top') ? this.startY : this.startY + this.startH);

          if (fromCenter)
          {
            dx *= 2;
            dy *= 2;
          }

          w = Math.max(this.minSize, this.startW + (edge.includes('left') ? -dx : dx));
          h = Math.max(this.minSize, this.startH + (edge.includes('top') ? -dy : dy));

          if (keepAspect)
          {
            if (w / h > this.startAspect) h = w / this.startAspect;
            else w = h * this.startAspect;
          }

          if (fromCenter)
          {
            x = this.startCenter.x - w * 0.5;
            y = this.startCenter.y - h * 0.5;
          }
          else
          {
            if (edge.includes('left')) x = this.startX + (this.startW - w);
            if (edge.includes('top'))  y = this.startY + (this.startH - h);
          }
        }

        this.go.x = x;
        this.go.y = y;
        this.go.scale.x = w;
        this.go.scale.y = h;
        this.go.tapHitbox.rectangle = { x: 0, y: 0, width: w, height: h };
      }
    }

    // ================= RELEASE =================
    if (!mouseController.IsMouseDown())
    {
      this.resizing = false;
      this.freeResize = false;
      this.freeResizePending = false;
      this.edge = null;
      this.draggingPivot = false;
    }

    // UPDATE HOVER EDGE
    const canCheckHover = hoveringThis || !hoveredHitbox;
    const activeEdge = (this.resizing && this.edge)
      ? this.edge
      : (canCheckHover ? this.getEdge(mouse, hb, zoom) : null);

    this.hoverEdge = activeEdge;

    if (this.go.scale.x == 0 || this.go.scale.y == 0) return;
    
    if (this.hoverEdge) {
      this.go.tapHitbox.active = false;
      bare.SetCursor(this.getCursorForEdge(this.hoverEdge));
    } else {
      this.go.tapHitbox.active = true;

      const hovered = hitboxController.GetCurrentHitboxHover();
      if (hovered == null)
        bare.SetCursor('inherit');
    }
  }

  PostRender(): void
  {
    if (!this.go.tapHitbox) return;
    if (!this.hoverEdge) return;
    if (this.draggingPivot) return;
    if (this.go.scale.x == 0 || this.go.scale.y == 0) return;

    const hb = this.go.tapHitbox.rectangle;

    const left = this.go.x;
    const right = this.go.x + hb.width;
    const top = this.go.y;
    const bottom = this.go.y + hb.height;

    const color = Color.fromHex('#dda112');
    color.a = 210;
    const zoom = bare.GetCameraZoom();
    const width = 3 / zoom;
    const cornerLength = 12 / zoom;

    const draw = (start: Vec2, end: Vec2, round: boolean = false) =>
    {
      rapid.renderLine({
        points: [start, end],
        width,
        roundCap: round,
        color,
      });
    };

    switch (this.hoverEdge)
    {
      case 'left':
        draw(new Vec2(left, top), new Vec2(left, bottom));
        break;
      case 'right':
        draw(new Vec2(right, top), new Vec2(right, bottom));
        break;
      case 'top':
        draw(new Vec2(left, top), new Vec2(right, top));
        break;
      case 'bottom':
        draw(new Vec2(left, bottom), new Vec2(right, bottom));
        break;
      case 'top-left':
        draw(new Vec2(left, top), new Vec2(left + cornerLength, top), true);
        draw(new Vec2(left, top), new Vec2(left, top + cornerLength), true);
        break;
      case 'top-right':
        draw(new Vec2(right, top), new Vec2(right - cornerLength, top), true);
        draw(new Vec2(right, top), new Vec2(right, top + cornerLength), true);
        break;
      case 'bottom-left':
        draw(new Vec2(left, bottom), new Vec2(left + cornerLength, bottom), true);
        draw(new Vec2(left, bottom), new Vec2(left, bottom - cornerLength), true);
        break;
      case 'bottom-right':
        draw(new Vec2(right, bottom), new Vec2(right - cornerLength, bottom), true);
        draw(new Vec2(right, bottom), new Vec2(right, bottom - cornerLength), true);
        break;
    }
  }

  private getEdge(
    mouse: Vec2,
    hb: { x: number; y: number; width: number; height: number },
    zoom: number
  ): Edge | null
  {
    const half = (this.edgeMargin / zoom) * 0.5;

    const left = this.go.x;
    const right = this.go.x + hb.width;
    const top = this.go.y;
    const bottom = this.go.y + hb.height;

    const onLeft = mouse.x >= left - half && mouse.x <= left + half;
    const onRight = mouse.x >= right - half && mouse.x <= right + half;
    const onTop = mouse.y >= top - half && mouse.y <= top + half;
    const onBottom = mouse.y >= bottom - half && mouse.y <= bottom + half;

    if (onLeft && onTop) return 'top-left';
    if (onRight && onTop) return 'top-right';
    if (onLeft && onBottom) return 'bottom-left';
    if (onRight && onBottom) return 'bottom-right';

    const insideX = mouse.x >= left - half && mouse.x <= right + half;
    const insideY = mouse.y >= top - half && mouse.y <= bottom + half;

    if (onLeft && insideY) return 'left';
    if (onRight && insideY) return 'right';
    if (onTop && insideX) return 'top';
    if (onBottom && insideX) return 'bottom';

    return null;
  }

  private getCursorForEdge(edge: Edge): string {
    switch (edge) {
      case 'left':
      case 'right':
        return 'ew-resize';

      case 'top':
      case 'bottom':
        return 'ns-resize';

      case 'top-left':
      case 'bottom-right':
        return 'nwse-resize';

      case 'top-right':
      case 'bottom-left':
        return 'nesw-resize';

      default:
        return 'inherit';
    }
  }
}
