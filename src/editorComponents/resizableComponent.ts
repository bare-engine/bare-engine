import { Component } from '../controllers/componentController';
import { keyboardController } from '../controllers/keyboardController';
import { GameMode } from '../globals';
import { Color, Vec2 } from '../libraries/new-rapid-render';
import type { EditorScene } from '../scenes/editorScene';
import { Run } from '../utils/runModes';

type Edge = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type HorizontalEdge = 'left' | 'right';
type VerticalEdge = 'top' | 'bottom';

type HorizontalResize = {
    side: HorizontalEdge;
    size: number;
};

type VerticalResize = {
    side: VerticalEdge;
    size: number;
};

type ResizeRect = {
    x: number;
    y: number;
    w: number;
    h: number;
    edge: Edge;
};

@Run(GameMode.Editor)
export class ResizableComponent extends Component
{
    minSize = 0;
    resizing = false;

    edgeMargin = 20;

    edge: Edge | null = null;
    dragStartEdge: Edge | null = null;
    hoverEdge: Edge | null = null;

    // free-drag resize (no hover)
    freeResize = false;
    freeResizePending = false;
    freeResizeThreshold = 10;
    freeStartPos = new Vec2(0, 0);

    // rect at press (in world/pixel units)
    startX = 0;
    startY = 0;
    startW = 0;
    startH = 0;

    startCenter = new Vec2(0, 0);
    startAspect = 1;

    pressOffset = new Vec2(0, 0);
    draggingPivot = false;
    previewEntityHiddenForResizeHover = false;

    /** Returns the current world-space width of the object (scale.x * texture.width) */
    private get goWidth(): number
    {
        return this.go.width;
    }

    /** Returns the current world-space height of the object (scale.y * texture.height) */
    private get goHeight(): number
    {
        return this.go.height;
    }

    /** Sets the object's world-space size by adjusting scale */
    private setGoSize(w: number, h: number): void
    {
        const texW = this.go.texture?.width ?? 1;
        const texH = this.go.texture?.height ?? 1;
        this.go.SetScaleXY(w / texW, h / texH);
    }

