import { keyboardController } from "../../../controllers/keyboardController";
import { GameMode, Scene } from "../../../globals";
import { GameObject } from "../../../objects/gameObject";
import { BareEvent } from "../../../types/bareTypes";
import { InspectorField } from "../../../utils/decorators";
import { Color, Vec2 } from "../../new-rapid-render";
import { testPointInside } from "../detection";
import { Joint } from "../joint";
import { RigidBody, Type } from "../rigidbody";
import { World } from "../world";
import { JointObject } from "./jointObject";

export abstract class DirectionalJointObject extends JointObject
{
    @InspectorField
    directionOffset: Vec2 = new Vec2(200, 0);

    directionObject: DirectionTargetObject;

    override OnAwake(): void
    {
        if (bare.gameMode == GameMode.Game)
        {
            super.OnAwake();
            return;
        }

        bare.events.once(BareEvent.level_loaded, () => {
            this.RestoreDirectionTargetPosition();
            super.CheckAddJoint();
        });

        bare.events.on(BareEvent.level_preSavedToDisk, () => super.CheckAddJoint(), "joint_level_preSave");
    }

    override OnStart(): void
    {
        this.resizeable = false;

        if (bare.gameMode == GameMode.Editor)
        {
            this.directionObject = this.scene.AddGameObject(DirectionTargetObject);
            this.directionObject.SetPosition(this.position.x + this.directionOffset.x, this.position.y + this.directionOffset.y);
            this.directionObject.owner = this;
            this.directionObject.save = false;
            this.directionObject.resizeable = false;
        }

        super.OnStart();
    }

    override OnRemove(): void
    {
        bare.events.offAlias("joint_level_preSave");
    }

    override GetBodies(): { bodyA: RigidBody | null; bodyB: RigidBody | null; }
    {
        var bodyB = this.GetBodyUnderPosition(this.position);

        if (!bodyB || bodyB.type != Type.Dynamic)
            return { bodyA: null, bodyB: null };

        return { bodyA: this.CreateAnchor(), bodyB: bodyB };
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
        var direction = this.GetDirection();
        return this.CreateDirectionalJoint(bodyA, bodyB, this.position, this.position, direction);
    }

    protected abstract CreateDirectionalJoint(bodyA: RigidBody, bodyB: RigidBody, anchorA: Vec2, anchorB: Vec2, direction: Vec2): Joint;

    private GetDirection(): Vec2
    {
        if (bare.gameMode == GameMode.Editor && this.directionObject)
        {
            this.directionOffset = this.directionObject.position.sub(this.position);
            return this.directionOffset;
        }

        return this.directionOffset;
    }

    private RestoreDirectionTargetPosition(): void
    {
        if (bare.gameMode != GameMode.Editor || !this.directionObject)
            return;

        this.directionObject.SetPosition(this.position.x + this.directionOffset.x, this.position.y + this.directionOffset.y);
    }

    get isConnectedInEditor(): boolean
    {
        var body = this.GetBodyUnderPosition(this.position);
        return !!body && body.type == Type.Dynamic && this.directionOffset.squaredLength() > 0;
    }
}

class DirectionTargetObject extends GameObject
{
    owner: DirectionalJointObject;

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
