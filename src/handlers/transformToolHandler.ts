import { keyboardController } from "../controllers/keyboardController";
import { globalEvents } from "../globals";
import { Color, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import type { Scene } from "../scenes/scene";
import { BareEvent, BareEventPayload } from "../types/bareTypes";

type HandleName =
    | 'top-left' | 'top' | 'top-right'
    | 'right'
    | 'bottom-right' | 'bottom' | 'bottom-left'
    | 'left';

interface HandleDef
{
    name: HandleName;
    // -1 = left/top edge, 0 = centre, 1 = right/bottom edge
    sx: -1 | 0 | 1;
    sy: -1 | 0 | 1;
}

// The 8 anchors: 4 corners + 4 mid-sides.
const HANDLES: HandleDef[] = [
    { name: 'top-left',     sx: -1, sy: -1 },
    { name: 'top',          sx:  0, sy: -1 },
    { name: 'top-right',    sx:  1, sy: -1 },
    { name: 'right',        sx:  1, sy:  0 },
    { name: 'bottom-right', sx:  1, sy:  1 },
    { name: 'bottom',       sx:  0, sy:  1 },
    { name: 'bottom-left',  sx: -1, sy:  1 },
    { name: 'left',         sx: -1, sy:  0 },
];

interface Frame { x: number; y: number; w: number; h: number; }

interface TargetStart
{
    obj: GameObject;
    pos: Vec2;       // world position of the object's origin at grab time
    scaleX: number;
    scaleY: number;
}

const HANDLE_SIZE = 5;   // drawn handle size, in screen px (scaled by zoom)
const HANDLE_HIT_PAD = 5; // extra grab slack around a handle, in screen px
const MIN_SIZE = 1;      // smallest world-space group dimension while resizing

/*
    TRANSFORM GIZMO
    Draws a bounding rectangle + 8 drag handles around the current selection and
    resizes it when a handle is dragged. Replaces the selection outline used by
    EditorControlsHandler (editor) and PluginHandler (in-game right-click select).

    Single global singleton fed by both selection sources via SetTargets()/Clear().
    The resize maths is modelled on ResizableComponent.

    NOTE: the gizmo is axis-aligned for now. It is built around a "frame" so an
    oriented box (rotated single-object selection) can be slotted in next without
    touching the hit-testing / draw code.
*/
export class TransformToolHandler
{
    private static instance: TransformToolHandler | null = null;

    static Get(): TransformToolHandler
    {
        return this.instance ??= new TransformToolHandler();
    }

    targets: GameObject[] = [];

    private resizing = false;
    private handle: HandleDef | null = null;

    private startRect: Frame = { x: 0, y: 0, w: 0, h: 0 };
    private starts: TargetStart[] = [];

    private cursorSet = false;

    private constructor()
    {
        // "BARE EVENT" DRIVEN: mouse-down to grab a handle, update to drag/release, render to draw.
        // PERSISTENT SO IT SURVIVES GAME RESTARTS (THE SINGLETON IS ONLY EVER CREATED ONCE).
        globalEvents.persistent.on(BareEvent.pointer_down, this.OnPointerDown);
        globalEvents.persistent.on(BareEvent.game_update, this.OnUpdate);
        globalEvents.persistent.on(BareEvent.game_postRender, this.OnRender);
    }

    SetTargets(objs: GameObject[]): void
    {
        this.RestoreHitboxes();
        this.targets = objs.filter(Boolean);
    }

    Clear(): void
    {
        this.RestoreHitboxes();
        this.targets = [];
        this.starts = [];
        this.resizing = false;
        this.handle = null;
        this.SetCursor(null);
    }

    // ================= EVENTS =================

    private OnPointerDown = ({ event }: BareEventPayload['pointer_down']): void =>
    {
        if (this.resizing) return;
        if (this.targets.length == 0) return;
        if (bare.MouseIsOnEditor(event)) return;

        this.PruneTargets();

        const scene = this.GetScene();
        if (!scene) return;

        const frame = this.GetFrame();
        if (!frame) return;

        const handle = this.HitTest(scene, frame, scene.mouse.world.position);
        if (!handle) return;

        this.BeginResize(handle, frame);
    };

    private OnUpdate = (): void =>
    {
        if (this.targets.length == 0) return;

        this.PruneTargets();
        if (this.targets.length == 0)
        {
            this.Clear();
            return;
        }

        const scene = this.GetScene();
        if (!scene) return;

        if (this.resizing)
        {
            if (scene.mouse.IsDown())
                this.ApplyResize(scene);
            else
                this.EndResize(scene);

            this.SetHitboxesActive(false); // keep body-drag suppressed for the whole resize
            this.SetCursor(this.handle);
            return;
        }

        // HOVER: detect the handle under the cursor for the cursor + to suppress body-drag.
        const frame = this.GetFrame();
        const handle = frame ? this.HitTest(scene, frame, scene.mouse.world.position) : null;

        this.SetHitboxesActive(handle == null);
        this.SetCursor(handle);
    };

    private OnRender = (): void =>
    {
        if (this.targets.length == 0) return;

        const scene = this.GetScene();
        if (!scene) return;

        const frame = this.GetFrame();
        if (!frame) return;

        // The global render event fires after each scene's camera transform was popped,
        // so re-apply it to draw in world space (mirrors Scene.Render()).
        rapid.matrixStack.save();
        scene.camera?.SetTransform();
        this.DrawGizmo(scene, frame);
        rapid.matrixStack.restore();
    };

    // ================= RESIZE =================

    private BeginResize(handle: HandleDef, frame: Frame): void
    {
        this.resizing = true;
        this.handle = handle;
        this.startRect = { ...frame };

        this.starts = this.targets.map(o => ({
            obj: o,
            pos: o.parent ? o.parent.ToGlobal(new Vec2(o.x, o.y)) : new Vec2(o.x, o.y),
            scaleX: o.scale.x,
            scaleY: o.scale.y,
        }));
    }

    private ApplyResize(scene: Scene): void
    {
        const handle = this.handle!;
        const sr = this.startRect;
        const m = scene.mouse.world.position;

        const fromCenter = keyboardController.IsKeyDown('alt');
        const keepAspect = keyboardController.IsKeyDown('shift');

        const cx = sr.x + sr.w * 0.5;
        const cy = sr.y + sr.h * 0.5;

        // For each axis: the fixed anchor point and the scale factor relative to the start rect.
        // sx/sy stay 1 on an axis the handle doesn't drive (e.g. a side handle).
        let anchorX = sr.x;
        let anchorY = sr.y;
        let sx = 1;
        let sy = 1;

        if (handle.sx != 0)
        {
            if (fromCenter)
            {
                anchorX = cx;
                const half = Math.max(MIN_SIZE * 0.5, Math.abs(m.x - cx));
                sx = sr.w > 0 ? (half * 2) / sr.w : 1;
            }
            else
            {
                anchorX = handle.sx > 0 ? sr.x : sr.x + sr.w;
                const len = Math.max(MIN_SIZE, handle.sx > 0 ? m.x - anchorX : anchorX - m.x);
                sx = sr.w > 0 ? len / sr.w : 1;
            }
        }

        if (handle.sy != 0)
        {
            if (fromCenter)
            {
                anchorY = cy;
                const half = Math.max(MIN_SIZE * 0.5, Math.abs(m.y - cy));
                sy = sr.h > 0 ? (half * 2) / sr.h : 1;
            }
            else
            {
                anchorY = handle.sy > 0 ? sr.y : sr.y + sr.h;
                const len = Math.max(MIN_SIZE, handle.sy > 0 ? m.y - anchorY : anchorY - m.y);
                sy = sr.h > 0 ? len / sr.h : 1;
            }
        }

        if (keepAspect)
        {
            if (handle.sx != 0 && handle.sy != 0)
            {
                const s = Math.max(sx, sy);
                sx = s;
                sy = s;
            }
            else if (handle.sx != 0) sy = sx;
            else if (handle.sy != 0) sx = sy;
        }

        for (const st of this.starts)
        {
            const o = st.obj;
            if (!o) continue;

            o.scale.x = st.scaleX * sx;
            o.scale.y = st.scaleY * sy;

            // Scale the object's world origin about the fixed anchor. Pivot terms cancel,
            // so this is independent of each object's pivot.
            const nx = anchorX + (st.pos.x - anchorX) * sx;
            const ny = anchorY + (st.pos.y - anchorY) * sy;

            if (o.parent)
            {
                const local = o.parent.ToLocal(new Vec2(nx, ny));
                o.SetPosition(local.x, local.y);
            }
            else
            {
                o.SetPosition(nx, ny);
            }
        }
    }

    private EndResize(scene: Scene): void
    {
        this.resizing = false;
        this.handle = null;
        this.starts = [];

        // Persist in the level editor (EditorScene exposes saveLevelCallback). In-game it's live-only.
        const save = (scene as any).saveLevelCallback;
        if (typeof save == 'function')
            save();
    }

    // ================= GEOMETRY =================

    private GetScene(): Scene | null
    {
        return this.targets[0]?.scene ?? null;
    }

    // World-space AABB union of the selection. Built as a "frame" so a rotated box can replace it later.
    private GetFrame(): Frame | null
    {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const o of this.targets)
        {
            const b = o.GetBounds();
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.width);
            maxY = Math.max(maxY, b.y + b.height);
        }

        if (!isFinite(minX)) return null;

        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    private HandlePos(frame: Frame, handle: HandleDef): Vec2
    {
        // sx/sy in {-1,0,1} -> {0, 0.5, 1} along the frame.
        return new Vec2(
            frame.x + (handle.sx + 1) * 0.5 * frame.w,
            frame.y + (handle.sy + 1) * 0.5 * frame.h,
        );
    }

    private HitTest(scene: Scene, frame: Frame, mouse: Vec2): HandleDef | null
    {
        const zoom = scene.GetCameraZoom();
        const radius = (HANDLE_SIZE * 0.5 + HANDLE_HIT_PAD) / zoom;
        const radiusSq = radius * radius;

        let best: HandleDef | null = null;
        let bestSq = radiusSq;

        for (const handle of HANDLES)
        {
            const p = this.HandlePos(frame, handle);
            const dx = mouse.x - p.x;
            const dy = mouse.y - p.y;
            const dSq = dx * dx + dy * dy;
            if (dSq <= bestSq)
            {
                best = handle;
                bestSq = dSq;
            }
        }

        return best;
    }

    // ================= DRAW =================

    private DrawGizmo(scene: Scene, frame: Frame): void
    {
        const zoom = scene.GetCameraZoom();
        const lineWidth = 2 / zoom;

        const color = Color.fromHex('#dda112');
        color.a = 230;

        const tl = new Vec2(frame.x, frame.y);
        const tr = new Vec2(frame.x + frame.w, frame.y);
        const br = new Vec2(frame.x + frame.w, frame.y + frame.h);
        const bl = new Vec2(frame.x, frame.y + frame.h);

        rapid.drawLine({ points: [tl, tr, br, bl], width: lineWidth, roundCap: false, color, closed: true });

        const size = HANDLE_SIZE / zoom;
        const half = size * 0.5;
        const fill = new Color(255, 255, 255, 255);

        for (const handle of HANDLES)
        {
            const p = this.HandlePos(frame, handle);

            rapid.drawRect({
                width: size,
                height: size,
                color: fill,
                position: new Vec2(p.x - half, p.y - half),
            });

            rapid.drawLine({
                points: [
                    new Vec2(p.x - half, p.y - half),
                    new Vec2(p.x + half, p.y - half),
                    new Vec2(p.x + half, p.y + half),
                    new Vec2(p.x - half, p.y + half),
                ],
                width: lineWidth,
                roundCap: false,
                color,
                closed: true,
            });
        }
    }

    // ================= HELPERS =================

    private PruneTargets(): void
    {
        if (this.targets.length == 0) return;

        const scene = this.targets[0].scene;
        if (!scene)
        {
            this.targets = [];
            return;
        }

        const all = scene.object.GetAll();
        this.targets = this.targets.filter(o => o && o.scene === scene && all.includes(o));
    }

    private SetHitboxesActive(active: boolean): void
    {
        for (const o of this.targets)
            if (o?.tapHitbox)
                o.tapHitbox.active = active;
    }

    private RestoreHitboxes(): void
    {
        this.SetHitboxesActive(true);
    }

    private SetCursor(handle: HandleDef | null): void
    {
        if (handle)
        {
            bare.SetCursor(this.CursorFor(handle.name));
            this.cursorSet = true;
        }
        else if (this.cursorSet)
        {
            bare.SetCursor('inherit');
            this.cursorSet = false;
        }
    }

    private CursorFor(name: HandleName): string
    {
        switch (name)
        {
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
        }
    }
}
