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
    // -1 = left/top edge, 0 = centre, 1 = right/bottom edge (in frame-local space)
    sx: -1 | 0 | 1;
    sy: -1 | 0 | 1;
}

// The 8 resize anchors: 4 corners + 4 mid-sides.
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

// Oriented bounding box: centre, half-extents along its own axes, and rotation (radians).
// angle == 0 is a plain axis-aligned box (used for multi-selection groups).
interface Frame { cx: number; cy: number; hw: number; hh: number; angle: number; }

interface HandleMetrics
{
    fit: number;       // 1 at normal size, lower when the frame is small on screen
    size: number;      // drawn square size, in screen px
    hitRadius: number; // circular hit radius, in screen px
}

interface TargetStart
{
    obj: GameObject;
    pos: Vec2;       // world position of the object's origin at grab time
    scaleX: number;
    scaleY: number;
    rotation: number; // degrees, at grab time
}

const HANDLE_SIZE = 5;        // drawn resize-handle size, in on-screen px (see Scene.ScreenPxToWorldScale)
const HANDLE_HIT_PAD = 5;     // extra grab slack around a handle, in screen px
const HANDLE_FIT_SCREEN_SIZE = 30; // below this on-screen width/height, shrink handles so body-drag stays reachable
const MIN_HANDLE_SIZE = 2;    // keep tiny-object handles visible without letting them cover the object
const MIN_HANDLE_HIT_RADIUS = 2;
const MIN_SIZE = 1;           // smallest world-space frame dimension while resizing
const ROT_HANDLE_GAP = 0.5;   // gap from the top edge to the rotation knob, as a fraction of the box half-height (box-relative, like the resize anchors)
const ROT_HANDLE_RADIUS = 5;  // rotation knob radius, in screen px
const ROT_SNAP_DEG = 15;      // rotation snap step while holding shift

