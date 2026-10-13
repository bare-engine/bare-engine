import { HitboxType, Rectangle } from "../types/bareTypes";
import { Color, Vec2 } from "../libraries/rapid-render";
import { QuadTree, QuadTreeItem } from "../libraries/quadTree";
import type { Scene } from "../scenes/scene";
import { GameObject } from "../objects/gameObject";
import { ArcadeObject, ArcadeShape } from "../objects/arcadeObject";
import { BareEvent, BlockedState } from "../types/bareTypes";
import { globalEvents, RegisterController } from "../globals";
import { PhysicsControllerBase } from "./physicsControllerBase";
import { InspectorField } from "../utils/decorators";

const arcadePhysicsEventDefs = {
    collision_start: "collision_start",
    collision_update: "collision_update",
    collision_end: "collision_end",
} as const;

Object.assign(BareEvent, arcadePhysicsEventDefs);

declare module "../types/bareTypes" {
    interface BareEventExtensions {
        collision_start: "collision_start";
        collision_update: "collision_update";
        collision_end: "collision_end";
    }
    // NOTE: the BareCollisionEventPairs augmentation for Arcade lives in
    // src/arcade.ts (the "bare-engine/arcade" entry) so that importing the
    // controller type elsewhere doesn't merge ArcadeObject into every project's
    // collision event payloads.
}

type CollisionPair = { p1: ArcadeObject; p2: ArcadeObject; collisionHandled?: boolean };

// physicsId OF THE FIRST OBJECT TIMES THIS, PLUS THAT OF THE SECOND, IS A PAIR'S KEY. EXACT FOR IDS BELOW 2^26
const PAIR_KEY_STRIDE = 67108864;

export class ArcadePhysicsController extends PhysicsControllerBase
{
    static MAX_ITERATIONS: int = 4; // SOLVER PASSES PER STEP, MAKE HIGHER TO PREVENT OVERLAP
    static USE_QUAD_TREE: boolean = true;
    static QUAD_TREE_MAX_ITEMS: int = 8;
    static QUAD_TREE_MAX_LEVELS: int = 6;
    // UPPER LIMIT OF SUB STEPS A continuous OBJECT IS MOVED IN PER FIXED UPDATE
    static MAX_CONTINUOUS_STEPS: int = 64;
    // AN OBJECT WITH drag STOPS COMPLETELY BELOW THIS SPEED, IN UNITS PER SECOND. DRAG ALONE NEVER REACHES 0
    static DRAG_STOP_SPEED: number = 5;

    public objects: ArcadeObject[] = [];
    private collisionObjects: ArcadeObject[] = [];
    private collisionObjectSet: Set<ArcadeObject> = new Set();

    private x: number = 0;
    private y: number = 0;
    private width: number = 0;
    private height: number = 0;

    // CONTACTS THAT ARE GOING ON, BY PAIR KEY (SEE pairKey)
    public activeCollisions: Map<number, [ArcadeObject, ArcadeObject]> = new Map();
    private currentFrameCollisions: Set<number> = new Set();
    private static nextPhysicsId = 1;

    // DURING FixedUpdate: SHAPES ARE CACHED PER STEP, AND THE LAYER RULES ARE READ ONCE
    private stepping = false;
    private step = 0;
    private stepHasLayerRules = false;
    private stepLayerOf: Map<GameObject, string> | null = null;

    // BROAD PHASE PAIRS, REUSED EVERY STEP: THE FIRST pairCount ARE THIS STEP'S
    private pairs: CollisionPair[] = [];
    private pairCount = 0;
    private treeEntries: QuadTreeItem<ArcadeObject>[] = [];
    private treeQuery: QuadTreeItem<ArcadeObject>[] = [];

    // NARROW PHASE RESULT OF testPair, REUSED SO NO OBJECT IS CREATED PER PAIR. dx, dy AND distance
    // MEAN WHAT THEY DO IN GetCollisionInfo
    private hit = { collision: false, dx: 0, dy: 0, distance: 0, radiusSum: 0 };
    private normalX = 0;
    private normalY = 0;
    public OnPreCollisionResolve: ((obj1: ArcadeObject, obj2: ArcadeObject) => boolean) | null = null;
    
    @InspectorField
    private get objectsNum():int { return this.objects.length; }

    constructor(scene: Scene)
    {
        super(scene);

        this.setDimensions(0, 0, bare.width, bare.height);
    }

    // GETS CALLED BY EXTENDED CLASS (PhysicsControllerBase), ON BareEvent.game_objectAdded
    override Add(object: GameObject): void
    {
        if (!(object instanceof ArcadeObject))
            return;

        if (!this.collisionObjectSet.has(object))
        {
            this.collisionObjectSet.add(object);
            this.collisionObjects.push(object);
        }

        if (object.physicsId === 0)
            object.physicsId = ArcadePhysicsController.nextPhysicsId++;

        if (!object.parent) // ONLY ROOT OBJECTS ARE INTEGRATED
            this.objects.push(object);
    }

    // GETS CALLED BY EXTENDED CLASS (PhysicsControllerBase), ON BareEvent.game_objectRemoved
    override Remove(object: ArcadeObject): void
    {
        if (!(object instanceof ArcadeObject))
            return;

        // ITS CONTACTS ARE DROPPED WITHOUT collision_end
        for (const other of object.collidingObjects)
            this.activeCollisions.delete(this.pairKey(object, other));

        this.removeAllCollidingObjectReferences(object);

        if (this.collisionObjectSet.delete(object))
        {
            const collisionIndex = this.collisionObjects.indexOf(object);
            if (collisionIndex > -1)
                this.collisionObjects.splice(collisionIndex, 1);
        }

        const index = this.objects.indexOf(object);
        if (index > -1)
            this.objects.splice(index, 1);
    }

