import { HitboxType, Rectangle } from "../types/bareTypes";
import { Color, Vec2 } from "../libraries/rapid-render";
import { QuadTree, QuadTreeItem, QuadTreePair } from "../libraries/quadTree";
import type { Scene } from "../scenes/scene";
import { GameObject } from "../objects/gameObject";
import { ArcadeObject } from "../objects/arcadeObject";
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

export class ArcadePhysicsController extends PhysicsControllerBase
{
    static MAX_ITERATIONS: int = 8;
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

    public activeCollisions: Set<string> = new Set();
    private currentFrameCollisions: Set<string> = new Set();
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

        if (!object.parent) // ONLY ROOT OBJECTS ARE INTEGRATED
            this.objects.push(object);
    }

    // GETS CALLED BY EXTENDED CLASS (PhysicsControllerBase), ON BareEvent.game_objectRemoved
    override Remove(object: ArcadeObject): void
    {
        if (!(object instanceof ArcadeObject))
            return;

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
                obj.velocity.y += gravity * fixedDeltaTime;
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

        // Helpers to shift obj so the hitbox aligns with boundary
        const shiftX = (dx: number) => { obj.x += dx; };
        const shiftY = (dy: number) => { obj.y += dy; };

        // Left wall
        if (left < boundsLeft) {
            shiftX((boundsLeft - left) + eps);
            this.addBlockedState(obj, BlockedState.Left);
            if (obj.velocity.x < 0) obj.velocity.x = -obj.velocity.x * e;
        }

        // Right wall
        if (right > boundsRight) {
            shiftX((boundsRight - right) - eps);
            this.addBlockedState(obj, BlockedState.Right);
            if (obj.velocity.x > 0) obj.velocity.x = -obj.velocity.x * e;
        }

        // Top wall
        if (top < boundsTop) {
            shiftY((boundsTop - top) + eps);
            this.addBlockedState(obj, BlockedState.Up);
            if (obj.velocity.y < 0) obj.velocity.y = -obj.velocity.y * e;
        }

        // Bottom wall
        if (bottom > boundsBottom) {
            shiftY((boundsBottom - bottom) - eps);
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
        const broadPhasePairs = this.getBroadPhasePairs();

        for (let iteration = 0; iteration < maxIterations; iteration++)
        {
            let resolvedAny = false;

            for (const pair of broadPhasePairs)
            {
                if (this.collidePair(pair, emitEvents))
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
    private collidePair(pair: { p1: ArcadeObject; p2: ArcadeObject; collisionHandled?: boolean }, emitEvents: boolean): boolean
    {
        const obj1 = pair.p1;
        const obj2 = pair.p2;

        const sensorCollision = obj1.sensor || obj2.sensor || !!obj1.parent || !!obj2.parent;

        if (!sensorCollision && obj1.static && obj2.static) return false;
        if (!obj1.collide || !obj2.collide) return false;
        if (!obj1.physicsHitbox.active || !obj2.physicsHitbox.active) return false;

        let collision = false;
        let resolved = false;
        let collisionInfo: {dx: number, dy: number, distance: number, angle: number} | null = null;

        // Rectangle-Rectangle collision
        if (obj1.physicsHitbox.type === HitboxType.Rectangle && obj2.physicsHitbox.type === HitboxType.Rectangle) {
            const result = this.checkRectRectCollision(obj1, obj2);
            if (result.collision) {
                collision = true;
                collisionInfo = {
                    dx: result.dx,
                    dy: result.dy,
                    distance: result.distance,
                    angle: result.angle
                };
            }
        }

        // Circle-Circle collision
        if (obj1.physicsHitbox.type === HitboxType.Circle && obj2.physicsHitbox.type === HitboxType.Circle) {
            const circle1 = this.getWorldCircle(obj1);
            const circle2 = this.getWorldCircle(obj2);

            if (!circle1 || !circle2) {
                return false;
            }

            const dx = circle2.x - circle1.x;
            const dy = circle2.y - circle1.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < circle1.radius + circle2.radius) {
                collision = true;
                collisionInfo = {
                    dx,
                    dy,
                    distance,
                    angle: Math.atan2(dy, dx)
                };
            }
        }
        // Circle-Rectangle collision
        else if (
            (obj1.physicsHitbox.type === HitboxType.Circle && obj2.physicsHitbox.type === HitboxType.Rectangle) ||
            (obj1.physicsHitbox.type === HitboxType.Rectangle && obj2.physicsHitbox.type === HitboxType.Circle)
        ) {
            const circle = obj1.physicsHitbox.type === HitboxType.Circle ? obj1 : obj2;
            const rectObj = obj1.physicsHitbox.type === HitboxType.Rectangle ? obj1 : obj2;

            const result = this.checkCircleRectCollision(circle, rectObj);
            if (result.collision) {
                collision = true;
                collisionInfo = {
                    dx: result.dx,
                    dy: result.dy,
                    distance: result.distance,
                    angle: result.angle
                };
            }
        }

        if (collision && collisionInfo)
        {
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

            // Separate objects to prevent sticking
            /*let overlap = 0;
             if (obj1.physicsHitbox.type === HitboxType.Circle && obj2.physicsHitbox.type === HitboxType.Circle) {
             overlap = (obj1.physicsHitbox.radius + obj2.physicsHitbox.radius - collisionInfo.distance) / 2;
             } else if (obj1.physicsHitbox.type === HitboxType.Rectangle && obj2.physicsHitbox.type === HitboxType.Rectangle) {
             // For rectangle-rectangle, use the collision distance directly (it's already the overlap amount)
             overlap = collisionInfo.distance / 2;
             } else {
             // For circle-rectangle, use penetration depth
             overlap = collisionInfo.distance / 2;
             }*/

            // Make collisionInfo.dx/dy always point from obj1 -> obj2
            if (obj1.physicsHitbox.type === HitboxType.Circle && obj2.physicsHitbox.type === HitboxType.Rectangle) {
                // checkCircleRectCollision returns rect->circle, but we need circle->rect here
                collisionInfo.dx = -collisionInfo.dx;
                collisionInfo.dy = -collisionInfo.dy;
            }

            if (this.OnPreCollisionResolve && !this.OnPreCollisionResolve(obj1, obj2)) return false;
            const corr = this.ResolveSolidCollision(obj1, obj2, collisionInfo);
            if (!corr) return false;

            this.applyBlockedStatesFromNormal(obj1, obj2, corr.nx, corr.ny);

            const { xAddObj1, yAddObj1, xAddObj2, yAddObj2 } = corr;

            if (xAddObj1 !== 0 || yAddObj1 !== 0) {
                obj1.x += xAddObj1;
                obj1.y += yAddObj1;
                resolved = true;
            }

            if (xAddObj2 !== 0 || yAddObj2 !== 0) {
                obj2.x += xAddObj2;
                obj2.y += yAddObj2;
                resolved = true;
            }
        }

        return resolved;
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

    private getBroadPhasePairs(): { p1: ArcadeObject; p2: ArcadeObject; collisionHandled?: boolean }[]
    {
        const collisionObjects = this.getCollisionObjects();
        const pairs: { p1: ArcadeObject; p2: ArcadeObject; collisionHandled?: boolean }[] = [];

        if (!this.hasLayerCollisionRules()) {
            this.addBroadPhasePairs(collisionObjects, pairs);
            return pairs;
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
                    this.addBroadPhasePairs(layer1Objects, pairs);
                } else {
                    this.addBroadPhasePairs(
                        [...layer1Objects, ...layer2Objects],
                        pairs,
                        new Set(layer1Objects)
                    );
                }
            }
        }

        return pairs;
    }

    private addBroadPhasePairs(
        collisionObjects: ArcadeObject[],
        pairs: { p1: ArcadeObject; p2: ArcadeObject; collisionHandled?: boolean }[],
        firstLayerObjects?: Set<ArcadeObject>
    ): void
    {
        if (!ArcadePhysicsController.USE_QUAD_TREE) {
            for (let i = 0; i < collisionObjects.length - 1; i++) {
                for (let j = i + 1; j < collisionObjects.length; j++) {
                    this.addCollisionPair(
                        collisionObjects[i],
                        collisionObjects[j],
                        pairs,
                        firstLayerObjects
                    );
                }
            }

            return;
        }

        const entries: QuadTreeItem<ArcadeObject>[] = [];
        const bounds = this.getBroadPhaseBounds(entries, collisionObjects);

        if (entries.length < 2) {
            return;
        }

        const tree = new QuadTree<ArcadeObject>(
            bounds,
            ArcadePhysicsController.QUAD_TREE_MAX_ITEMS,
            ArcadePhysicsController.QUAD_TREE_MAX_LEVELS
        );

        for (const entry of entries) {
            tree.insert(entry);
        }

        const candidates: QuadTreePair<ArcadeObject>[] = [];
        tree.getPairsInto(candidates);

        for (const candidate of candidates) {
            this.addCollisionPair(candidate.p1, candidate.p2, pairs, firstLayerObjects);
        }
    }

    private addCollisionPair(
        obj1: ArcadeObject,
        obj2: ArcadeObject,
        pairs: { p1: ArcadeObject; p2: ArcadeObject; collisionHandled?: boolean }[],
        firstLayerObjects?: Set<ArcadeObject>
    ): void
    {
        // A candidate set made for two different layers must only emit cross-layer
        // pairs. Same-layer pairs are handled by that layer's own rule/group.
        if (firstLayerObjects && firstLayerObjects.has(obj1) === firstLayerObjects.has(obj2)) {
            return;
        }

        if (this.shouldSkipInternalCollision(obj1, obj2)) {
            return;
        }

        const obj1SpeedSq = this.getVelocityMagnitudeSquared(obj1);
        const obj2SpeedSq = this.getVelocityMagnitudeSquared(obj2);
        const firstObj = obj1SpeedSq > obj2SpeedSq ? obj1 : obj2;
        const secondObj = obj1SpeedSq > obj2SpeedSq ? obj2 : obj1;

        pairs.push({ p1: firstObj, p2: secondObj });
    }

    private hasLayerCollisionRules(): boolean
    {
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

        const layerIndex = this.scene.object.GetLayerOf(root);
        if (layerIndex === -1) {
            return null;
        }

        return this.scene.settingsData.layers?.[layerIndex] ?? null;
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

    private getCollisionKey(obj1: ArcadeObject, obj2: ArcadeObject): string
    {
        return obj1.uniqueID < obj2.uniqueID
            ? `${obj1.uniqueID}##${obj2.uniqueID}`
            : `${obj2.uniqueID}##${obj1.uniqueID}`;
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
            const bounds = this.getObjectBounds(obj);

            if (!bounds) {
                continue;
            }

            entries.push({ bounds, value: obj });

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

    private getObjectBounds(obj: ArcadeObject): Rectangle | null
    {
        if (!obj.physicsHitbox?.active) {
            return null;
        }

        if (obj.physicsHitbox.type === HitboxType.Circle) {
            const radius = obj.physicsHitbox.GetRadius();

            if (radius <= 0) {
                return null;
            }

            const circle = this.getWorldCircle(obj);

            if (!circle) {
                return null;
            }

            return {
                x: circle.x - circle.radius,
                y: circle.y - circle.radius,
                width: circle.radius * 2,
                height: circle.radius * 2
            };
        }

        return this.getWorldHitboxRect(obj);
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
        const topLeft     = obj.ToGlobal(new Vec2(rect.x, rect.y));
        const topRight    = obj.ToGlobal(new Vec2(rect.x + rect.width, rect.y));
        const bottomRight = obj.ToGlobal(new Vec2(rect.x + rect.width, rect.y + rect.height));
        const bottomLeft  = obj.ToGlobal(new Vec2(rect.x, rect.y + rect.height));

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
        // then transformed to world via ToGlobal. The inner transform is excluded so juice
        // tweens don't move or resize the hitbox. The world radius is derived from the
        // transformed center-to-edge distance (handles scale/rotation).
        const localCenter = new Vec2(
            obj.physicsHitbox.circleOffset.x + obj.pivot.x,
            obj.physicsHitbox.circleOffset.y + obj.pivot.y
        );
        const localEdge = new Vec2(localCenter.x + radius, localCenter.y);

        const center = obj.ToGlobal(localCenter);
        const edge = obj.ToGlobal(localEdge);

        return {
            x: center.x,
            y: center.y,
            radius: Math.hypot(edge.x - center.x, edge.y - center.y)
        };
    }

    private checkCircleRectCollision(circle: ArcadeObject, obj: ArcadeObject): {
        collision: boolean;
        dx: number;
        dy: number;
        distance: number;
        angle: number;
    }
    {
        const circleBounds = this.getWorldCircle(circle);
        const rectBounds = this.getWorldHitboxRect(obj);

        if (!circleBounds || !rectBounds) {
            return {
                collision: false,
                dx: 0,
                dy: 0,
                distance: 0,
                angle: 0
            };
        }

        // Get rectangle bounds
        const rectLeft = rectBounds.x;
        const rectRight = rectLeft + rectBounds.width;
        const rectTop = rectBounds.y;
        const rectBottom = rectTop + rectBounds.height;

        const insideRect =
            circleBounds.x >= rectLeft &&
            circleBounds.x <= rectRight &&
            circleBounds.y >= rectTop &&
            circleBounds.y <= rectBottom;

        // Find closest point on rectangle to circle center
        const closestX = Math.max(rectLeft, Math.min(circleBounds.x, rectRight));
        const closestY = Math.max(rectTop, Math.min(circleBounds.y, rectBottom));

        // Calculate distance from circle center to closest point
        const dx = circleBounds.x - closestX;
        const dy = circleBounds.y - closestY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (insideRect) {
            const distLeft = circleBounds.x - rectLeft;
            const distRight = rectRight - circleBounds.x;
            const distTop = circleBounds.y - rectTop;
            const distBottom = rectBottom - circleBounds.y;

            const minDist = Math.min(distLeft, distRight, distTop, distBottom);

            if (minDist === distLeft) {
                return {
                    collision: true,
                    dx: -1,
                    dy: 0,
                    distance: circleBounds.radius + distLeft,
                    angle: Math.PI
                };
            }

            if (minDist === distRight) {
                return {
                    collision: true,
                    dx: 1,
                    dy: 0,
                    distance: circleBounds.radius + distRight,
                    angle: 0
                };
            }

            if (minDist === distTop) {
                return {
                    collision: true,
                    dx: 0,
                    dy: -1,
                    distance: circleBounds.radius + distTop,
                    angle: -Math.PI / 2
                };
            }

            return {
                collision: true,
                dx: 0,
                dy: 1,
                distance: circleBounds.radius + distBottom,
                angle: Math.PI / 2
            };
        }

        if (distance < circleBounds.radius) {
            return {
                collision: true,
                dx: dx,
                dy: dy,
                distance: circleBounds.radius - distance, // Penetration depth
                angle: Math.atan2(dy, dx)
            };
        }

        return {
            collision: false,
            dx: 0,
            dy: 0,
            distance: 0,
            angle: 0
        };
    }



    private checkRectRectCollision(obj1: ArcadeObject, obj2: ArcadeObject): {
        collision: boolean;
        dx: number;
        dy: number;
        distance: number;
        angle: number;
    } {
        const rect1 = this.getWorldHitboxRect(obj1);
        const rect2 = this.getWorldHitboxRect(obj2);

        if (!rect1 || !rect2) {
            return {
                collision: false,
                dx: 0,
                dy: 0,
                distance: 0,
                angle: 0
            };
        }

        // Get rectangle 1 bounds
        const rect1Left = rect1.x;
        const rect1Right = rect1Left + rect1.width;
        const rect1Top = rect1.y;
        const rect1Bottom = rect1Top + rect1.height;

        // Get rectangle 2 bounds
        const rect2Left = rect2.x;
        const rect2Right = rect2Left + rect2.width;
        const rect2Top = rect2.y;
        const rect2Bottom = rect2Top + rect2.height;

        // Check for AABB collision
        const colliding = rect1Left < rect2Right &&
            rect1Right > rect2Left &&
            rect1Top < rect2Bottom &&
            rect1Bottom > rect2Top;

        if (!colliding) {
            return {
                collision: false,
                dx: 0,
                dy: 0,
                distance: 0,
                angle: 0
            };
        }

        // Calculate overlap amounts
        const overlapX = Math.min(rect1Right - rect2Left, rect2Right - rect1Left);
        const overlapY = Math.min(rect1Bottom - rect2Top, rect2Bottom - rect1Top);

        // Calculate center points
        const center1X = (rect1Left + rect1Right) / 2;
        const center1Y = (rect1Top + rect1Bottom) / 2;
        const center2X = (rect2Left + rect2Right) / 2;
        const center2Y = (rect2Top + rect2Bottom) / 2;

        // Use the minimum overlap to determine collision direction and separation vector
        let dx: number, dy: number, distance: number;

        if (overlapX < overlapY) {
            // Horizontal collision - separate horizontally
            distance = overlapX;
            // Direction from obj2 to obj1 (so obj1 moves away from obj2)
            dx = (center1X > center2X) ? overlapX : -overlapX;
            dy = 0;
        } else {
            // Vertical collision - separate vertically
            distance = overlapY;
            dx = 0;
            // Direction from obj2 to obj1 (so obj1 moves away from obj2)
            dy = (center1Y > center2Y) ? overlapY : -overlapY;
        }

        const angle = Math.atan2(dy, dx);

        return {
            collision: true,
            dx: dx,
            dy: dy,
            distance: distance,  // This is the overlap amount
            angle: angle
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

    GetCollisionInfo(obj1: ArcadeObject, obj2: ArcadeObject): {collision: boolean, dx: number, dy: number, distance: number, angle: number}
    {
        if (obj1.physicsHitbox.type === HitboxType.Rectangle && obj2.physicsHitbox.type === HitboxType.Rectangle) {
            return this.checkRectRectCollision(obj1, obj2);
        }

        if (obj1.physicsHitbox.type === HitboxType.Circle && obj2.physicsHitbox.type === HitboxType.Circle) {
            const circle1 = this.getWorldCircle(obj1);
            const circle2 = this.getWorldCircle(obj2);

            if (!circle1 || !circle2) {
                return { collision: false, dx: 0, dy: 0, distance: 0, angle: 0 };
            }

            const dx = circle2.x - circle1.x;
            const dy = circle2.y - circle1.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            return {
                collision: distance < circle1.radius + circle2.radius,
                dx,
                dy,
                distance,
                angle: Math.atan2(dy, dx)
            };
        }

        const circle = obj1.physicsHitbox.type === HitboxType.Circle ? obj1 : obj2;
        const rectObj = obj1.physicsHitbox.type === HitboxType.Rectangle ? obj1 : obj2;
        return this.checkCircleRectCollision(circle, rectObj);
    }

    // object1 IS ALWAYS THE OBJECT WITH THE HIGHEST VELOCITY
    HandleCollision(object1: ArcadeObject, object2: ArcadeObject, emitEvents: boolean = true)
    {
        // Create a unique key for this collision pair
        const collisionKey = this.getCollisionKey(object1, object2);
        const alreadyTrackedThisFrame = this.currentFrameCollisions.has(collisionKey);

        this.currentFrameCollisions.add(collisionKey);

        const isNewCollision = !this.activeCollisions.has(collisionKey);

        if (isNewCollision)
        {
            this.activeCollisions.add(collisionKey);
        }

        this.addCollidingObjects(object1, object2);

        if (!emitEvents) {
            return;
        }

        // If this is a new collision
        if (isNewCollision)
        {
            object1.OnCollisionStart(object2);
            object2.OnCollisionStart(object1);
            // emitted untyped: the collision payload is the union of the physics modules the project
            // imports (bare-engine/arcade, bare-engine/sopiro), so it may not include ArcadeObject pairs
            bare.events.emit(BareEvent.collision_start as string, object1, object2);
        }

        if (!alreadyTrackedThisFrame) {
            // Emit ongoing collision once per frame, even if the solver needs multiple passes.
            object1.OnCollisionUpdate(object2);
            object2.OnCollisionUpdate(object1);
            bare.events.emit(BareEvent.collision_update as string, object1, object2);
        }
        //bareEngine.SendEvent(BareEvent.collision_update, object1, object2); // A LOT HEAVIER, AND UNNECESSARY?
    }

    private CheckCollisionEnd()
    {
        // Check for collisions that were active but didn't occur this frame
        for (const collisionKey of this.activeCollisions)
        {
            if (this.currentFrameCollisions.has(collisionKey)) continue;

            // Find the actual objects
            const [obj1ID, obj2ID] = collisionKey.split('##');
            const collisionObjects = this.getCollisionObjects();
            const object1 = collisionObjects.find(obj => obj.uniqueID == obj1ID);
            const object2 = collisionObjects.find(obj => obj.uniqueID == obj2ID);

            if (object1 && object2)
            {
                this.removeCollidingObjects(object1, object2);
                object1.OnCollisionEnd(object2);
                object2.OnCollisionEnd(object1);
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

    private getCollisionNormal(
        obj1: ArcadeObject,
        obj2: ArcadeObject,
        collisionInfo: { dx: number; dy: number; distance: number; angle: number }
    ): { nx: number; ny: number }
    {
        const rectRect = (obj1.physicsHitbox.type === HitboxType.Rectangle && obj2.physicsHitbox.type === HitboxType.Rectangle);

        const len = Math.hypot(collisionInfo.dx, collisionInfo.dy);

        if (len <= 1e-8) {
            const centerDx = obj2.x - obj1.x;
            const centerDy = obj2.y - obj1.y;
            const centerLen = Math.hypot(centerDx, centerDy);

            if (centerLen > 1e-8) {
                return {
                    nx: centerDx / centerLen,
                    ny: centerDy / centerLen
                };
            }

            const relVelX = obj2.velocity.x - obj1.velocity.x;
            const relVelY = obj2.velocity.y - obj1.velocity.y;
            const relVelLen = Math.hypot(relVelX, relVelY);

            if (relVelLen > 1e-8) {
                return {
                    nx: relVelX / relVelLen,
                    ny: relVelY / relVelLen
                };
            }

            return { nx: 1, ny: 0 };
        }

        if (rectRect) {
            return {
                nx: -collisionInfo.dx / len,
                ny: -collisionInfo.dy / len
            };
        }

        return {
            nx: collisionInfo.dx / len,
            ny: collisionInfo.dy / len
        };
    }

    private ResolveSolidCollision(
        obj1: ArcadeObject,
        obj2: ArcadeObject,
        collisionInfo: { dx: number; dy: number; distance: number; angle: number }
    ): { xAddObj1: number; yAddObj1: number; xAddObj2: number; yAddObj2: number; nx: number; ny: number } | null
    {
        let xAddObj1 = 0, yAddObj1 = 0;
        let xAddObj2 = 0, yAddObj2 = 0;

        // --- penetration depth (DO NOT /2 for rect-rect)
        let penetration = 0;

        if (obj1.physicsHitbox.type === HitboxType.Circle && obj2.physicsHitbox.type === HitboxType.Circle) {
            const circle1 = this.getWorldCircle(obj1);
            const circle2 = this.getWorldCircle(obj2);
            if (!circle1 || !circle2) return null;

            penetration = (circle1.radius + circle2.radius) - collisionInfo.distance;
        } else if (obj1.physicsHitbox.type === HitboxType.Rectangle && obj2.physicsHitbox.type === HitboxType.Rectangle) {
            penetration = collisionInfo.distance; // already overlap depth
        } else {
            penetration = collisionInfo.distance; // circle-rect returns penetration depth already
        }

        if (penetration <= 0) return null;

        // --- choose normal
        const { nx, ny } = this.getCollisionNormal(obj1, obj2, collisionInfo);

        // --- mass
        const invMass1 = obj1.static ? 0 : 1;
        const invMass2 = obj2.static ? 0 : 1;
        const invMassSum = invMass1 + invMass2;
        if (invMassSum <= 0) return null;

        // --- positional correction along MTV normal
        {
            const corr = (penetration + 1e-6) / invMassSum;

            xAddObj1 -= corr * nx * invMass1;
            yAddObj1 -= corr * ny * invMass1;

            xAddObj2 += corr * nx * invMass2;
            yAddObj2 += corr * ny * invMass2;
        }

        // --- impulse along MTV normal
        {
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
        }

        return { xAddObj1, yAddObj1, xAddObj2, yAddObj2, nx, ny };
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
        if (includingPersistent)
        {
            this.objects.length = 0;
            this.collisionObjects.length = 0;
            this.collisionObjectSet.clear();
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
