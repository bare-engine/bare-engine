import { BareEngine } from "../bareEngine";
import { HitboxType } from "../exports";
import { Vec2 } from "../libraries/rapid-render";
import { Scene } from "../main";
import { GameObject } from "../objects/gameObject";
import { PhysicsObjectBare } from "../objects/physicsObjectBare";
import { BareEvent, BlockedState } from "../types/bareTypes";
import { PhysicsControllerBase } from "./physicsControllerBase";

export class PhysicsControllerBare extends PhysicsControllerBase
{
  public objects: PhysicsObjectBare[] = [];

  private x: number = 0;
  private y: number = 0;
  private width: number = 0;
  private height: number = 0;
  
  public activeCollisions: Set<string> = new Set();
  private currentFrameCollisions: Set<string> = new Set();
  public OnBeforeCollisionResolve: ((obj1: PhysicsObjectBare, obj2: PhysicsObjectBare) => boolean) | null = null;

  constructor(scene: Scene)
  {
    super(scene);

    this.setDimensions(0, 0, bare.width, bare.height);
    bareEngine.RegisterGameObjectPool(PhysicsObjectBare, 10);
  }
  
  // GETS CALLED BY EXTENDED CLASS (PhysicsControllerBase), ON BareEvent.game_objectAdded
  override Add(object: GameObject): void
  {
    if (object instanceof PhysicsObjectBare && !object.parent) // SHOULD BE PhysicsObjectBare AND NOT A CHILD
      this.objects.push(object);
  }

  // GETS CALLED BY EXTENDED CLASS (PhysicsControllerBase), ON BareEvent.game_objectRemoved
  override Remove(object: PhysicsObjectBare): void
  {
      if (object instanceof PhysicsObjectBare && !object.parent)
      {
        const index = this.objects.indexOf(object);
        if (index > -1) {
            this.objects.splice(index, 1);
        }
      }
  }
  