    override setDimensions(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    /**
     * Sets the world-space physics bounds from a rectangle expressed in screen
     * coordinates. This is useful when a scene camera uses Contain/Cover and
     * physics walls should remain aligned with a portion of the screen.
     */
    setDimensionsFromScreenRect(
        x: number = 0,
        y: number = 0,
        width: number = bare.width,
        height: number = bare.height
    ) {
        const topLeft = this.scene.ScreenToWorld(x, y);
        const bottomRight = this.scene.ScreenToWorld(x + width, y + height);

        this.setDimensions(
            Math.min(topLeft.x, bottomRight.x),
            Math.min(topLeft.y, bottomRight.y),
            Math.abs(bottomRight.x - topLeft.x),
            Math.abs(bottomRight.y - topLeft.y)
        );
    }

    getDimensions(): {x: number, y: number, width: number, height: number} {
        return {x: this.x, y: this.y, width: this.width, height: this.height};
    }

    override setCollisionsEnabled(enabled: boolean): void {
        if (this.collisionsEnabled === enabled)
            return;

        this.collisionsEnabled = enabled;

        if (!enabled && this.activeCollisions.size > 0) {
            this.CheckCollisionEnd();
            this.activeCollisions.clear();
            this.clearCollidingObjects();
        }
    }

    override Render(): void
    {
        if (__DEV__ && bare.debug)
        {
            const color = Color.fromHex('#f700ff57');

            for (const obj of this.collisionObjects)
            {
                if (!obj.collide || !obj.physicsHitbox?.active)
                    continue;

                if (obj.physicsHitbox.type === HitboxType.Circle)
                {
                    const circle = this.getWorldCircle(obj);
                    if (!circle)
                        continue;

                    rapid.drawCircle({
                        radius: circle.radius,
                        color,
                        segments: 32,
                        position: new Vec2(circle.x, circle.y),
                    });
                }
                else if (obj.physicsHitbox.type === HitboxType.Rectangle)
                {
                    const rect = this.getWorldHitboxRect(obj);
                    if (!rect)
                        continue;

                    rapid.drawRect({
                        width: rect.width,
                        height: rect.height,
                        color,
                        position: new Vec2(rect.x, rect.y),
                    });
                }
            }
        }
    }

    override FixedUpdate(fixedDeltaTime: number = 0): void
    {
        if (bare.levelEditorOpen)
            return;

        // READ BEFORE stepping IS SET: WHILE STEPPING, hasLayerCollisionRules RETURNS THIS
        this.stepHasLayerRules = this.hasLayerCollisionRules();
        this.stepLayerOf = null;
        this.step++;
        this.stepping = true;

        try
        {
            this.RunStep(fixedDeltaTime);
        }
        finally
        {
            this.stepping = false;
            this.stepLayerOf = null;
        }
    }

    private RunStep(fixedDeltaTime: number): void
    {
        let objectsToRemove: ArcadeObject[] | null = null;
        let sweepObjects: ArcadeObject[] | null = null;

        // CLEARED BEFORE INTEGRATION, SO CONTACTS FOUND WHILE SWEEPING continuous OBJECTS COUNT FOR THIS STEP
        this.currentFrameCollisions.clear();

        var gravity = this.scene.settingsData?.gravity || 0;

        for (const obj of this.objects)
        {
            if (obj.parent) {
                continue;
            }

            obj.blocked = BlockedState.None;

            if (!obj.physicsHitbox.rectangle || obj.physicsHitbox.rectangle.width == 0 || obj.physicsHitbox.rectangle.height == 0)
            {
                if (!obj.static)
                {
                    obj.x += obj.velocity.x * fixedDeltaTime;
                    obj.y += obj.velocity.y * fixedDeltaTime;
                }

                continue;
            }

            if (this.collisionsEnabled) {
                this.handleBoundaryCollisions(obj); // Clean up objects that started the frame outside bounds.
            }

            if (obj.drag > 0 && obj.velocity.x * obj.velocity.x + obj.velocity.y * obj.velocity.y < ArcadePhysicsController.DRAG_STOP_SPEED * ArcadePhysicsController.DRAG_STOP_SPEED)
            {
                obj.velocity.x = 0;
                obj.velocity.y = 0;
            }

            if (!obj.static)
            {
                if (obj.gravity)
                {
                    obj.velocity.x += obj.gravity.x * fixedDeltaTime;
                    obj.velocity.y += obj.gravity.y * fixedDeltaTime;
                }
                else
                {
                    obj.velocity.y += gravity * fixedDeltaTime;
                }
            }

            if (obj.drag > 0)
            {
                const dragMultiplier = Math.pow(1-obj.drag, fixedDeltaTime * 60);
                obj.velocity.x *= dragMultiplier;
                obj.velocity.y *= dragMultiplier;
            }

            // FAST continuous OBJECTS ARE MOVED AFTER THE OTHERS, IN SUB STEPS
            if (this.collisionsEnabled && this.GetContinuousSteps(obj, fixedDeltaTime) > 1)
            {
                (sweepObjects ??= []).push(obj);
                continue;
            }

            if (!obj.static)
            {
                obj.x += obj.velocity.x * fixedDeltaTime;
                obj.y += obj.velocity.y * fixedDeltaTime;
            }

            if (this.collisionsEnabled) {
                // Resolve boundary impacts after integration so the final velocity matches contact state.
                this.handleBoundaryCollisions(obj);
            }

            if (obj.removeOnOutOfBounds && this.isEntirelyOutOfBounds(obj))
            {
                (objectsToRemove ??= []).push(obj);
            }
            // Check if object stopped moving
            /*let hadCollision = false;
             for (const key of this.activeCollisions) {
             if (key.startsWith(obj.uniqueID + "##") || key.endsWith("##" + obj.uniqueID)) {
             hadCollision = true;
             break;
             }
             }*/
        }

        if (sweepObjects)
        {
            for (const obj of sweepObjects)
            {
                this.sweepContinuous(obj, fixedDeltaTime);

                if (obj.removeOnOutOfBounds && this.isEntirelyOutOfBounds(obj))
                {
                    (objectsToRemove ??= []).push(obj);
                }
            }
        }

        if (objectsToRemove)
        {
            for (const obj of objectsToRemove)
                obj.Remove();
        }

        if (this.collisionsEnabled) {
            this.handleObjectCollisions();
        }
    }

    // NUMBER OF SUB STEPS A continuous OBJECT NEEDS THIS FIXED UPDATE, 1 WHEN IT CAN MOVE IN ONE GO.
    // EACH SUB STEP MOVES AT MOST HALF THE OBJECT'S SMALLEST SIZE (A CIRCLE'S RADIUS), SO IT CAN'T
    // SKIP OVER ANYTHING, OR GET PUSHED OUT THE FAR SIDE OF WHAT IT HIT
    GetContinuousSteps(obj: ArcadeObject, fixedDeltaTime: number): number
    {
        if (!obj.continuous || obj.static || obj.parent || !obj.collide || obj.sensor)
            return 1;

        const travel = Math.hypot(obj.velocity.x, obj.velocity.y) * fixedDeltaTime;
        if (travel <= 0)
            return 1;

        const bounds = this.getObjectBounds(obj);
        if (!bounds)
            return 1;

        const maxStep = Math.max(0.5, Math.min(bounds.width, bounds.height) / 2);

        return Math.min(ArcadePhysicsController.MAX_CONTINUOUS_STEPS, Math.ceil(travel / maxStep));
    }

    // MOVES A FAST continuous OBJECT IN SUB STEPS, RESOLVING AGAINST EVERYTHING NEAR ITS PATH AFTER EACH ONE.
    // VELOCITY IS READ AGAIN EVERY SUB STEP, SO AFTER A BOUNCE THE REST OF THE STEP CONTINUES IN THE NEW DIRECTION
    private sweepContinuous(obj: ArcadeObject, fixedDeltaTime: number): void
    {
        const steps = this.GetContinuousSteps(obj, fixedDeltaTime);
        const stepDeltaTime = fixedDeltaTime / steps;
        const pairs = this.getSweepPairs(obj, Math.hypot(obj.velocity.x, obj.velocity.y) * fixedDeltaTime);

        for (let step = 0; step < steps; step++)
        {
            obj.x += obj.velocity.x * stepDeltaTime;
            obj.y += obj.velocity.y * stepDeltaTime;

            for (const pair of pairs)
                this.collidePair(pair, true);

            this.handleBoundaryCollisions(obj);
        }
    }

    // EVERY OBJECT obj COULD TOUCH WHILE MOVING travel UNITS IN ANY DIRECTION, SO BOUNCES ARE COVERED TOO
    private getSweepPairs(obj: ArcadeObject, travel: number): { p1: ArcadeObject; p2: ArcadeObject; collisionHandled?: boolean }[]
    {
        const pairs: { p1: ArcadeObject; p2: ArcadeObject; collisionHandled?: boolean }[] = [];
        const bounds = this.getObjectBounds(obj);

        if (!bounds)
            return pairs;

        const left = bounds.x - travel;
        const top = bounds.y - travel;
        const right = bounds.x + bounds.width + travel;
        const bottom = bounds.y + bounds.height + travel;

        for (const other of this.getCollisionObjects())
        {
            if (other === obj || !other.collide)
                continue;

            const otherBounds = this.getObjectBounds(other);
            if (!otherBounds)
                continue;

            if (otherBounds.x > right || otherBounds.x + otherBounds.width < left || otherBounds.y > bottom || otherBounds.y + otherBounds.height < top)
                continue;

            if (this.shouldSkipInternalCollision(obj, other) || !this.canObjectsCollideByLayer(obj, other))
                continue;

            pairs.push({ p1: obj, p2: other });
        }

        return pairs;
    }

    override Update(deltaTime: number = 0): void
    {
        // Collision-end cleanup is here at Update() so gameplay OnUpdate()
        // can still observe contacts that happened during this render frame
        this.CheckCollisionEnd();
    }

    // True when the object's hitbox no longer overlaps the world bounds at all (entirely off screen).
    private isEntirelyOutOfBounds(obj: ArcadeObject): boolean
    {
        const bounds = this.getObjectBounds(obj);
        if (!bounds) return false;

        const left = bounds.x;
        const right = bounds.x + bounds.width;
        const top = bounds.y;
        const bottom = bounds.y + bounds.height;

        const boundsLeft = this.x;
        const boundsTop = this.y;
        const boundsRight = this.x + this.width;
        const boundsBottom = this.y + this.height;

        return right < boundsLeft || left > boundsRight || bottom < boundsTop || top > boundsBottom;
    }

    private handleBoundaryCollisions(obj: ArcadeObject): void
    {
        if (obj.static) return;
        if (obj.sensor) return;
        if (!obj.stayInBounds) return;

        // Use the same scaled world AABB as object-vs-object collisions so the
        // hitbox reacts to walls at its real (scaled) size. Boundary collisions
        // only run for root objects, so the AABB shifts linearly with obj.x/obj.y.
        const bounds = this.getObjectBounds(obj);
        if (!bounds) return;

        const boundsLeft = this.x ?? 0;
        const boundsTop = this.y ?? 0;
        const boundsRight = boundsLeft + (this.width ?? 0);
        const boundsBottom = boundsTop + (this.height ?? 0);

        // Use object restitution as wall bounce (clamped)
        const e = Math.max(0, Math.min(1, obj.restitution));

        // Small padding to avoid jitter on exact boundary
        const eps = 1e-4;

        let left = bounds.x;
        let right = bounds.x + bounds.width;
        let top = bounds.y;
        let bottom = bounds.y + bounds.height;


        // Left wall
        if (left < boundsLeft) {
            obj.x += (boundsLeft - left) + eps;
            this.addBlockedState(obj, BlockedState.Left);
            if (obj.velocity.x < 0) obj.velocity.x = -obj.velocity.x * e;
        }

        // Right wall
        if (right > boundsRight) {
            obj.x += (boundsRight - right) - eps;
            this.addBlockedState(obj, BlockedState.Right);
            if (obj.velocity.x > 0) obj.velocity.x = -obj.velocity.x * e;
        }

        // Top wall
        if (top < boundsTop) {
            obj.y += (boundsTop - top) + eps;
            this.addBlockedState(obj, BlockedState.Up);
            if (obj.velocity.y < 0) obj.velocity.y = -obj.velocity.y * e;
        }

        // Bottom wall
        if (bottom > boundsBottom) {
            obj.y += (boundsBottom - bottom) - eps;
            this.addBlockedState(obj, BlockedState.Down);
            if (obj.velocity.y > 0) obj.velocity.y = -obj.velocity.y * e;
        }
    }


    public handleObjectCollisions(emitEvents: boolean = true): void
    {
        const maxIterations = ArcadePhysicsController.MAX_ITERATIONS;
        // Positional solver passes operate on the same candidates. Rebuilding every
        // layer quadtree for each pass multiplied broad-phase cost by MAX_ITERATIONS.
        // Newly-created contacts are picked up on the next fixed update.
        const pairCount = this.buildBroadPhasePairs();
        const pairs = this.pairs;

        for (let iteration = 0; iteration < maxIterations; iteration++)
        {
            let resolvedAny = false;

            for (let i = 0; i < pairCount; i++)
            {
                if (this.collidePair(pairs[i], emitEvents))
                    resolvedAny = true;
            }

            if (!resolvedAny) {
                break;
            }

            for (const obj of this.objects) {
                if (obj.parent) continue;
                if (!obj.physicsHitbox.active) continue;
                if (!obj.physicsHitbox.rectangle || obj.physicsHitbox.rectangle.width == 0 || obj.physicsHitbox.rectangle.height == 0) continue;
                this.handleBoundaryCollisions(obj);
            }
        }
    }

    // TESTS ONE PAIR, SENDS ITS COLLISION EVENTS ONCE (pair.collisionHandled), AND PUSHES THE OBJECTS APART
    // UNLESS A SENSOR IS INVOLVED. RETURNS TRUE WHEN IT MOVED AN OBJECT
    private collidePair(pair: CollisionPair, emitEvents: boolean): boolean
    {
        const obj1 = pair.p1;
        const obj2 = pair.p2;

        const sensorCollision = obj1.sensor || obj2.sensor || !!obj1.parent || !!obj2.parent;

        if (!sensorCollision && obj1.static && obj2.static) return false;
        if (!obj1.collide || !obj2.collide) return false;
        if (!obj1.physicsHitbox.active || !obj2.physicsHitbox.active) return false;

        if (!this.testPair(obj1, obj2))
            return false;

        // COPIED: COLLISION EVENTS RUN GAME CODE THAT MAY TEST OTHER PAIRS
        let dx = this.hit.dx;
        let dy = this.hit.dy;
        const distance = this.hit.distance;
        const radiusSum = this.hit.radiusSum;

        if (!pair.collisionHandled)
        {
            this.HandleCollision(obj1, obj2, emitEvents);
            pair.collisionHandled = true;

            // collide COULD HAVE CHANGED SINCE HandleCollision() SENT OUT EVENTS
            if (!obj1.collide || !obj2.collide) {
                return false;
            }
        }

        // Skip physical response for sensors or non-solid objects
        if (sensorCollision) {
            return false;
        }

        // Make dx/dy always point from obj1 -> obj2
        if (obj1.physicsHitbox.type === HitboxType.Circle && obj2.physicsHitbox.type === HitboxType.Rectangle) {
            // testPair returns rect->circle, but we need circle->rect here
            dx = -dx;
            dy = -dy;
        }

        if (this.OnPreCollisionResolve && !this.OnPreCollisionResolve(obj1, obj2)) return false;

        // for two circles the penetration is what's left of the radii, otherwise the distance already is
        const penetration = radiusSum > 0 ? radiusSum - distance : distance;

        return this.ResolveSolidCollision(obj1, obj2, dx, dy, penetration);
    }

    // NARROW PHASE ON THE CACHED SHAPES, INTO this.hit. RETURNS hit.collision
    private testPair(obj1: ArcadeObject, obj2: ArcadeObject): boolean
    {
        const hit = this.hit;
        hit.collision = false;
        hit.dx = 0;
        hit.dy = 0;
        hit.distance = 0;
        hit.radiusSum = 0;

        const shape1 = this.getShape(obj1);
        const shape2 = this.getShape(obj2);

        if (!shape1 || !shape2)
            return false;

        if (shape1.circle && shape2.circle)
        {
            const dx = shape2.cx - shape1.cx;
            const dy = shape2.cy - shape1.cy;
            const distance = Math.sqrt(dx * dx + dy * dy);

            hit.radiusSum = shape1.radius + shape2.radius;
            hit.collision = distance < hit.radiusSum;
            hit.dx = dx;
            hit.dy = dy;
            hit.distance = distance;
        }
        else if (!shape1.circle && !shape2.circle)
            this.testRectRect(shape1.bounds, shape2.bounds);
        else
            this.testCircleRect(shape1.circle ? shape1 : shape2, shape1.circle ? shape2.bounds : shape1.bounds);

        return hit.collision;
    }

    // dx/dy POINT FROM THE RECTANGLE TO THE CIRCLE, distance IS THE PENETRATION DEPTH
    private testCircleRect(circle: ArcadeShape, rect: Rectangle): void
    {
        const hit = this.hit;
        const cx = circle.cx;
        const cy = circle.cy;
        const radius = circle.radius;

        const rectLeft = rect.x;
        const rectRight = rectLeft + rect.width;
        const rectTop = rect.y;
        const rectBottom = rectTop + rect.height;

        if (cx >= rectLeft && cx <= rectRight && cy >= rectTop && cy <= rectBottom)
        {
            // CENTER INSIDE: PUSH OUT THROUGH THE NEAREST SIDE
            const distLeft = cx - rectLeft;
            const distRight = rectRight - cx;
            const distTop = cy - rectTop;
            const distBottom = rectBottom - cy;

            const minDist = Math.min(distLeft, distRight, distTop, distBottom);

            hit.collision = true;

            if (minDist === distLeft) { hit.dx = -1; hit.dy = 0; hit.distance = radius + distLeft; }
            else if (minDist === distRight) { hit.dx = 1; hit.dy = 0; hit.distance = radius + distRight; }
            else if (minDist === distTop) { hit.dx = 0; hit.dy = -1; hit.distance = radius + distTop; }
            else { hit.dx = 0; hit.dy = 1; hit.distance = radius + distBottom; }
            return;
        }

        // Closest point on the rectangle to the circle center
        const dx = cx - Math.max(rectLeft, Math.min(cx, rectRight));
        const dy = cy - Math.max(rectTop, Math.min(cy, rectBottom));
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < radius)
        {
            hit.collision = true;
            hit.dx = dx;
            hit.dy = dy;
            hit.distance = radius - distance;
        }
    }

