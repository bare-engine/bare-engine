import { Box } from "../libraries/sopiro/box";
import { globalEvents, RegisterController, Scene } from "../globals";
import { GameObject } from "../objects/gameObject";
// IMPORT FROM THE INDIVIDUAL FILES, NOT THE "../sopiro" BARREL - THE BARREL HOLDS THE
// BareCollisionEventPairs AUGMENTATION, AND IMPORTING IT HERE WOULD PULL RigidBody INTO
// EVERY PROJECT'S COLLISION EVENT PAYLOADS VIA scene.ts -> THIS FILE
import { World } from "../libraries/sopiro/world";
import { RigidBody, Type } from "../libraries/sopiro/rigidbody";
import { Settings } from "../libraries/sopiro/settings";
import { Polygon } from "../libraries/sopiro/polygon";
import { Circle } from "../libraries/sopiro/circle";
import { Color, Vec2 } from "../libraries/rapid-render";
import { make_pair_natural } from "../libraries/sopiro/util";
import { BareEvent } from "../types/bareTypes";
import { PhysicsControllerBase } from "./physicsControllerBase";
import { AngleJointObject } from "../libraries/sopiro/objects/angleJointObject";
import { DistanceJointObject } from "../libraries/sopiro/objects/distanceJointObject";
import { LineJointObject } from "../libraries/sopiro/objects/lineJointObject";
import { MotorJointObject } from "../libraries/sopiro/objects/motorJointObject";
import { JointObject } from "../libraries/sopiro/objects/jointObject";
import { RevoluteJointObject } from "../libraries/sopiro/objects/revoluteJointObject";
import { WeldJointObject } from "../libraries/sopiro/objects/weldJointObject";
import { GrabJoint } from "../libraries/sopiro/grab";

const sopiroPhysicsEventDefs = {
    collision_start: "collision_start",
    collision_update: "collision_update",
    collision_end: "collision_end",
} as const;

Object.assign(BareEvent, sopiroPhysicsEventDefs);

declare module "../types/bareTypes" {
    interface BareEventExtensions {
        collision_start: "collision_start";
        collision_update: "collision_update";
        collision_end: "collision_end";
    }
    // NOTE: the BareCollisionEventPairs augmentation for Sopiro lives in
    // src/sopiro.ts (the "bare-engine/sopiro" entry) so that scene.ts's
    // `import type { SopiroPhysicsController }` doesn't merge RigidBody into
    // every project's collision event payloads.
}

export class SopiroPhysicsController extends PhysicsControllerBase
{
    public world: World;
    public collisionsEnabled: boolean = true;
    public grabJoint: GrabJoint | null = null;

    private activeCollisions: Map<number, { bodyA: RigidBody; bodyB: RigidBody }> = new Map();

    constructor(scene: Scene)
    {
        super(scene);

        this.world = new World(scene);
    }

    override Start(): void
    {
        bare.events.on(BareEvent.physics_refreshBody, this.RefreshBody.bind(this));

        super.Start();
    }

    override Add(object: GameObject): void
    {
        if (object instanceof RigidBody && !object.parent)
            this.world.register(object);
    }

    override Remove(object: GameObject): void
    {
        if (object === this.grabJoint?.bodyA)
            this.releaseGrab();

        if (object instanceof RigidBody && !object.parent)
            this.world.unregister(object.id);
    }

    RefreshBody(body: RigidBody): void
    {
        if (!body || !body.node)
            return;

        this.world.tree.remove(body.node);
        this.world.tree.add(body);
    }

    setDimensions(x: number = 0, y: number = 0, width: number = 0, height: number = 0)
    {
    }

    override FixedUpdate(fixedDeltaTime: number): void
    {
        if (bare.levelEditorOpen) return;

        Settings.dt = fixedDeltaTime;
        Settings.inv_dt = 1 / fixedDeltaTime;
        this.world.update(fixedDeltaTime);

        if (this.collisionsEnabled)
            this.HandleCollisions();
    }

    override Render(): void
    {
        if (bare.debug)
            this.world.render();

        this.RenderGrab();
    }

    // Visualize an active mouse grab: a line from the grabbed point on the body to the
    // cursor target, with a circle at the target. Shown in-game, independent of debug.
    private RenderGrab(): void
    {
        var grab = this.grabJoint;
        if (!grab)
            return;

        var anchor = grab.bodyA.localToGlobal.mulVector2(grab.localAnchor, 1);

        rapid.drawLine({
            points: [anchor, grab.target],
            width: 4,
            color: Color.Black
        });

        rapid.drawCircle({
            position: anchor,
            radius: 8,
            color: Color.Black
        });
        
        rapid.drawCircle({
            position: grab.target,
            radius: 8,
            color: Color.Black
        });
    }

