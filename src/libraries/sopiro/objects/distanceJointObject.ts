import { keyboardController } from "../../../controllers/keyboardController";
import { GameMode, Scene } from "../../../globals";
import { GameObject } from "../../../objects/gameObject";
import { BareEvent } from "../../../types/bareTypes";
import { Enum, InspectorField } from "../../../utils/decorators";
import { Color, Vec2 } from "../../new-rapid-render";
import { testPointInside } from "../detection";
import { DistanceJoint } from "../distance";
import { Joint } from "../joint";
import { MaxDistanceJoint } from "../maxdistance";
import { RigidBody } from "../rigidbody";
import { World } from "../world";
import { JointObject } from "./jointObject";

// PushPull: holds the bodies at an exact distance, resisting both directions (rod).
// Pull: only enforces an upper bound, so the bodies swing freely inside the radius and
// the spring engages only when overstretched (rope). Serialized by member name via @Enum.
export enum DistanceMode
{
    PushPull,
    Pull
}

export class DistanceJointObject extends JointObject
{
    @InspectorField
    lineColor: Color = Color.Black;

    @InspectorField
    lineWidth: number = 6;

    @InspectorField
    targetOffset: Vec2 = new Vec2();

    // -1 = derive from the anchor distance at creation time.
    private _distance: number = -1;
    private _mode: DistanceMode = DistanceMode.PushPull;

    targetObject: TargetObject;

    override OnAwake(): void
    {
        if (bare.gameMode == GameMode.Game)
        {
            super.OnAwake();
            return;
        }

        bare.events.once(BareEvent.level_loaded, () => {
            this.RestoreTargetPositionFromSavedBody();
            super.CheckAddJoint();
        });

        bare.events.on(BareEvent.level_preSavedToDisk, () => super.CheckAddJoint(), "joint_level_preSave");
    }

    override OnRemove(): void
    {
        if (this.targetObject)
        {
            this.targetObject.Remove();
            this.targetObject = null!;
        }

        bare.events.offAlias("joint_level_preSave");
    }

    override OnStart(): void
    {
        this.resizeable = false;

        if (bare.gameMode == GameMode.Editor)
        {
            this.targetObject = this.scene.AddGameObject(TargetObject);
            this.targetObject.SetPosition(this.position.x, this.position.y + 200);

            this.targetObject.owner = this;
            this.targetObject.save = false;
            this.targetObject.resizeable = false;
        }

        super.OnStart();
    }

    override GetBodies(): { bodyA: RigidBody | null; bodyB: RigidBody | null; }
    {
        if (!this.targetObject)
            return { bodyA: null, bodyB: null };

        var bodyUnderTarget = this.GetBodyUnderPosition(this.targetObject.position);

        if (!bodyUnderTarget)
            return { bodyA: null, bodyB: null };

        var bodyUnderMe = this.GetBodyUnderPosition(this.position) || this.CreateAnchor();

        return { bodyA: bodyUnderMe, bodyB: bodyUnderTarget };
    }

    GetBodyUnderPosition(position: Vec2): RigidBody | null
    {
        var world = this.scene.Get("sopiro").world as World;

        for (var body of world.bodies)
        {
            if (testPointInside(body, position))
                return body;
        }

        return null;
    }

    protected override CreateJoint(bodyA: RigidBody, bodyB: RigidBody): Joint
    {
        var world = this.scene.Get("sopiro").world as World;
        var anchorA = this.position;
        var anchorB = this.GetAnchorB(bodyB);

        // Note the differing argument order between the two joint constructors.
        var joint: Joint = this._mode == DistanceMode.Pull
            ? new MaxDistanceJoint(bodyA, bodyB, this._distance, anchorA, anchorB, this.frequency, this.dampingRatio, this.jointMass)
            : new DistanceJoint(bodyA, bodyB, anchorA, anchorB, this._distance, this.frequency, this.dampingRatio, this.jointMass);

        this.joint = joint;
        world.register(joint, true);

        return joint;
    }

    @InspectorField @Enum(DistanceMode)
    get mode(): DistanceMode
    {
        return this._mode;
    }
    set mode(mode: DistanceMode)
    {
        if (this._mode == mode)
            return;

        this._mode = mode;
        this.RebuildJoint();
    }

