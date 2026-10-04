import { Color } from "../../rapid-render";
import { AngleJoint } from "../angle";
import { RigidBody } from "../rigidbody";
import { World } from "../world";
import { JointObject } from "./jointObject";

export class AngleJointObject extends JointObject
{
    override OnAwake(): void
    {
        this.resizeable = false;
        this.SetColor(new Color(159, 205, 254));
    }

    protected override CreateJoint(bodyA: RigidBody, bodyB: RigidBody): AngleJoint
    {
        var world = this.scene.Get("sopiro").world as World;
        var angleJoint = new AngleJoint(bodyA, bodyB, this.frequency, this.dampingRatio, this.jointMass);

        this.joint = angleJoint;
        world.register(angleJoint, true);

        return angleJoint;
    }
}