    // dx/dy IS THE OVERLAP ON THE AXIS OF LEAST OVERLAP, POINTING FROM rect2 TO rect1. distance IS THAT OVERLAP
    private testRectRect(rect1: Rectangle, rect2: Rectangle): void
    {
        const hit = this.hit;

        const rect1Left = rect1.x;
        const rect1Right = rect1Left + rect1.width;
        const rect1Top = rect1.y;
        const rect1Bottom = rect1Top + rect1.height;

        const rect2Left = rect2.x;
        const rect2Right = rect2Left + rect2.width;
        const rect2Top = rect2.y;
        const rect2Bottom = rect2Top + rect2.height;

        if (!(rect1Left < rect2Right && rect1Right > rect2Left && rect1Top < rect2Bottom && rect1Bottom > rect2Top))
            return;

        const overlapX = Math.min(rect1Right - rect2Left, rect2Right - rect1Left);
        const overlapY = Math.min(rect1Bottom - rect2Top, rect2Bottom - rect1Top);

        hit.collision = true;

        if (overlapX < overlapY)
        {
            hit.distance = overlapX;
            hit.dx = (rect1Left + rect1Right > rect2Left + rect2Right) ? overlapX : -overlapX;
            hit.dy = 0;
        }
        else
        {
            hit.distance = overlapY;
            hit.dx = 0;
            hit.dy = (rect1Top + rect1Bottom > rect2Top + rect2Bottom) ? overlapY : -overlapY;
        }
    }