    OnUpdate(): void
    {
        this.hoverEdge = null;

        if (!this.go.tapHitbox) return;

        const mouse = bare.mouse.world.position;
        const hoveredHitbox = bare.hitbox.GetCurrentHover();
        const hoveringThis = hoveredHitbox?.parent === this.go;
        const px = this.scene.ScreenPxToWorldScale();

        const fromCenter = keyboardController.IsKeyDown('alt');
        const keepAspect = keyboardController.IsKeyDown('shift');

        // Current world-space rect (top-left = go.position, size = go.width/height)
        const left   = this.go.x;
        const top    = this.go.y;
        const right  = this.go.x + this.goWidth;
        const bottom = this.go.y + this.goHeight;

        // ================= PRESS =================
        if (bare.mouse.IsPressed())
        {
            const hovered = bare.hitbox.GetCurrentHover();
            const hoveredGo = hovered?.parent;
            const edgeCandidate = (hoveredGo === this.go || hovered == null) ? this.getEdge(mouse, left, top, right, bottom, px) : null;

            this.draggingPivot = (hovered && hovered.parent.name == "dot") ? true : false;

            if (edgeCandidate)
            {
                this.dragStartEdge = edgeCandidate;
                this.edge = edgeCandidate;

                this.resizing = true;
                this.freeResize = false;
                this.freeResizePending = false;

                this.startX = this.go.x;
                this.startY = this.go.y;
                this.startW = this.goWidth;
                this.startH = this.goHeight;

                this.startCenter.set(
                    this.startX + this.startW * 0.5,
                    this.startY + this.startH * 0.5
                );

                this.startAspect = this.startW / Math.max(1, this.startH);

                const sLeft   = this.startX;
                const sRight  = this.startX + this.startW;
                const sTop    = this.startY;
                const sBottom = this.startY + this.startH;

                switch (edgeCandidate)
                {
                    case 'left':         this.pressOffset.set(mouse.x - sLeft, 0); break;
                    case 'right':        this.pressOffset.set(mouse.x - sRight, 0); break;
                    case 'top':          this.pressOffset.set(0, mouse.y - sTop); break;
                    case 'bottom':       this.pressOffset.set(0, mouse.y - sBottom); break;
                    case 'top-left':     this.pressOffset.set(mouse.x - sLeft, mouse.y - sTop); break;
                    case 'top-right':    this.pressOffset.set(mouse.x - sRight, mouse.y - sTop); break;
                    case 'bottom-left':  this.pressOffset.set(mouse.x - sLeft, mouse.y - sBottom); break;
                    case 'bottom-right': this.pressOffset.set(mouse.x - sRight, mouse.y - sBottom); break;
                }
            }
            else if (hovered == null)
            {
                if (this.go.x == 0 && this.go.y == 0 && this.goWidth == 0 && this.goHeight == 0)
                {
                    // FREE RESIZE, ONLY FOR RECT AT 0,0 WITH NO SIZE. SETTING THIS IN HITBOX EDITOR AT INIT WHEN NO HITBOX
                    this.freeResize = false;
                    this.freeResizePending = true;
                    this.resizing = false;
                    this.dragStartEdge = null;
                    this.edge = null;

                    this.freeStartPos = bare.mouse.world.positionOnDown.clone();
                    this.hoverEdge = null;
                    return;
                }
            }
        }

        // ================= FREE RESIZE THRESHOLD =================
        if (bare.mouse.IsDown() && this.freeResizePending && !this.resizing)
        {
            const dx = mouse.x - this.freeStartPos.x;
            const dy = mouse.y - this.freeStartPos.y;

            const threshold = this.freeResizeThreshold * px;
            if ((dx * dx + dy * dy) >= (threshold * threshold))
            {
                this.freeResizePending = false;
                this.freeResize = true;
                this.resizing = true;
                this.edge = null;
            }
        }

        // ================= DRAG =================
        if (bare.mouse.IsDown() && this.resizing)
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
                this.setGoSize(w, h);
            }
            // --- EDGE / HANDLE RESIZE ---
            else if (this.edge)
            {
                const dragStartEdge = this.dragStartEdge ?? this.edge;

                const handleX = mouse.x - this.pressOffset.x;
                const handleY = mouse.y - this.pressOffset.y;

                const resize = this.getResizeRect(dragStartEdge, handleX, handleY, fromCenter, keepAspect);
                this.edge = resize.edge;
                this.go.x = resize.x;
                this.go.y = resize.y;
                this.setGoSize(resize.w, resize.h);
            }
        }

        // ================= RELEASE =================
        if (!bare.mouse.IsDown())
        {
            if (this.resizing)
            {
                var small = 10;
                var isSmall = (this.goWidth < small && this.goHeight < small);
                if (isSmall)
                {
                    this.go.Remove();
                    return;
                }
            }
            this.resizing = false;
            this.freeResize = false;
            this.freeResizePending = false;
            this.dragStartEdge = null;
            this.edge = null;
            this.draggingPivot = false;
        }

        // UPDATE HOVER EDGE (recompute after potential resize)
        const curLeft   = this.go.x;
        const curTop    = this.go.y;
        const curRight  = this.go.x + this.goWidth;
        const curBottom = this.go.y + this.goHeight;

        const canCheckHover = hoveringThis || !hoveredHitbox;
        const activeEdge = (this.resizing && this.edge)
            ? this.edge
            : (canCheckHover ? this.getEdge(mouse, curLeft, curTop, curRight, curBottom, px) : null);

        this.hoverEdge = activeEdge;

        if (this.goWidth == 0 || this.goHeight == 0) return;

        const previewEntity = (this.scene as EditorScene).editorControlsHandler.currentPreviewEntity;

        if (this.hoverEdge) {
            this.go.tapHitbox.active = false;
            bare.SetCursor(this.getCursorForEdge(this.hoverEdge));

            if (!this.previewEntityHiddenForResizeHover)
            {
                (this.scene as EditorScene).editorControlsHandler.SetActive(false);
                this.previewEntityHiddenForResizeHover = true;
            }
        } else {
            this.go.tapHitbox.active = true;

            const hovered = bare.hitbox.GetCurrentHover();
            if (hovered == null)
                bare.SetCursor('inherit');

            if (this.previewEntityHiddenForResizeHover)
            {
                (this.scene as EditorScene).editorControlsHandler.SetActive(true);
                this.previewEntityHiddenForResizeHover = false;
            }
        }
    }

    OnPostRender(): void
    {
        if (!this.go.tapHitbox) return;
        if (!this.hoverEdge) return;
        if (this.draggingPivot) return;
        if (this.goWidth == 0 || this.goHeight == 0) return;

        const left   = this.go.x;
        const top    = this.go.y;
        const right  = this.go.x + this.goWidth;
        const bottom = this.go.y + this.goHeight;

        const color = Color.fromHex('#dda112');
        color.a = 210;
        const px = this.scene.ScreenPxToWorldScale();
        const width = 3 * px;
        const cornerLength = 12 * px;

        const draw = (start: Vec2, end: Vec2, round: boolean = false) =>
        {
            // rapid.renderLine({
            //   points: [start, end],
            //   width,
            //   roundCap: round,
            //   color,
            // });
            rapid.drawLine({
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

    private getResizeRect(
        dragStartEdge: Edge,
        handleX: number,
        handleY: number,
        fromCenter: boolean,
        keepAspect: boolean
    ): ResizeRect
    {
        if (dragStartEdge === 'left' || dragStartEdge === 'right')
        {
            return this.getHorizontalResizeRect(dragStartEdge, handleX, fromCenter, keepAspect);
        }

        if (dragStartEdge === 'top' || dragStartEdge === 'bottom')
        {
            return this.getVerticalResizeRect(dragStartEdge, handleY, fromCenter, keepAspect);
        }

        return this.getCornerResizeRect(dragStartEdge, handleX, handleY, fromCenter, keepAspect);
    }

    private getHorizontalResizeRect(
        dragStartEdge: HorizontalEdge,
        handleX: number,
        fromCenter: boolean,
        keepAspect: boolean
    ): ResizeRect
    {
        const aspect = this.startAspect || 1;
        const anchorX = dragStartEdge === 'left' ? this.startX + this.startW : this.startX;
        const horizontal = fromCenter
        ? this.getHorizontalResizeFromCenter(handleX, dragStartEdge)
        : this.getHorizontalResizeFromAnchor(handleX, anchorX, dragStartEdge);

        const w = horizontal.size;
        const h = keepAspect ? w / aspect : this.startH;
        const x = fromCenter
            ? this.startCenter.x - w * 0.5
            : (horizontal.side === 'left' ? anchorX - w : anchorX);
            const y = fromCenter
            ? this.startCenter.y - h * 0.5
            : this.startY;

        return { x, y, w, h, edge: horizontal.side };
    }

    private getVerticalResizeRect(
        dragStartEdge: VerticalEdge,
        handleY: number,
        fromCenter: boolean,
        keepAspect: boolean
    ): ResizeRect
    {
        const anchorY = dragStartEdge === 'top' ? this.startY + this.startH : this.startY;
        const vertical = fromCenter
        ? this.getVerticalResizeFromCenter(handleY, dragStartEdge)
        : this.getVerticalResizeFromAnchor(handleY, anchorY, dragStartEdge);

        const h = vertical.size;
        const w = keepAspect ? h * (this.startAspect || 1) : this.startW;
        const x = fromCenter
            ? this.startCenter.x - w * 0.5
            : this.startX;
            const y = fromCenter
            ? this.startCenter.y - h * 0.5
            : (vertical.side === 'top' ? anchorY - h : anchorY);

        return { x, y, w, h, edge: vertical.side };
    }

    private getCornerResizeRect(
        dragStartEdge: Edge,
        handleX: number,
        handleY: number,
        fromCenter: boolean,
        keepAspect: boolean
    ): ResizeRect
    {
        const startHorizontal = this.getHorizontalSideFromEdge(dragStartEdge)!;
        const startVertical = this.getVerticalSideFromEdge(dragStartEdge)!;
        const anchorX = startHorizontal === 'left' ? this.startX + this.startW : this.startX;
        const anchorY = startVertical === 'top' ? this.startY + this.startH : this.startY;

        const horizontal = fromCenter
            ? this.getHorizontalResizeFromCenter(handleX, startHorizontal)
            : this.getHorizontalResizeFromAnchor(handleX, anchorX, startHorizontal);
            const vertical = fromCenter
            ? this.getVerticalResizeFromCenter(handleY, startVertical)
            : this.getVerticalResizeFromAnchor(handleY, anchorY, startVertical);

        let w = horizontal.size;
        let h = vertical.size;

        if (keepAspect)
        {
            ({ w, h } = this.applyAspectRatio(w, h));
        }

        const x = fromCenter
            ? this.startCenter.x - w * 0.5
            : (horizontal.side === 'left' ? anchorX - w : anchorX);
            const y = fromCenter
            ? this.startCenter.y - h * 0.5
            : (vertical.side === 'top' ? anchorY - h : anchorY);

        return {
            x,
            y,
            w,
            h,
            edge: this.getCornerEdge(horizontal.side, vertical.side),
        };
    }

    private getHorizontalResizeFromAnchor(
        handleX: number,
        anchorX: number,
        fallback: HorizontalEdge
    ): HorizontalResize
    {
        return {
            side: this.getHorizontalSide(handleX, anchorX, fallback),
            size: Math.max(this.minSize, Math.abs(handleX - anchorX)),
        };
    }

    private getHorizontalResizeFromCenter(handleX: number, fallback: HorizontalEdge): HorizontalResize
    {
        return {
            side: this.getHorizontalSide(handleX, this.startCenter.x, fallback),
            size: Math.max(this.minSize * 0.5, Math.abs(handleX - this.startCenter.x)) * 2,
        };
    }

    private getVerticalResizeFromAnchor(
        handleY: number,
        anchorY: number,
        fallback: VerticalEdge
    ): VerticalResize
    {
        return {
            side: this.getVerticalSide(handleY, anchorY, fallback),
            size: Math.max(this.minSize, Math.abs(handleY - anchorY)),
        };
    }

    private getVerticalResizeFromCenter(handleY: number, fallback: VerticalEdge): VerticalResize
    {
        return {
            side: this.getVerticalSide(handleY, this.startCenter.y, fallback),
            size: Math.max(this.minSize * 0.5, Math.abs(handleY - this.startCenter.y)) * 2,
        };
    }

    private applyAspectRatio(w: number, h: number): { w: number; h: number }
    {
        const aspect = this.startAspect || 1;

        if (w === 0 && h === 0)
        {
            return { w: 0, h: 0 };
        }

        if (h === 0 || w / h > aspect) h = w / aspect;
        else w = h * aspect;

        return { w, h };
    }

    private getHorizontalSide(value: number, anchor: number, fallback: HorizontalEdge): HorizontalEdge
    {
        if (Math.abs(value - anchor) < 0.000001) return fallback;
        return value < anchor ? 'left' : 'right';
    }

    private getVerticalSide(value: number, anchor: number, fallback: VerticalEdge): VerticalEdge
    {
        if (Math.abs(value - anchor) < 0.000001) return fallback;
        return value < anchor ? 'top' : 'bottom';
    }

    private getHorizontalSideFromEdge(edge: Edge): HorizontalEdge | null
    {
        if (edge === 'left' || edge.endsWith('left')) return 'left';
        if (edge === 'right' || edge.endsWith('right')) return 'right';
        return null;
    }

    private getVerticalSideFromEdge(edge: Edge): VerticalEdge | null
    {
        if (edge === 'top' || edge.startsWith('top')) return 'top';
        if (edge === 'bottom' || edge.startsWith('bottom')) return 'bottom';
        return null;
    }

    private getCornerEdge(horizontal: HorizontalEdge, vertical: VerticalEdge): Edge
    {
        return `${vertical}-${horizontal}` as Edge;
    }

    private getEdge(
        mouse: Vec2,
        left: number,
        top: number,
        right: number,
        bottom: number,
        px: number
    ): Edge | null
    {
        const half = (this.edgeMargin * px) * 0.5;

        const onLeft   = mouse.x >= left   - half && mouse.x <= left   + half;
        const onRight  = mouse.x >= right  - half && mouse.x <= right  + half;
        const onTop    = mouse.y >= top    - half && mouse.y <= top    + half;
        const onBottom = mouse.y >= bottom - half && mouse.y <= bottom + half;

        if (onLeft && onTop)     return 'top-left';
        if (onRight && onTop)    return 'top-right';
        if (onLeft && onBottom)  return 'bottom-left';
        if (onRight && onBottom) return 'bottom-right';

        const insideX = mouse.x >= left  - half && mouse.x <= right  + half;
        const insideY = mouse.y >= top   - half && mouse.y <= bottom + half;

        if (onLeft   && insideY) return 'left';
        if (onRight  && insideY) return 'right';
        if (onTop    && insideX) return 'top';
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
