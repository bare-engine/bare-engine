import { keyboardController } from "../../../controllers/keyboardController";
import { GameMode, Scene } from "../../../globals";
import { GameObject } from "../../../objects/gameObject";
import { BareEvent } from "../../../types/bareTypes";
import { InspectorField } from "../../../utils/decorators";
import { Save } from "../../../utils/saveFields";
import { Color, Vec2 } from "../../rapid-render";
import { testPointInside } from "../detection";
import { Joint } from "../joint";
import { LineJoint } from "../line";
import { PrismaticJoint } from "../prismatic";
import { RigidBody, Type } from "../rigidbody";
import { World } from "../world";
import { JointObject } from "./jointObject";

// CONSTRAINS A BODY TO SLIDE ALONG A DIRECTION
export class LineJointObject extends JointObject
{
    @Save
    slideDirection: Vec2 = new Vec2(200, 0); // LENGTH DOES NOT MATTER

    @InspectorField @Save
    lockRotation: boolean = false;

    directionObject: DirectionTargetObject;

    override OnAwake(): void
    {
        this.resizeable = false;
        this.SetColor(Color.Lime);

        super.OnAwake();
    }

    override OnAdded(): void
    {
        if (bare.gameMode == GameMode.Edit)
        {
            // DIRECTION OBJECT
            var currentLayer = bare.object.GetLayerOf(this);
            this.directionObject = this.scene.AddGameObject(DirectionTargetObject, currentLayer);
            this.directionObject.SetPosition(this.position.x + this.slideDirection.x, this.position.y + this.slideDirection.y);
            this.directionObject.owner = this;
            this.directionObject.save = false;
            this.directionObject.resizeable = false;
            
            // EVENTS
            bare.events.once(BareEvent.level_loaded, () => {
                this.RestoreDirectionTargetPosition();
                super.CheckAddJoint();
            });

            bare.events.on(BareEvent.level_preSavedToDisk, () => super.CheckAddJoint(), "joint_level_preSave");
        }

        super.OnAdded();
    }

    override OnRemoved(): void
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
        var world = this.scene.Get("sopiro").world as World;
        var direction = this.GetDirection();

        var joint: Joint = this.lockRotation
            ? new PrismaticJoint(bodyA, bodyB, this.position, this.position, direction, this.frequency, this.dampingRatio, this.jointMass)
            : new LineJoint(bodyA, bodyB, this.position, this.position, direction, this.frequency, this.dampingRatio, this.jointMass);

        this.joint = joint;
        world.register(joint, true);

        return joint;
    }

    private GetDirection(): Vec2
    {
        if (bare.gameMode == GameMode.Edit && this.directionObject)
        {
            this.slideDirection = this.directionObject.position.sub(this.position);
            return this.slideDirection;
        }

        return this.slideDirection;
    }

    private RestoreDirectionTargetPosition(): void
    {
        if (bare.gameMode != GameMode.Edit || !this.directionObject)
            return;

        this.directionObject.SetPosition(this.position.x + this.slideDirection.x, this.position.y + this.slideDirection.y);
    }

    get isConnectedInEditor(): boolean
    {
        var body = this.GetBodyUnderPosition(this.position);
        return !!body && body.type == Type.Dynamic && this.slideDirection.squaredLength() > 0;
    }
}

class DirectionTargetObject extends GameObject
{
    owner: LineJointObject;

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

    override OnRenderWorld(): void
    {
        var color = this.owner.isConnectedInEditor ? Color.Lime : Color.Red;
        var ownerPosition =  this.owner.position;
        var targetPosition = this.position;

        rapid.drawLine({
            points: [ownerPosition, targetPosition],
            width: 4,
            color: color
        });

        var direction = targetPosition.sub(ownerPosition).normalized();
        var perpendicular = new Vec2(-direction.y, direction.x);
        var halfWidth = this.width / 2;
        var tip = targetPosition.add(direction.mul(halfWidth));
        var base = tip.sub(direction.mul(this.width));

        rapid.drawGraphic({
            points: [
                tip,
                base.add(perpendicular.mul(halfWidth)),
                base.sub(perpendicular.mul(halfWidth))
            ],
            color: color
        });
    }
}