    private addCollidingObjects(object1: ArcadeObject, object2: ArcadeObject): void
    {
        if (!object1.collidingObjects.includes(object2)) {
            object1.collidingObjects.push(object2);
        }

        if (!object2.collidingObjects.includes(object1)) {
            object2.collidingObjects.push(object1);
        }
    }

    private removeCollidingObjects(object1: ArcadeObject, object2: ArcadeObject): void
    {
        const object1Index = object1.collidingObjects.indexOf(object2);
        if (object1Index > -1) {
            object1.collidingObjects.splice(object1Index, 1);
        }

        const object2Index = object2.collidingObjects.indexOf(object1);
        if (object2Index > -1) {
            object2.collidingObjects.splice(object2Index, 1);
        }
    }

    private removeAllCollidingObjectReferences(object: ArcadeObject): void
    {
        for (const collidingObject of object.collidingObjects) {
            const index = collidingObject.collidingObjects.indexOf(object);
            if (index > -1) {
                collidingObject.collidingObjects.splice(index, 1);
            }
        }

        object.collidingObjects.length = 0;
    }

    private clearCollidingObjects(): void
    {
        for (const obj of this.getCollisionObjects()) {
            obj.collidingObjects.length = 0;
        }
    }

    // FILLS this.pairs WITH THIS STEP'S CANDIDATE PAIRS AND RETURNS HOW MANY THERE ARE
    private buildBroadPhasePairs(): number
    {
        this.pairCount = 0;
        const collisionObjects = this.getCollisionObjects();

        if (!this.hasLayerCollisionRules()) {
            this.addPairsWithin(collisionObjects);
            return this.pairCount;
        }

        const objectsByLayer = new Map<string, ArcadeObject[]>();

        for (const object of collisionObjects) {
            const layerName = this.getCollisionLayerName(object);
            if (!layerName) continue;

            let layerObjects = objectsByLayer.get(layerName);
            if (!layerObjects) {
                layerObjects = [];
                objectsByLayer.set(layerName, layerObjects);
            }

            layerObjects.push(object);
        }

        // ONE TREE PER LAYER, SHARED BY ALL THE RULES THAT LAYER IS IN
        const trees = new Map<string, QuadTree<ArcadeObject> | null>();
        const treeOf = (layer: string) => {
            if (!trees.has(layer))
                trees.set(layer, this.buildTree(objectsByLayer.get(layer)!));
            return trees.get(layer)!;
        };

        const layerNames = Array.from(objectsByLayer.keys());
        for (let i = 0; i < layerNames.length; i++) {
            const layer1 = layerNames[i];

            for (let j = i; j < layerNames.length; j++) {
                const layer2 = layerNames[j];
                if (!this.layerAllowsCollision(layer1, layer2) && !this.layerAllowsCollision(layer2, layer1)) {
                    continue;
                }

                const layer1Objects = objectsByLayer.get(layer1)!;
                const layer2Objects = objectsByLayer.get(layer2)!;

                if (layer1 === layer2) {
                    this.addPairsWithin(layer1Objects, ArcadePhysicsController.USE_QUAD_TREE ? treeOf(layer1) : null);
                } else if (!ArcadePhysicsController.USE_QUAD_TREE) {
                    for (const obj1 of layer1Objects)
                        for (const obj2 of layer2Objects)
                            this.addCollisionPair(obj1, obj2);
                } else {
                    // THE SMALLER LAYER'S OBJECTS ARE LOOKED UP IN THE BIGGER LAYER'S TREE
                    const bigIsLayer2 = layer2Objects.length >= layer1Objects.length;
                    this.addPairsBetween(bigIsLayer2 ? layer1Objects : layer2Objects, treeOf(bigIsLayer2 ? layer2 : layer1));
                }
            }
        }

        return this.pairCount;
    }

