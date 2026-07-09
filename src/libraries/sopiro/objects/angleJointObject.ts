import { AngleJoint } from "../angle";
import { RigidBody } from "../rigidbody";
import { World } from "../world";
import { JointObject } from "./jointObject";

export class AngleJointObject extends JointObject
{
    override OnStart(): void
    {
        this.resizeable = false;

        super.OnStart();
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
