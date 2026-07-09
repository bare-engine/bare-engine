import { GameMode, Scene } from "../../../globals";
import { GameObject } from "../../../objects/gameObject";
import { BareEvent } from "../../../types/bareTypes";
import { InspectorField } from "../../../utils/decorators";
import { Color, Vec2 } from "../../new-rapid-render";
import { testPointInside } from "../detection";
import { DistanceJoint } from "../distance";
import { RigidBody } from "../rigidbody";
import { World } from "../world";
import { JointObject } from "./jointObject";

export class DistanceJointObject extends JointObject
{
    @InspectorField
    lineColor: Color = Color.Black;

    @InspectorField
    lineWidth: number = 6;

    @InspectorField
    targetOffset: Vec2 = new Vec2();

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

    override Remove(clear?: boolean): void
    {
        super.Remove(clear);
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

    protected override CreateJoint(bodyA: RigidBody, bodyB: RigidBody): DistanceJoint
    {
        var world = this.scene.Get("sopiro").world as World;
        var anchorA = this.position;
        var anchorB = this.GetAnchorB(bodyB);

        var distanceJoint = new DistanceJoint(bodyA, bodyB, anchorA, anchorB, -1, this.frequency, this.dampingRatio, this.jointMass);

        this.joint = distanceJoint;
        world.register(distanceJoint, true);

        return distanceJoint;
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

    private GetAnchorB(bodyB: RigidBody): Vec2
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

    private get distanceJoint(): DistanceJoint | null
    {
        return this.joint as DistanceJoint | null;
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