    // EVERY PAIR WITHIN objects. tree, WHEN GIVEN, IS ONE ALREADY BUILT FROM THEM
    private addPairsWithin(objects: ArcadeObject[], tree?: QuadTree<ArcadeObject> | null): void
    {
        if (!ArcadePhysicsController.USE_QUAD_TREE) {
            for (let i = 0; i < objects.length - 1; i++) {
                for (let j = i + 1; j < objects.length; j++) {
                    this.addCollisionPair(objects[i], objects[j]);
                }
            }

            return;
        }

        if (tree === undefined)
            tree = this.buildTree(objects);

        tree?.visitPairs(this.visitPair);
    }

    private visitPair = (obj1: ArcadeObject, obj2: ArcadeObject) => this.addCollisionPair(obj1, obj2);

    // EVERY PAIR OF AN OBJECT IN objects AND ONE IN tree, WHOSE BOUNDS OVERLAP
    private addPairsBetween(objects: ArcadeObject[], tree: QuadTree<ArcadeObject> | null): void
    {
        if (!tree)
            return;

        const found = this.treeQuery;

        for (const obj of objects) {
            if (!obj.physicsHitbox?.active) continue;

            const shape = this.getShape(obj);
            if (!shape) continue;

            found.length = 0;
            tree.queryInto(shape.bounds, found);

            for (const item of found)
                this.addCollisionPair(obj, item.value);
        }

        found.length = 0;
    }

    private buildTree(objects: ArcadeObject[]): QuadTree<ArcadeObject> | null
    {
        const entries = this.treeEntries;
        entries.length = 0;
        const bounds = this.getBroadPhaseBounds(entries, objects);

        if (entries.length === 0) {
            return null;
        }

        const tree = new QuadTree<ArcadeObject>(
            bounds,
            ArcadePhysicsController.QUAD_TREE_MAX_ITEMS,
            ArcadePhysicsController.QUAD_TREE_MAX_LEVELS
        );

        for (const entry of entries) {
            tree.insert(entry);
        }

        entries.length = 0;
        return tree;
    }

    private addCollisionPair(obj1: ArcadeObject, obj2: ArcadeObject): void
    {
        if (this.shouldSkipInternalCollision(obj1, obj2)) {
            return;
        }

        const obj1SpeedSq = this.getVelocityMagnitudeSquared(obj1);
        const obj2SpeedSq = this.getVelocityMagnitudeSquared(obj2);
        const firstObj = obj1SpeedSq > obj2SpeedSq ? obj1 : obj2;
        const secondObj = obj1SpeedSq > obj2SpeedSq ? obj2 : obj1;

        // REUSE A PAIR OBJECT FROM AN EARLIER STEP
        const pair = this.pairs[this.pairCount];
        if (pair) {
            pair.p1 = firstObj;
            pair.p2 = secondObj;
            pair.collisionHandled = false;
        } else {
            this.pairs[this.pairCount] = { p1: firstObj, p2: secondObj, collisionHandled: false };
        }

        this.pairCount++;
    }

    private hasLayerCollisionRules(): boolean
    {
        if (this.stepping)
            return this.stepHasLayerRules;

        const layersInfo = this.scene.settingsData.layersInfo;
        if (!layersInfo) {
            return false;
        }

        return Object.values(layersInfo).some(info => Array.isArray(info?.collidesWith));
    }

    private canObjectsCollideByLayer(obj1: ArcadeObject, obj2: ArcadeObject): boolean
    {
        if (!this.hasLayerCollisionRules()) {
            return true;
        }

        const layer1 = this.getCollisionLayerName(obj1);
        const layer2 = this.getCollisionLayerName(obj2);

        if (!layer1 || !layer2) {
            return false;
        }

        return this.layerAllowsCollision(layer1, layer2) || this.layerAllowsCollision(layer2, layer1);
    }

    private getCollisionLayerName(obj: GameObject): string | null
    {
        let root = obj;
        while (root.parent) {
            root = root.parent;
        }

        // DURING A STEP, EVERY OBJECT'S LAYER IS LOOKED UP ONCE, INSTEAD OF SEARCHING ALL LAYERS PER OBJECT
        if (this.stepping) {
            this.stepLayerOf ??= this.GetLayerNames();
            return this.stepLayerOf.get(root) ?? null;
        }

        const layerIndex = this.scene.object.GetLayerOf(root);
        if (layerIndex === -1) {
            return null;
        }

        return this.scene.settingsData.layers?.[layerIndex] ?? null;
    }

    // EVERY OBJECT ON A LAYER, WITH ITS LAYER'S NAME
    private GetLayerNames(): Map<GameObject, string>
    {
        const layerOf = new Map<GameObject, string>();
        const layers = this.scene.object.GetLayers();
        const names = this.scene.settingsData.layers;

        for (let i = 0; i < layers.length; i++) {
            const name = names?.[i];
            if (!name) continue;

            for (const obj of layers[i])
                layerOf.set(obj, name);
        }

        return layerOf;
    }