/*
    TRANSFORM GIZMO
    Draws a bounding rectangle + 8 resize handles + a rotation knob above the box
    around the current selection, and transforms it when a handle is dragged.
    Replaces the selection outline used by EditorControlsHandler (editor) and
    PluginHandler (in-game right-click select).

    Single global singleton fed by both selection sources via SetTargets()/Clear().
    The maths is modelled on ResizableComponent.

    The gizmo is an oriented "frame" (centre + half-extents + angle):
      - a single selected object: the box hugs and rotates with the object.
      - a group: an axis-aligned box around the combined world bounds (angle 0).
    All hit-testing / drawing / resizing goes through the frame's local axes, so the
    rotated case and the axis-aligned case share one code path.
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
    private rotating = false;
    private handle: HandleDef | null = null;

    private startFrame: Frame = { cx: 0, cy: 0, hw: 0, hh: 0, angle: 0 };
    private startMouseAngle = 0;
    private starts: TargetStart[] = [];

    private cursorSet = false;
    private editorControlsSuppressed = false;

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

        const targets = objs.filter(Boolean);
        if (targets.length == 0)
        {
            this.Clear();
            return;
        }

        this.targets = targets;
    }

    Clear(): void
    {
        this.RestoreHitboxes();
        this.SuppressEditorControls(false); // re-enable editor placement/selection (uses current targets' scene)
        this.targets = [];
        this.starts = [];
        this.resizing = false;
        this.rotating = false;
        this.handle = null;
        this.SetCursor(null);
    }

    // ================= EVENTS =================

    private OnPointerDown = ({ event }: BareEventPayload['pointer_down']): void =>
    {
        if (this.resizing || this.rotating) return;
        if (this.targets.length == 0) return;
        if (bare.MouseIsOnEditor(event)) return;

        this.PruneTargets();

        const scene = this.GetScene();
        if (!scene) return;

        const frame = this.GetFrame(this.GetTransformableTargets(this.targets));
        if (!frame) return;

        const mouse = scene.mouse.world.position;

        // Rotation knob takes priority - it sits outside the box, above the top edge.
        if (this.HitTestRotation(scene, frame, mouse))
        {
            this.BeginRotate(frame, mouse);
            return;
        }

        const handle = this.HitTest(scene, frame, mouse);
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

        // Active gesture (mouse still held): apply the transform and keep the gesture cursor.
        if ((this.resizing || this.rotating) && scene.mouse.IsDown())
        {
            if (this.rotating) this.ApplyRotate(scene);
            else this.ApplyResize(scene);

            this.SetHitboxesActive(false); // keep body-drag suppressed for the whole gesture
            this.SuppressEditorControls(true); // suppress editor placement/selection during the gesture
            this.SetCursor(this.rotating ? 'grabbing' : this.CursorFor(this.handle!.name));
            return;
        }

        // Gesture just released: finish it, then fall through to normal hover handling.
        if (this.resizing || this.rotating)
            this.EndTransform(scene);

        // HOVER: pick the cursor + decide whether to suppress body-drag.
        const frame = this.GetFrame(this.GetTransformableTargets(this.targets));
        let cursor: string | null = null;

        if (frame)
        {
            const mouse = scene.mouse.world.position;
            if (this.HitTestRotation(scene, frame, mouse))
            {
                cursor = 'grab';
            }
            else
            {
                const handle = this.HitTest(scene, frame, mouse);
                if (handle) cursor = this.CursorFor(handle.name);
            }
        }

        this.SetHitboxesActive(cursor == null);
        this.SuppressEditorControls(cursor != null); // block stamp placement / selection while hovering a handle
        this.SetCursor(cursor);
    };

    private OnRender = (): void =>
    {
        if (this.targets.length == 0) return;

        const scene = this.GetScene();
        if (!scene) return;

        // The global render event fires after each scene's camera transform was popped,
        // so re-apply it to draw in world space (mirrors Scene.Render()).
        // BACKING FIELD (_) READ: DON'T LAZY-CREATE A CAMERA ON A SCENE THAT NEVER USED ONE
        rapid.matrixStack.save();
        scene.Get("_camera")?.SetTransform();
        this.DrawSelection(scene);
        rapid.matrixStack.restore();
    };

    // ================= RESIZE =================

    private BeginResize(handle: HandleDef, frame: Frame): void
    {
        this.resizing = true;
        this.rotating = false;
        this.handle = handle;
        this.startFrame = { ...frame };
        this.RecordStarts();
    }

    private ApplyResize(scene: Scene): void
    {
        const handle = this.handle!;
        const f = this.startFrame;
        const fromCenter = keyboardController.IsKeyDown('alt');
        const keepAspect = !keyboardController.IsKeyDown('shift') && !this.IsSinglePixelTextureResize(); // ratio by default; shift or 1x1 textures scale freely
        const m = this.GetResizeMouse(scene, scene.mouse.world.position);

        // Mouse in the frame's local space (box spans [-hw,hw] x [-hh,hh], centred at 0).
        const ml = this.ToFrameLocal(f, m);

        const fullW = f.hw * 2;
        const fullH = f.hh * 2;

        // Per axis: the fixed anchor (in local space) and the scale factor vs the start frame.
        // sx/sy stay 1 on an axis the handle doesn't drive (e.g. a side handle).
        let anchorLX = 0;
        let anchorLY = 0;
        let sx = 1;
        let sy = 1;

        if (handle.sx != 0)
        {
            if (fromCenter)
            {
                anchorLX = 0;
                const half = Math.max(MIN_SIZE * 0.5, Math.abs(ml.x));
                sx = f.hw > 0 ? half / f.hw : 1;
            }
            else
            {
                anchorLX = -handle.sx * f.hw;
                const len = Math.max(MIN_SIZE, handle.sx > 0 ? ml.x - anchorLX : anchorLX - ml.x);
                sx = fullW > 0 ? len / fullW : 1;
            }
        }

        if (handle.sy != 0)
        {
            if (fromCenter)
            {
                anchorLY = 0;
                const half = Math.max(MIN_SIZE * 0.5, Math.abs(ml.y));
                sy = f.hh > 0 ? half / f.hh : 1;
            }
            else
            {
                anchorLY = -handle.sy * f.hh;
                const len = Math.max(MIN_SIZE, handle.sy > 0 ? ml.y - anchorLY : anchorLY - ml.y);
                sy = fullH > 0 ? len / fullH : 1;
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

        const anchor = this.FromFrameLocal(f, anchorLX, anchorLY);
        const cos = Math.cos(f.angle);
        const sin = Math.sin(f.angle);

        for (const st of this.starts)
        {
            const o = st.obj;
            if (!o) continue;

            o.SetScaleXY(st.scaleX * sx, st.scaleY * sy);

            // Scale the object's world origin about the fixed anchor, along the frame's axes:
            // new = anchor + R(angle) * diag(sx,sy) * R(-angle) * (start - anchor).
            // Pivot terms cancel, so this is independent of each object's pivot.
            const dx = st.pos.x - anchor.x;
            const dy = st.pos.y - anchor.y;
            const lx =  dx * cos + dy * sin;
            const ly = -dx * sin + dy * cos;
            const wx = (lx * sx) * cos - (ly * sy) * sin;
            const wy = (lx * sx) * sin + (ly * sy) * cos;

            this.SetWorldPosition(o, anchor.x + wx, anchor.y + wy);
        }
    }

    // ================= ROTATE =================

    private BeginRotate(frame: Frame, mouse: Vec2): void
    {
        this.rotating = true;
        this.resizing = false;
        this.handle = null;
        this.startFrame = { ...frame };
        this.startMouseAngle = Math.atan2(mouse.y - frame.cy, mouse.x - frame.cx);
        this.RecordStarts();
    }

    private ApplyRotate(scene: Scene): void
    {
        const f = this.startFrame;
        const m = scene.mouse.world.position;

        let deltaDeg = (Math.atan2(m.y - f.cy, m.x - f.cx) - this.startMouseAngle) * 180 / Math.PI;

        if (keyboardController.IsKeyDown('shift'))
        {
            // Snap the resulting rotation to absolute steps (0/15/30/...), not the drag delta.
            // Measured from the primary object's start rotation, so a single object lands exactly on a step.
            const baseDeg = this.starts[0]?.rotation ?? 0;
            const snapped = Math.round((baseDeg + deltaDeg) / ROT_SNAP_DEG) * ROT_SNAP_DEG;
            deltaDeg = snapped - baseDeg;
        }

        const delta = deltaDeg * Math.PI / 180;
        const cos = Math.cos(delta);
        const sin = Math.sin(delta);

        for (const st of this.starts)
        {
            const o = st.obj;
            if (!o) continue;

            o.rotation = st.rotation + deltaDeg;

            // Rotate the object's world origin about the frame centre by the same delta.
            const dx = st.pos.x - f.cx;
            const dy = st.pos.y - f.cy;
            this.SetWorldPosition(o, f.cx + dx * cos - dy * sin, f.cy + dx * sin + dy * cos);
        }
    }

    // ================= GESTURE LIFECYCLE =================

    private RecordStarts(): void
    {
        this.starts = this.GetTransformableTargets(this.targets).map(o => ({
            obj: o,
            pos: o.parent ? o.parent.ToGlobal(new Vec2(o.x, o.y)) : new Vec2(o.x, o.y),
            scaleX: o.scale.x,
            scaleY: o.scale.y,
            rotation: o.rotation,
        }));
    }

    private EndTransform(scene: Scene): void
    {
        this.resizing = false;
        this.rotating = false;
        this.handle = null;
        this.starts = [];

        // Persist in the level editor (EditorScene exposes saveLevelCallback). In-game it's live-only.
        const save = (scene as any).saveLevelCallback;
        if (typeof save == 'function')
            save();
    }

    private SetWorldPosition(o: GameObject, worldX: number, worldY: number): void
    {
        if (o.parent)
        {
            const local = o.parent.ToLocal(new Vec2(worldX, worldY));
            o.SetPosition(local.x, local.y);
        }
        else
        {
            o.SetPosition(worldX, worldY);
        }
    }

    private IsSinglePixelTextureResize(): boolean
    {
        if (this.starts.length != 1) return false;

        const tex = this.starts[0].obj?.texture;
        return tex?.width == 1 && tex?.height == 1;
    }

    private GetResizeMouse(scene: Scene, mouse: Vec2): Vec2
    {
        const gridSize = this.GetGridSize(scene);
        if (!gridSize) return mouse;

        return new Vec2(
            this.SnapCoordinateToGrid(mouse.x, gridSize),
            this.SnapCoordinateToGrid(mouse.y, gridSize)
        );
    }

    private GetGridSize(scene: Scene): number | null
    {
        const settings = (scene as any).settingsData?.settings;
        const gridSize = settings?.gridSize;
        if (!settings?.gridEnabled || !gridSize || gridSize <= 0) return null;

        return gridSize;
    }

    private SnapCoordinateToGrid(value: number, gridSize: number): number
    {
        return Math.round(value / gridSize) * gridSize;
    }

    // ================= GEOMETRY =================

    private GetScene(): Scene | null
    {
        return this.targets[0]?.scene ?? null;
    }

    // A single textured object yields an oriented box that hugs and rotates with it.
    // Everything else (groups, textureless objects) yields an axis-aligned world AABB.
    private GetFrame(targets: GameObject[] = this.targets): Frame | null
    {
        if (targets.length == 0) return null;

        if (targets.length == 1)
        {
            const o = targets[0];
            const bounds = o.texture?.localBounds;

            if (bounds && bounds.width > 0 && bounds.height > 0)
            {
                // The box is aligned to the object's OUTER transform (object rotation + ancestors),
                // NOT the inner transform - the gizmo must not tilt with an inner rotation, since
                // resize/rotate drive the outer transform (o.scale / o.rotation).
                const origin = o.ToGlobal(new Vec2(0, 0), false);
                const xPt    = o.ToGlobal(new Vec2(1, 0), false);
                let ax = xPt.x - origin.x;
                let ay = xPt.y - origin.y;
                const len = Math.hypot(ax, ay) || 1;
                ax /= len; ay /= len;          // outer X axis (unit)

                // `flipped` mirrors the sprite through the outer transform's X axis. The gizmo
                // should still treat the object's unmirrored orientation as "top", otherwise the
                // frame angle jumps by 180 degrees and the rotation knob appears below the box.
                if (o.scale.x * (o.flipped ? -1 : 1) < 0)
                {
                    ax = -ax;
                    ay = -ay;
                }

                const bx = -ay, by = ax;       // outer Y axis (perpendicular, unit)

                // Enclose the inner-transformed sprite corners by projecting them onto the outer
                // axes - so an inner rotation/scale/flip only widens the bounds, never tilts the box.
                const corners = [
                    o.ToGlobal(new Vec2(bounds.x,                bounds.y),                 true),
                    o.ToGlobal(new Vec2(bounds.x + bounds.width, bounds.y),                 true),
                    o.ToGlobal(new Vec2(bounds.x + bounds.width, bounds.y + bounds.height), true),
                    o.ToGlobal(new Vec2(bounds.x,                bounds.y + bounds.height), true),
                ];

                let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
                for (const c of corners)
                {
                    const u = c.x * ax + c.y * ay;
                    const v = c.x * bx + c.y * by;
                    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
                    minV = Math.min(minV, v); maxV = Math.max(maxV, v);
                }

                const cu = (minU + maxU) * 0.5;
                const cv = (minV + maxV) * 0.5;

                return {
                    cx: cu * ax + cv * bx,
                    cy: cu * ay + cv * by,
                    hw: (maxU - minU) * 0.5,
                    hh: (maxV - minV) * 0.5,
                    angle: Math.atan2(ay, ax),
                };
            }
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const o of targets)
        {
            const b = o.GetBounds();
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.width);
            maxY = Math.max(maxY, b.y + b.height);
        }

        if (!isFinite(minX)) return null;

        return {
            cx: (minX + maxX) * 0.5,
            cy: (minY + maxY) * 0.5,
            hw: (maxX - minX) * 0.5,
            hh: (maxY - minY) * 0.5,
            angle: 0,
        };
    }

    // Frame-local point (along the box's own axes) -> world.
    private FromFrameLocal(f: Frame, lx: number, ly: number): Vec2
    {
        const cos = Math.cos(f.angle);
        const sin = Math.sin(f.angle);
        return new Vec2(f.cx + lx * cos - ly * sin, f.cy + lx * sin + ly * cos);
    }

    // World point -> frame-local (box spans [-hw,hw] x [-hh,hh], centred at 0).
    private ToFrameLocal(f: Frame, p: Vec2): Vec2
    {
        const cos = Math.cos(f.angle);
        const sin = Math.sin(f.angle);
        const dx = p.x - f.cx;
        const dy = p.y - f.cy;
        return new Vec2(dx * cos + dy * sin, -dx * sin + dy * cos);
    }

    private HandlePos(f: Frame, handle: HandleDef): Vec2
    {
        return this.FromFrameLocal(f, handle.sx * f.hw, handle.sy * f.hh);
    }

    private RotHandlePos(f: Frame): Vec2
    {
        // Gap scales with the box height so the knob keeps the same relative distance as the
        // box grows/shrinks on screen, matching the resize anchors (which sit on the box).
        return this.FromFrameLocal(f, 0, -f.hh * (1 + ROT_HANDLE_GAP));
    }

    private HitTest(scene: Scene, frame: Frame, mouse: Vec2): HandleDef | null
    {
        const metrics = this.GetHandleMetrics(scene, frame);
        const radius = metrics.hitRadius * scene.ScreenPxToWorldScale();

        let best: HandleDef | null = null;
        let bestSq = radius * radius;

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

    private GetHandleMetrics(scene: Scene, frame: Frame): HandleMetrics
    {
        const pxToWorld = scene.ScreenPxToWorldScale();
        const screenW = pxToWorld > 0 ? (frame.hw * 2) / pxToWorld : HANDLE_FIT_SCREEN_SIZE;
        const screenH = pxToWorld > 0 ? (frame.hh * 2) / pxToWorld : HANDLE_FIT_SCREEN_SIZE;
        const smallestScreenSide = Math.min(Math.abs(screenW), Math.abs(screenH));

        if (smallestScreenSide >= HANDLE_FIT_SCREEN_SIZE)
        {
            return {
                fit: 1,
                size: HANDLE_SIZE,
                hitRadius: HANDLE_SIZE * 0.5 + HANDLE_HIT_PAD,
            };
        }

        const fit = Math.max(0, smallestScreenSide) / HANDLE_FIT_SCREEN_SIZE;
        const size = Math.max(MIN_HANDLE_SIZE, HANDLE_SIZE * fit);
        const hitRadius = Math.max(MIN_HANDLE_HIT_RADIUS, (HANDLE_SIZE * 0.5 + HANDLE_HIT_PAD) * fit);

        return { fit, size, hitRadius };
    }

    private HitTestRotation(scene: Scene, frame: Frame, mouse: Vec2): boolean
    {
        const pxToWorld = scene.ScreenPxToWorldScale();
        const metrics = this.GetHandleMetrics(scene, frame);
        const radius = Math.max(MIN_HANDLE_HIT_RADIUS, (ROT_HANDLE_RADIUS + HANDLE_HIT_PAD) * metrics.fit) * pxToWorld;
        const p = this.RotHandlePos(frame);
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        return (dx * dx + dy * dy) <= radius * radius;
    }

    // ================= DRAW =================

    private DrawSelection(scene: Scene): void
    {
        const color = Color.fromHex('#dda112');
        color.a = 230;

        const transformableTargets = this.GetTransformableTargets(this.targets);
        const fixedTargets = this.targets.filter(o => o && o.resizeable === false);

        for (const target of fixedTargets)
        {
            const frame = this.GetFrame([target]);
            if (frame) this.DrawFrameOutline(scene, frame, color);
        }

        const frame = this.GetFrame(transformableTargets);
        if (frame) this.DrawGizmo(scene, frame, color);
    }

    private DrawGizmo(scene: Scene, frame: Frame, color: Color): void
    {
        const pxToWorld = scene.ScreenPxToWorldScale();
        const lineWidth = 2 * pxToWorld;
        const metrics = this.GetHandleMetrics(scene, frame);

        const fill = new Color(255, 255, 255, 255);

        this.DrawFrameOutline(scene, frame, color);

        // Rotation stem + knob (above the top edge, following the box orientation).
        const topCenter = this.FromFrameLocal(frame, 0, -frame.hh);
        const knob = this.RotHandlePos(frame);
        rapid.drawLine({ points: [topCenter, knob], width: lineWidth, roundCap: false, color });

        const knobR = Math.max(MIN_HANDLE_SIZE, ROT_HANDLE_RADIUS * metrics.fit) * pxToWorld;
        rapid.drawCircle({ radius: knobR, color, position: knob });
        rapid.drawCircle({ radius: Math.max(0, knobR - lineWidth), color: fill, position: knob });

        // Resize handles (small screen-aligned squares at the rotated positions).
        const size = metrics.size * pxToWorld;
        const half = size * 0.5;
        const handleLineWidth = Math.min(lineWidth, Math.max(1, metrics.size * 0.35) * pxToWorld);

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
                width: handleLineWidth,
                roundCap: false,
                color,
                closed: true,
            });
        }
    }

    private DrawFrameOutline(scene: Scene, frame: Frame, color: Color): void
    {
        const lineWidth = 2 * scene.ScreenPxToWorldScale();
        const corners = [
            this.FromFrameLocal(frame, -frame.hw, -frame.hh),
            this.FromFrameLocal(frame,  frame.hw, -frame.hh),
            this.FromFrameLocal(frame,  frame.hw,  frame.hh),
            this.FromFrameLocal(frame, -frame.hw,  frame.hh),
        ];
        rapid.drawLine({ points: corners, width: lineWidth, roundCap: false, color, closed: true });
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

        // GetAll() only returns top-level objects, so a selected child (eg a ctrl+right-click deep
        // select) must be matched via its top-level ancestor - otherwise it'd be pruned every frame.
        const all = scene.object.GetAll();
        this.targets = this.targets.filter(o => o && o.scene === scene && all.includes(this.RootOf(o)));
    }

    private GetTransformableTargets(targets: GameObject[]): GameObject[]
    {
        return targets.filter(o => o && o.resizeable !== false);
    }

    private RootOf(o: GameObject): GameObject
    {
        let root = o;
        while (root.parent)
            root = root.parent;
        return root;
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

    // Disable the editor's controls while a handle is hovered/dragged, so a stamp (currentPreviewEntity)
    // doesn't place an object and a click doesn't re-select. Mirrors ResizableComponent's edge-hover behaviour.
    // No-op outside the level editor (in-game plugin scenes have no editorControlsHandler).
    private SuppressEditorControls(suppress: boolean): void
    {
        if (this.editorControlsSuppressed === suppress) return;

        const controls = (this.GetScene() as any)?.editorControlsHandler;
        if (!controls || typeof controls.SetActive !== 'function') return;

        controls.SetActive(!suppress);
        this.editorControlsSuppressed = suppress;
    }

    private SetCursor(cursor: string | null): void
    {
        if (cursor)
        {
            bare.SetCursor(cursor);
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