    @InspectorField
    get distance(): number
    {
        return this._distance;
    }
    set distance(distance: number)
    {
        this._distance = distance;

        // -1 means "derive from anchors" and only applies at construction.
        if (distance <= 0)
            return;

        if (this.joint instanceof MaxDistanceJoint)
            this.joint.maxDistance = distance;
        else if (this.joint instanceof DistanceJoint)
            this.joint.length = distance;
    }

    // Mode swaps the joint class, so the existing joint has to be recreated.
    private RebuildJoint(): void
    {
        if (!this.joint)
            return;

        var world = this.scene.Get("sopiro").world as World;
        var bodyA = this.joint.bodyA;
        var bodyB = this.joint.bodyB;

        world.unregister(this.joint.id, true);
        this.joint = null;

        if (bodyA && bodyB)
            this.CreateJoint(bodyA, bodyB);
    }

    override OnRender(): void
    {
        if (bare.gameMode == GameMode.Editor || !this.distanceJoint)
            return;

        rapid.drawLine({
            points: [this.anchorA, this.anchorB],
            width: this.lineWidth,
            color: this.lineColor
        });
    }

    protected GetAnchorB(bodyB: RigidBody): Vec2
    {
        if (bare.gameMode == GameMode.Editor && this.targetObject)
        {
            this.targetOffset = bodyB.globalToLocal.mulVector2(this.targetObject.position, 1);
            return this.targetObject.position;
        }

        return bodyB.localToGlobal.mulVector2(this.targetOffset, 1);
    }

    private RestoreTargetPositionFromSavedBody(): void
    {
        if (bare.gameMode != GameMode.Editor || !this.targetObject || !this.targetCustomName)
            return;

        var targetBody = bare.object.GetByCustomName(this.targetCustomName) as RigidBody;
        if (!targetBody)
            return;

        var targetPosition = targetBody.localToGlobal.mulVector2(this.targetOffset, 1);
        this.targetObject.SetPosition(targetPosition.x, targetPosition.y);
    }

    get isConnectedInEditor(): boolean
    {
        return !!this.GetBodyUnderPosition(this.position)
            && !!this.targetObject
            && !!this.GetBodyUnderPosition(this.targetObject.position);
    }

    private get distanceJoint(): DistanceJoint | MaxDistanceJoint | null
    {
        return this.joint as DistanceJoint | MaxDistanceJoint | null;
    }

    private get anchorA(): Vec2
    {
        return this.distanceJoint!.bodyA.localToGlobal.mulVector2(this.distanceJoint!.localAnchorA, 1);
    }

    private get anchorB(): Vec2
    {
        return this.distanceJoint!.bodyB.localToGlobal.mulVector2(this.distanceJoint!.localAnchorB, 1);
    }
}

class TargetObject extends GameObject
{
    owner: DistanceJointObject;

    override get width(): number { return 30; }
    override get height(): number { return this.width; }

    constructor(scene: Scene)
    {
        super(scene);
        this.CenterPivot();
    }

    // Holding shift while dragging snaps the direction (angle from the owner) to 15 degree steps.
    override SetPosition(x: number, y: number): this
    {
        if (this.owner && keyboardController.IsKeyDown("shift"))
        {
            var dx = x - this.owner.x;
            var dy = y - this.owner.y;
            var distance = Math.hypot(dx, dy);
            var step = Math.PI / 12; // 15 degrees
            var angle = Math.round(Math.atan2(dy, dx) / step) * step;

            x = this.owner.x + Math.cos(angle) * distance;
            y = this.owner.y + Math.sin(angle) * distance;
        }

        return super.SetPosition(x, y);
    }

    override OnRender(): void
    {
        var color = this.owner.isConnectedInEditor ? Color.Blue : Color.Red;

        rapid.drawCircle({
            position: this.position,
            radius: this.width / 2,
            color: color
        });

        rapid.drawLine({
            points: [new Vec2(this.owner.x, this.owner.y), this.position],
            width: 4,
            color: color
        });
    }
}