    private layerAllowsCollision(layerName: string, otherLayerName: string): boolean
    {
        const collidesWith = this.scene.settingsData.layersInfo?.[layerName]?.collidesWith;
        if (!Array.isArray(collidesWith)) {
            return false;
        }

        return collidesWith.some(name => (name === otherLayerName));
    }

    private getCollisionObjects(): ArcadeObject[]
    {
        return this.collisionObjects;
    }

    private shouldSkipInternalCollision(obj1: ArcadeObject, obj2: ArcadeObject): boolean
    {
        if (!obj1.parent && !obj2.parent) {
            return false;
        }

        if (this.isAncestorOf(obj1, obj2) || this.isAncestorOf(obj2, obj1)) {
            return true;
        }

        const owner1 = this.getPhysicsOwner(obj1);
        const owner2 = this.getPhysicsOwner(obj2);

        return !!owner1 && owner1 === owner2;
    }

    private isAncestorOf(ancestor: GameObject, obj: GameObject): boolean
    {
        let current = obj.parent;

        while (current) {
            if (current === ancestor) {
                return true;
            }

            current = current.parent;
        }

        return false;
    }

    private getPhysicsOwner(obj: GameObject): ArcadeObject | null
    {
        let current = obj.parent;

        while (current) {
            if (current instanceof ArcadeObject) {
                return current;
            }

            current = current.parent;
        }

        return null;
    }

    // A NUMBER FOR THE PAIR, THE SAME IN BOTH ORDERS
    private pairKey(obj1: ArcadeObject, obj2: ArcadeObject): number
    {
        if (obj1.physicsId === 0) obj1.physicsId = ArcadePhysicsController.nextPhysicsId++;
        if (obj2.physicsId === 0) obj2.physicsId = ArcadePhysicsController.nextPhysicsId++;

        return obj1.physicsId < obj2.physicsId
            ? obj1.physicsId * PAIR_KEY_STRIDE + obj2.physicsId
            : obj2.physicsId * PAIR_KEY_STRIDE + obj1.physicsId;
    }

    private getVelocityMagnitudeSquared(obj: ArcadeObject): number
    {
        return obj.velocity.x * obj.velocity.x + obj.velocity.y * obj.velocity.y;
    }

    private getBroadPhaseBounds(entries: QuadTreeItem<ArcadeObject>[], collisionObjects: ArcadeObject[]): Rectangle
    {
        // Fit each layer tree to its own objects instead of the whole viewport.
        // This makes every subdivision level useful for spatial separation.
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;

        for (let i = 0; i < collisionObjects.length; i++) {
            const obj = collisionObjects[i];
            if (!obj.physicsHitbox?.active) continue;

            const shape = this.getShape(obj);
            if (!shape) continue;

            const bounds = shape.bounds;
            entries.push(shape.treeItem);

            left = Math.min(left, bounds.x);
            top = Math.min(top, bounds.y);
            right = Math.max(right, bounds.x + bounds.width);
            bottom = Math.max(bottom, bounds.y + bounds.height);
        }

        if (entries.length === 0) {
            return { x: this.x, y: this.y, width: Math.max(1, this.width), height: Math.max(1, this.height) };
        }

        const width = Math.max(1, right - left);
        const height = Math.max(1, bottom - top);

        return { x: left, y: top, width, height };
    }

    // THE OBJECT'S CACHED SHAPE BOUNDS (SEE getShape): DON'T KEEP THEM
    private getObjectBounds(obj: ArcadeObject): Rectangle | null
    {
        if (!obj.physicsHitbox?.active) {
            return null;
        }

        return this.getShape(obj)?.bounds ?? null;
    }

    // THE OBJECT'S HITBOX IN WORLD SPACE, null WHEN IT'S EMPTY. DURING A STEP IT'S COMPUTED ONCE PER ROOT
    // OBJECT, AND MOVING THE OBJECT SHIFTS IT. OTHER CHANGES DURING A STEP (ROTATION, SCALE, PIVOT, HITBOX,
    // EG FROM A COLLISION EVENT) COUNT FROM THE NEXT STEP. CHILDREN, WHOSE WORLD POSITION FOLLOWS THEIR
    // PARENT, ARE COMPUTED EVERY TIME. THE SHAPE BELONGS TO THE OBJECT: DON'T KEEP IT
    private getShape(obj: ArcadeObject): ArcadeShape | null
    {
        const shape = obj.physicsShape;

        if (this.stepping && shape.step === this.step && !obj.parent)
        {
            const dx = obj.x - shape.x;
            const dy = obj.y - shape.y;

            if (dx !== 0 || dy !== 0) {
                shape.x += dx;
                shape.y += dy;
                shape.cx += dx;
                shape.cy += dy;
                shape.bounds.x += dx;
                shape.bounds.y += dy;
            }

            return shape.valid ? shape : null;
        }

        shape.step = this.stepping ? this.step : -1;
        shape.x = obj.x;
        shape.y = obj.y;
        shape.circle = obj.physicsHitbox.type === HitboxType.Circle;

        const bounds = shape.bounds;

        if (shape.circle) {
            const circle = this.getWorldCircle(obj);
            shape.valid = !!circle;

            if (circle) {
                shape.cx = circle.x;
                shape.cy = circle.y;
                shape.radius = circle.radius;
                bounds.x = circle.x - circle.radius;
                bounds.y = circle.y - circle.radius;
                bounds.width = circle.radius * 2;
                bounds.height = circle.radius * 2;
            }
        } else {
            const rect = this.getWorldHitboxRect(obj);
            shape.valid = !!rect;

            if (rect) {
                shape.cx = rect.x + rect.width / 2;
                shape.cy = rect.y + rect.height / 2;
                shape.radius = 0;
                bounds.x = rect.x;
                bounds.y = rect.y;
                bounds.width = rect.width;
                bounds.height = rect.height;
            }
        }

        return shape.valid ? shape : null;
    }

    GetObjectHitboxRadius(obj: ArcadeObject): number
    {
        if (obj.physicsHitbox.radius)
            return obj.physicsHitbox.radius;
        if (obj.physicsHitbox.rectangle)
            return Math.min(obj.physicsHitbox.rectangle.width, obj.physicsHitbox.rectangle.height)

        return 0;
    }