  setDimensions(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  getDimensions(): {x: number, y: number, width: number, height: number} {
    return {x: this.x, y: this.y, width: this.width, height: this.height};
  }

  setCollisionsEnabled(enabled: boolean): void {
    if (this.collisionsEnabled === enabled)
      return;

    this.collisionsEnabled = enabled;

    if (!enabled && this.activeCollisions.size > 0) {
      this.CheckCollisionEnd();
      this.activeCollisions.clear();
    }
  }

  override FixedUpdate(fixedDeltaTime: number = 0): void
  {
		if (bareEngine.levelEditorOpen)
      return;

    for (const obj of this.objects)
    {
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

      if (!obj.static)
      {
        obj.velocity.y += obj.scene.settingsData.gravity * fixedDeltaTime;
      }

      if (obj.drag > 0)
      {
        const dragMultiplier = Math.pow(1-obj.drag, fixedDeltaTime * 60);
        obj.velocity.x *= dragMultiplier;
        obj.velocity.y *= dragMultiplier;
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
      // Check if object stopped moving
      /*let hadCollision = false;
      for (const key of this.activeCollisions) {
          if (key.startsWith(obj.uniqueID + "##") || key.endsWith("##" + obj.uniqueID)) {
              hadCollision = true;
              break;
          }
      }*/
    }

    if (this.collisionsEnabled) {
      this.currentFrameCollisions.clear();
      this.handleObjectCollisions();
    }

    //
    this.CheckCollisionEnd()
  }

  private handleBoundaryCollisions(obj: PhysicsObjectBare): void
  {
  if (obj.static) return;
  if (!obj.stayInBounds) return;

  const boundsLeft = this.x ?? 0;
  const boundsTop = this.y ?? 0;
  const boundsRight = boundsLeft + (this.width ?? 0);
  const boundsBottom = boundsTop + (this.height ?? 0);

  // Use object restitution as wall bounce (clamped)
  const e = Math.max(0, Math.min(1, obj.restitution));

  // Small padding to avoid jitter on exact boundary
  const eps = 1e-4;

  // Compute extents around obj.x/obj.y
  let left = obj.x, right = obj.x, top = obj.y, bottom = obj.y;

  if (obj.physicsHitbox.type === HitboxType.Circle) {
    const r = obj.physicsHitbox.radius || 0;
    left = obj.x - r;
    right = obj.x + r;
    top = obj.y - r;
    bottom = obj.y + r;
  } else if (obj.physicsHitbox.type === HitboxType.Rectangle) {
    const rect = obj.physicsHitbox.rectangle;
    const rx = (rect?.x ?? 0) - (obj.pivot?.x ?? 0);
    const ry = (rect?.y ?? 0) - (obj.pivot?.y ?? 0);
    const rw = rect?.width ?? 0;
    const rh = rect?.height ?? 0;

    left = obj.x + rx;
    right = left + rw;
    top = obj.y + ry;
    bottom = top + rh;
  }

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
    const maxIterations = 8;

    for (let iteration = 0; iteration < maxIterations; iteration++)
    {
      let resolvedAny = false;

      for (let i = 0; i < this.objects.length; i++)
      {
        for (let j = i + 1; j < this.objects.length; j++)
        {
          const obj1 = this.objects[i];
          const obj2 = this.objects[j];

          if (obj1.static && obj2.static) continue;
          if (!obj1.collide || !obj2.collide) continue;
          if (!obj1.physicsHitbox.active || !obj2.physicsHitbox.active) continue;

          let collision = false;
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
            const dx = obj2.x - obj1.x;
            const dy = obj2.y - obj1.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < obj1.physicsHitbox.radius + obj2.physicsHitbox.radius) {
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
            this.HandleCollision(obj1, obj2, emitEvents);

            // collide COULD HAVE CHANGED SINCE HandleCollision() SENT OUT EVENTS
            if (!obj1.collide || !obj2.collide) {
                continue;
            }

            // Skip physical response for sensors or non-solid objects
            if (obj1.sensor || obj2.sensor) {
                continue;
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

            if (this.OnBeforeCollisionResolve && !this.OnBeforeCollisionResolve(obj1, obj2)) continue;
            const corr = this.ResolveSolidCollision(obj1, obj2, collisionInfo);
            if (!corr) continue;

            this.applyBlockedStatesFromNormal(obj1, obj2, corr.nx, corr.ny);

            const { xAddObj1, yAddObj1, xAddObj2, yAddObj2 } = corr;

            if (xAddObj1 !== 0 || yAddObj1 !== 0) {
              obj1.x += xAddObj1;
              obj1.y += yAddObj1;
              resolvedAny = true;
            }

            if (xAddObj2 !== 0 || yAddObj2 !== 0) {
              obj2.x += xAddObj2;
              obj2.y += yAddObj2;
              resolvedAny = true;
            }
          }
          // no collision - CheckCollisionEnd() handles end detection
        }
      }

      if (!resolvedAny) {
        break;
      }

      for (const obj of this.objects) {
        if (!obj.physicsHitbox.active) continue;
        if (!obj.physicsHitbox.rectangle || obj.physicsHitbox.rectangle.width == 0 || obj.physicsHitbox.rectangle.height == 0) continue;
        this.handleBoundaryCollisions(obj);
      }
    }
  }

  private checkCircleRectCollision(circle: PhysicsObjectBare, obj: PhysicsObjectBare): {
      collision: boolean;
      dx: number;
      dy: number;
      distance: number;
      angle: number;
    }
  {
    // Get rectangle bounds
    const rectLeft = obj.x + obj.physicsHitbox.rectangle.x - obj.pivot.x;
    const rectRight = rectLeft + obj.physicsHitbox.rectangle.width;
    const rectTop = obj.y + obj.physicsHitbox.rectangle.y - obj.pivot.y;
    const rectBottom = rectTop + obj.physicsHitbox.rectangle.height;

    const insideRect =
      circle.x >= rectLeft &&
      circle.x <= rectRight &&
      circle.y >= rectTop &&
      circle.y <= rectBottom;

    // Find closest point on rectangle to circle center
    const closestX = Math.max(rectLeft, Math.min(circle.x, rectRight));
    const closestY = Math.max(rectTop, Math.min(circle.y, rectBottom));

    // Calculate distance from circle center to closest point
    const dx = circle.x - closestX;
    const dy = circle.y - closestY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (insideRect) {
      const distLeft = circle.x - rectLeft;
      const distRight = rectRight - circle.x;
      const distTop = circle.y - rectTop;
      const distBottom = rectBottom - circle.y;

      const minDist = Math.min(distLeft, distRight, distTop, distBottom);

      if (minDist === distLeft) {
        return {
          collision: true,
          dx: -1,
          dy: 0,
          distance: circle.physicsHitbox.radius + distLeft,
          angle: Math.PI
        };
      }

      if (minDist === distRight) {
        return {
          collision: true,
          dx: 1,
          dy: 0,
          distance: circle.physicsHitbox.radius + distRight,
          angle: 0
        };
      }

      if (minDist === distTop) {
        return {
          collision: true,
          dx: 0,
          dy: -1,
          distance: circle.physicsHitbox.radius + distTop,
          angle: -Math.PI / 2
        };
      }

      return {
        collision: true,
        dx: 0,
        dy: 1,
        distance: circle.physicsHitbox.radius + distBottom,
        angle: Math.PI / 2
      };
    }

    if (distance < circle.physicsHitbox.radius) {
      return {
        collision: true,
        dx: dx,
        dy: dy,
        distance: circle.physicsHitbox.radius - distance, // Penetration depth
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
  
  
  
  private checkRectRectCollision(obj1: PhysicsObjectBare, obj2: PhysicsObjectBare): {
    collision: boolean;
    dx: number;
    dy: number;
    distance: number;
    angle: number;
  } {
    // Get rectangle 1 bounds
    const rect1Left = obj1.x - obj1.pivot.x + obj1.physicsHitbox.rectangle.x;
    const rect1Right = rect1Left + obj1.physicsHitbox.rectangle.width * obj1.totalScaleX;
    const rect1Top = obj1.y - obj1.pivot.y + obj1.physicsHitbox.rectangle.y;
    const rect1Bottom = rect1Top + obj1.physicsHitbox.rectangle.height * obj1.totalScaleY;

    // Get rectangle 2 bounds
    const rect2Left = obj2.x - obj2.pivot.x + obj2.physicsHitbox.rectangle.x;
    const rect2Right = rect2Left + obj2.physicsHitbox.rectangle.width * obj2.totalScaleX;
    const rect2Top = obj2.y - obj2.pivot.y + obj2.physicsHitbox.rectangle.y;
    const rect2Bottom = rect2Top + obj2.physicsHitbox.rectangle.height * obj2.totalScaleY;

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

  GetCollidingObjectsAgainst(obj: PhysicsObjectBare): PhysicsObjectBare[]
  {
    var collidingObjects: PhysicsObjectBare[] = [];

    for (let i = 0; i < this.objects.length; i++)
    {
        var otherObj = this.objects[i];

        if (otherObj == obj)
            continue;

        if (this.CheckCollision(obj, otherObj))
        {
            collidingObjects.push(otherObj);
        }
    }

    return collidingObjects;
  }
  
  CheckCollision(obj1: PhysicsObjectBare, obj2: PhysicsObjectBare): boolean
  {
    return this.GetCollisionInfo(obj1, obj2).collision;
  }

  GetCollisionInfo(obj1: PhysicsObjectBare, obj2: PhysicsObjectBare): {collision: boolean, dx: number, dy: number, distance: number, angle: number}
  {
    return this.checkRectRectCollision(obj1, obj2);
  }

  HandleCollision(object1: PhysicsObjectBare, object2: PhysicsObjectBare, emitEvents: boolean = true)
  {
      // Create a unique key for this collision pair
      const collisionKey = `${object1.uniqueID}##${object2.uniqueID}`;
      const alreadyTrackedThisFrame = this.currentFrameCollisions.has(collisionKey);
      
      this.currentFrameCollisions.add(collisionKey);
      
      const isNewCollision = !this.activeCollisions.has(collisionKey);

      if (isNewCollision)
      {
          this.activeCollisions.add(collisionKey);
      }

      if (!emitEvents || !object1.texture || !object2.texture) {
          return;
      }

      // If this is a new collision
      if (isNewCollision)
      {
          object1.OnCollisionStart(object2);
          object2.OnCollisionStart(object1);
          events.emit(BareEvent.collision_start, object1, object2);
      }
      
      if (!alreadyTrackedThisFrame) {
        // Emit ongoing collision once per frame, even if the solver needs multiple passes.
        object1.OnCollisionUpdate(object2);
        object2.OnCollisionUpdate(object1);
        events.emit(BareEvent.collision_update, object1, object2);
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
        const object1 = this.objects.find(obj => obj.uniqueID == obj1ID);
        const object2 = this.objects.find(obj => obj.uniqueID == obj2ID);

        if (object1 && object2)
        {
          object1.OnCollisionEnd(object2);
          object2.OnCollisionEnd(object1);
          events.emit(BareEvent.collision_end, object1 as PhysicsObjectBare, object2 as PhysicsObjectBare);
        }

        this.activeCollisions.delete(collisionKey);
      }
  }

  private addBlockedState(obj: PhysicsObjectBare, state: BlockedState): void
  {
    obj.blocked |= state;
  }

  private applyBlockedStatesFromNormal(obj1: PhysicsObjectBare, obj2: PhysicsObjectBare, nx: number, ny: number): void
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
    obj1: PhysicsObjectBare,
    obj2: PhysicsObjectBare,
    collisionInfo: { dx: number; dy: number; distance: number; angle: number }
  ): { nx: number; ny: number }
  {
    const rectRect =
      obj1.physicsHitbox.type === HitboxType.Rectangle &&
      obj2.physicsHitbox.type === HitboxType.Rectangle;

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
    obj1: PhysicsObjectBare,
    obj2: PhysicsObjectBare,
    collisionInfo: { dx: number; dy: number; distance: number; angle: number }
  ): { xAddObj1: number; yAddObj1: number; xAddObj2: number; yAddObj2: number; nx: number; ny: number } | null
  {
    let xAddObj1 = 0, yAddObj1 = 0;
    let xAddObj2 = 0, yAddObj2 = 0;

    // --- penetration depth (DO NOT /2 for rect-rect)
    let penetration = 0;

    if (obj1.physicsHitbox.type === HitboxType.Circle && obj2.physicsHitbox.type === HitboxType.Circle) {
      penetration = (obj1.physicsHitbox.radius + obj2.physicsHitbox.radius) - collisionInfo.distance;
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
        const restitution = Math.min(obj1.restitution ?? 0, obj2.restitution ?? 0);
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

	GetObjectAtPoint(position: Vec2, ignoredObject?: PhysicsObjectBare): PhysicsObjectBare | null
	{
		for (let i = 0; i < this.objects.length; i++)
		{
			var obj = this.objects[i];

			if (obj == ignoredObject)
				continue;

			var rect = obj.physicsHitbox.rectangle;

			if (!rect)
			continue

			if (position.x >= obj.x + rect.x - obj.pivot.x &&
				position.x <= obj.x + rect.x + rect.width - obj.pivot.x &&
				position.y >= obj.y + rect.y - obj.pivot.y &&
				position.y <= obj.y + rect.y + rect.height - obj.pivot.y)
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
      return;
    }

    for (let i = this.objects.length - 1; i >= 0; i--)
    {
      if (!this.objects[i].persistent)
        this.objects.splice(i, 1);
    }
  }
}

export var physicsControllerBare:PhysicsControllerBare;
BareEngine.RegisterController(PhysicsControllerBare);