    grab(body: GameObject, worldTarget: Vec2): boolean
    {
        this.releaseGrab();

        if (!(body instanceof RigidBody) || body.type == Type.Static || this.world.bodies.indexOf(body) < 0)
            return false;

        this.grabJoint = new GrabJoint(body, worldTarget, worldTarget.copy(), Settings.mouseStrength);
        this.world.register(this.grabJoint);
        body.awake();

        return true;
    }

    moveGrab(worldTarget: Vec2): void
    {
        if (!this.grabJoint)
            return;

        this.grabJoint.target = worldTarget.copy();
        this.grabJoint.bodyA.awake();
    }

    releaseGrab(): void
    {
        if (!this.grabJoint)
            return;

        this.world.unregister(this.grabJoint.id, true);
        this.grabJoint = null;
    }

    setCollisionsEnabled(enabled: boolean): void
    {
        if (this.collisionsEnabled === enabled)
            return;

        this.collisionsEnabled = enabled;
        this.world.collisionsEnabled = enabled;

        if (!enabled)
        {
            if (this.activeCollisions.size > 0)
            {
                for (const [, pair] of this.activeCollisions)
                {
                    // emitted untyped: the collision payload is the union of the physics modules the project
                    // imports (bare-engine/arcade, bare-engine/sopiro), so it may not include RigidBody pairs
                    bare.events.emit(BareEvent.collision_end as string, pair.bodyA, pair.bodyB);
                }

                this.activeCollisions.clear();
            }

            this.world.manifoldMap.clear();
            this.world.manifolds = [];

            for (let i = 0; i < this.world.bodies.length; i++)
                this.world.bodies[i].manifoldIDs = [];
        }
    }

    private HandleCollisions(): void
    {
        // PRETTY HEAVY? ONLY DO CHECK FOR OBJECT WE WANT TO CHECK COLLISION EVENT FOR?
        // WOULD NEED NEW SYSTEM

        const currentCollisions = new Set<number>();

        for (let i = 0; i < this.world.manifolds.length; i++)
        {
            const manifold = this.world.manifolds[i];
            const bodyA = manifold.bodyA;
            const bodyB = manifold.bodyB;
            let idA = bodyA.id;
            let idB = bodyB.id;

            if (idA > idB)
            {
                const temp = idA;
                idA = idB;
                idB = temp;
            }

            const key = make_pair_natural(idA, idB);
            currentCollisions.add(key);

            if (!this.activeCollisions.has(key))
            {
                this.activeCollisions.set(key, { bodyA, bodyB });
                bodyA.OnCollisionStart(bodyB);
                bodyB.OnCollisionStart(bodyA);
                bare.events.emit(BareEvent.collision_start as string, bodyA, bodyB);
            }

            bodyA.OnCollisionUpdate(bodyB);
            bodyB.OnCollisionUpdate(bodyA);
            bare.events.emit(BareEvent.collision_update as string, bodyA, bodyB); // NOT SENDING TO globalEvents, PROBABLY NEVER NEEDED? AND COULD COST MORE
        }

        for (const [key, pair] of this.activeCollisions)
        {
            if (currentCollisions.has(key))
                continue;

            pair.bodyA.OnCollisionEnd(pair.bodyB);
            pair.bodyB.OnCollisionEnd(pair.bodyA);
            bare.events.emit(BareEvent.collision_end as string, pair.bodyA, pair.bodyB);
            this.activeCollisions.delete(key);
        }
    }

    Clear(): void
    {
        this.grabJoint = null;
        this.activeCollisions.clear();
        this.world.reset();
    }
}

// GAME OBJECT CLASS REGISTRATION (POOLS + registeredClasses) IS GLOBAL, NOT PER SCENE.
// DONE AT MODULE LOAD (DEFERRED UNTIL bare EXISTS) SO LEVELS CAN SPAWN THESE baseClasses
// BEFORE ANY SCENE HAS TOUCHED THE LAZY scene.sopiro CONTROLLER
function RegisterSopiroClasses(): void
{
    bare.AddClass(RigidBody);
    bare.AddClass(Polygon);
    bare.AddClass(Box);
    bare.AddClass(Circle);
    GameObject.RegisterEntityVars(JointObject);
    bare.AddClass(RevoluteJointObject);
    bare.AddClass(DistanceJointObject);
    bare.AddClass(WeldJointObject);
    bare.AddClass(AngleJointObject);
    bare.AddClass(LineJointObject);
    bare.AddClass(MotorJointObject);
}

if (window.bare)
    RegisterSopiroClasses();
else
    globalEvents.persistent.on(BareEvent.game_awake, RegisterSopiroClasses);

RegisterController(SopiroPhysicsController);