    private getWorldHitboxRect(obj: ArcadeObject): Rectangle | null
    {
        const rect = obj.physicsHitbox.rectangle;

        if (!rect || rect.width === 0 || rect.height === 0) {
            return null;
        }

        // Transform the four hitbox corners to world space (texture space -> world,
        // including rotation/scale) and take their AABB. The inner transform is
        // intentionally excluded so juice tweens (innerScale/innerPosition/innerRotation)
        // don't move or resize the hitbox. This matches hitboxController.GetRect exactly,
        // so collisions align with the debug rect, and stays a true AABB even when the
        // object is rotated (rotation-expanded box).
        const topLeft     = obj.ContentToGlobal(new Vec2(rect.x, rect.y), false);
        const topRight    = obj.ContentToGlobal(new Vec2(rect.x + rect.width, rect.y), false);
        const bottomRight = obj.ContentToGlobal(new Vec2(rect.x + rect.width, rect.y + rect.height), false);
        const bottomLeft  = obj.ContentToGlobal(new Vec2(rect.x, rect.y + rect.height), false);

        const minX = Math.min(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
        const minY = Math.min(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);
        const maxX = Math.max(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
        const maxY = Math.max(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    private getWorldCircle(obj: ArcadeObject): { x: number; y: number; radius: number } | null
    {
        const radius = obj.physicsHitbox.GetRadius();

        if (radius <= 0) {
            return null;
        }

        // Root physics objects do not need a matrix-stack traversal. The pivot in
        // localCenter cancels the outer transform's -pivot translation, leaving
        // only circleOffset to transform around obj.position.
        if (!obj.parent) {
            const scaleX = obj.scale.x * (obj.transform.flipped ? -1 : 1);
            const scaleY = obj.scale.y;
            const offsetX = obj.physicsHitbox.circleOffset.x * scaleX;
            const offsetY = obj.physicsHitbox.circleOffset.y * scaleY;

            if (obj.rotation === 0) {
                return {
                    x: obj.x + offsetX,
                    y: obj.y + offsetY,
                    radius: Math.abs(radius * scaleX)
                };
            }

            const radians = obj.rotation * (Math.PI / 180);
            const cos = Math.cos(radians);
            const sin = Math.sin(radians);

            return {
                x: obj.x + offsetX * cos - offsetY * sin,
                y: obj.y + offsetX * sin + offsetY * cos,
                radius: Math.abs(radius * scaleX)
            };
        }

        // Match hitboxController.GetCircleCenter / GetRadius exactly so physics aligns
        // with the debug circle: the circle offset and pivot are added in texture space,
        // then transformed to world via ContentToGlobal. The inner transform is excluded so juice
        // tweens don't move or resize the hitbox. The world radius is derived from the
        // transformed center-to-edge distance (handles scale/rotation).
        const localCenter = new Vec2(
            obj.physicsHitbox.circleOffset.x + obj.pivot.x,
            obj.physicsHitbox.circleOffset.y + obj.pivot.y
        );
        const localEdge = new Vec2(localCenter.x + radius, localCenter.y);

        const center = obj.ContentToGlobal(localCenter, false);
        const edge = obj.ContentToGlobal(localEdge, false);

        return {
            x: center.x,
            y: center.y,
            radius: Math.hypot(edge.x - center.x, edge.y - center.y)
        };
    }

    private rotateVector(vector: Vec2, angle: number): Vec2 {
        return new Vec2(
            vector.x * Math.cos(angle) - vector.y * Math.sin(angle),
            vector.x * Math.sin(angle) + vector.y * Math.cos(angle)
        );
    }

    GetCollidingObjectsAgainst(obj: ArcadeObject): ArcadeObject[]
    {
        var collidingObjects: ArcadeObject[] = [];
        const collisionObjects = this.getCollisionObjects();

        for (let i = 0; i < collisionObjects.length; i++)
        {
            var otherObj = collisionObjects[i];

            if (otherObj == obj)
                continue;

            if (this.shouldSkipInternalCollision(obj, otherObj))
                continue;

            if (!this.canObjectsCollideByLayer(obj, otherObj))
                continue;

            if (this.CheckCollision(obj, otherObj))
            {
                collidingObjects.push(otherObj);
            }
        }

        return collidingObjects;
    }

    CheckCollision(obj1: ArcadeObject, obj2: ArcadeObject): boolean
    {
        if (!this.canObjectsCollideByLayer(obj1, obj2)) {
            return false;
        }

        return this.GetCollisionInfo(obj1, obj2).collision;
    }

    // FOR TWO CIRCLES dx/dy POINT FROM obj1 TO obj2 AND distance IS BETWEEN THEIR CENTERS. FOR TWO RECTANGLES dx/dy
    // IS THE OVERLAP, POINTING FROM obj2 TO obj1. FOR A CIRCLE AND A RECTANGLE dx/dy POINT FROM THE RECTANGLE TO
    // THE CIRCLE, AND distance IS HOW DEEP THEY OVERLAP
    GetCollisionInfo(obj1: ArcadeObject, obj2: ArcadeObject): {collision: boolean, dx: number, dy: number, distance: number, angle: number}
    {
        const hit = this.hit;
        this.testPair(obj1, obj2);

        return {
            collision: hit.collision,
            dx: hit.dx,
            dy: hit.dy,
            distance: hit.distance,
            angle: Math.atan2(hit.dy, hit.dx)
        };
    }

    // object1 IS ALWAYS THE OBJECT WITH THE HIGHEST VELOCITY
    HandleCollision(object1: ArcadeObject, object2: ArcadeObject, emitEvents: boolean = true)
    {
        const collisionKey = this.pairKey(object1, object2);
        const alreadyTrackedThisFrame = this.currentFrameCollisions.has(collisionKey);

        this.currentFrameCollisions.add(collisionKey);

        const isNewCollision = !this.activeCollisions.has(collisionKey);

        if (isNewCollision)
        {
            this.activeCollisions.set(collisionKey, [object1, object2]);
            this.addCollidingObjects(object1, object2);
        }

        if (!emitEvents) {
            return;
        }

        // If this is a new collision
        if (isNewCollision)
        {
            object1.CollisionStart(object2);
            object2.CollisionStart(object1);
            // emitted untyped: the collision payload is the union of the physics modules the project
            // imports (bare-engine/arcade, bare-engine/sopiro), so it may not include ArcadeObject pairs
            bare.events.emit(BareEvent.collision_start as string, object1, object2);
        }

        if (!alreadyTrackedThisFrame) {
            // Emit ongoing collision once per frame, even if the solver needs multiple passes.
            object1.CollisionUpdate(object2);
            object2.CollisionUpdate(object1);
            bare.events.emit(BareEvent.collision_update as string, object1, object2);
        }
        //bareEngine.SendEvent(BareEvent.collision_update, object1, object2); // A LOT HEAVIER, AND UNNECESSARY?
    }

    private CheckCollisionEnd()
    {
        // Check for collisions that were active but didn't occur this frame
        for (const [collisionKey, [object1, object2]] of this.activeCollisions)
        {
            if (this.currentFrameCollisions.has(collisionKey)) continue;

            if (this.collisionObjectSet.has(object1) && this.collisionObjectSet.has(object2))
            {
                this.removeCollidingObjects(object1, object2);
                object1.CollisionEnd(object2);
                object2.CollisionEnd(object1);
                bare.events.emit(BareEvent.collision_end as string, object1 as ArcadeObject, object2 as ArcadeObject);
            }

            this.activeCollisions.delete(collisionKey);
        }
    }

    private addBlockedState(obj: ArcadeObject, state: BlockedState): void
    {
        obj.blocked |= state;
    }

    private applyBlockedStatesFromNormal(obj1: ArcadeObject, obj2: ArcadeObject, nx: number, ny: number): void
    {
        const eps = 1e-6;

        if (nx > eps) {
            this.addBlockedState(obj1, BlockedState.Right);
            this.addBlockedState(obj2, BlockedState.Left);
        } else if (nx < -eps) {
            this.addBlockedState(obj1, BlockedState.Left);
            this.addBlockedState(obj2, BlockedState.Right);
        }

        if (ny > eps) {
            this.addBlockedState(obj1, BlockedState.Down);
            this.addBlockedState(obj2, BlockedState.Up);
        } else if (ny < -eps) {
            this.addBlockedState(obj1, BlockedState.Up);
            this.addBlockedState(obj2, BlockedState.Down);
        }
    }

    // THE CONTACT NORMAL FROM obj1 TO obj2, INTO normalX / normalY
    private setCollisionNormal(obj1: ArcadeObject, obj2: ArcadeObject, dx: number, dy: number): void
    {
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len <= 1e-8) {
            const centerDx = obj2.x - obj1.x;
            const centerDy = obj2.y - obj1.y;
            const centerLen = Math.hypot(centerDx, centerDy);

            if (centerLen > 1e-8) {
                this.normalX = centerDx / centerLen;
                this.normalY = centerDy / centerLen;
                return;
            }

            const relVelX = obj2.velocity.x - obj1.velocity.x;
            const relVelY = obj2.velocity.y - obj1.velocity.y;
            const relVelLen = Math.hypot(relVelX, relVelY);

            if (relVelLen > 1e-8) {
                this.normalX = relVelX / relVelLen;
                this.normalY = relVelY / relVelLen;
                return;
            }

            this.normalX = 1;
            this.normalY = 0;
            return;
        }

        // rect-rect dx/dy point from obj2 to obj1
        const sign = (obj1.physicsHitbox.type === HitboxType.Rectangle && obj2.physicsHitbox.type === HitboxType.Rectangle) ? -1 : 1;
        this.normalX = sign * dx / len;
        this.normalY = sign * dy / len;
    }

    // PUSHES THE OBJECTS APART AND BOUNCES THEM. RETURNS TRUE WHEN IT MOVED ONE
    private ResolveSolidCollision(obj1: ArcadeObject, obj2: ArcadeObject, dx: number, dy: number, penetration: number): boolean
    {
        // --- penetration depth (DO NOT /2 for rect-rect)
        if (penetration <= 0) return false;

        // --- mass
        const invMass1 = obj1.static ? 0 : 1;
        const invMass2 = obj2.static ? 0 : 1;
        const invMassSum = invMass1 + invMass2;
        if (invMassSum <= 0) return false;

        // --- choose normal
        this.setCollisionNormal(obj1, obj2, dx, dy);
        const nx = this.normalX;
        const ny = this.normalY;

        // --- impulse along MTV normal
        const rvx = obj2.velocity.x - obj1.velocity.x;
        const rvy = obj2.velocity.y - obj1.velocity.y;
        const velAlongNormal = rvx * nx + rvy * ny;

        if (velAlongNormal < 0) {
            // the bouncier of the two, so a bouncy object also bounces off walls left at 0, like off the level bounds
            const restitution = Math.max(obj1.restitution ?? 0, obj2.restitution ?? 0);
            const j = -(1 + restitution) * velAlongNormal / invMassSum;

            const impX = j * nx;
            const impY = j * ny;

            obj1.velocity.x -= impX * invMass1;
            obj1.velocity.y -= impY * invMass1;

            obj2.velocity.x += impX * invMass2;
            obj2.velocity.y += impY * invMass2;
        }

        this.applyBlockedStatesFromNormal(obj1, obj2, nx, ny);

        // --- positional correction along MTV normal
        const corr = (penetration + 1e-6) / invMassSum;
        let moved = false;

        if (invMass1 !== 0) {
            obj1.x -= corr * nx;
            obj1.y -= corr * ny;
            moved = true;
        }

        if (invMass2 !== 0) {
            obj2.x += corr * nx;
            obj2.y += corr * ny;
            moved = true;
        }

        return moved;
    }

    GetObjectAtPoint(position: Vec2, ignoredObject?: ArcadeObject): ArcadeObject | null
    {
        const collisionObjects = this.getCollisionObjects();

        for (let i = 0; i < collisionObjects.length; i++)
        {
            var obj = collisionObjects[i];

            if (obj == ignoredObject)
                continue;

            var rect = this.getWorldHitboxRect(obj);

            if (!rect)
                continue

            if (position.x >= rect.x &&
                position.x <= rect.x + rect.width &&
                position.y >= rect.y &&
                position.y <= rect.y + rect.height)
            {
                return obj;
            }
        }

        return null;
    }

    Clear(includingPersistent: boolean = true)
    {
        this.pairs.length = 0;
        this.pairCount = 0;

        if (includingPersistent)
        {
            this.objects.length = 0;
            this.collisionObjects.length = 0;
            this.collisionObjectSet.clear();
            this.activeCollisions.clear();
            this.currentFrameCollisions.clear();
            return;
        }

        for (let i = this.objects.length - 1; i >= 0; i--)
        {
            if (!this.objects[i].persistent)
                this.objects.splice(i, 1);
        }

        for (let i = this.collisionObjects.length - 1; i >= 0; i--)
        {
            const collisionObject = this.collisionObjects[i];
            let persistenceRoot: GameObject = collisionObject;
            while (persistenceRoot.parent)
                persistenceRoot = persistenceRoot.parent;

            // Children of a persistent root survive level clears with that root,
            // even when the child itself does not repeat the persistent flag.
            if (!persistenceRoot.persistent)
            {
                this.collisionObjectSet.delete(collisionObject);
                this.collisionObjects.splice(i, 1);
            }
        }

        for (const [collisionKey, [object1, object2]] of this.activeCollisions)
        {
            if (!this.collisionObjectSet.has(object1) || !this.collisionObjectSet.has(object2))
                this.activeCollisions.delete(collisionKey);
        }
    }
}

// GAME OBJECT CLASS REGISTRATION (POOLS + registeredClasses) IS GLOBAL, NOT PER SCENE.
// DONE AT MODULE LOAD (DEFERRED UNTIL bare EXISTS) SO LEVELS CAN SPAWN ArcadeObject
// BEFORE ANY SCENE HAS TOUCHED THE LAZY scene.arcade CONTROLLER
function RegisterArcadeClasses(): void
{
    bare.AddClass(ArcadeObject);
    bare.RegisterGameObjectPool(ArcadeObject, 10);
}

if (window.bare)
    RegisterArcadeClasses();
else
    globalEvents.persistent.on(BareEvent.game_awake, RegisterArcadeClasses);

RegisterController(ArcadePhysicsController);
