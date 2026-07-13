import { WeldJoint } from "../weld";
import { RigidBody } from "../rigidbody";
import { World } from "../world";
import { JointObject } from "./jointObject";

export class WeldJointObject extends JointObject
{
    override OnAwake(): void
    {
        this.resizeable = false;
        this.frequency = -1; // MAKE IT RIGID BY DEFAULT
    }

    protected override CreateJoint(bodyA: RigidBody, bodyB: RigidBody): WeldJoint
    {
        var world = this.scene.Get("sopiro").world as World;
        var weldJoint = new WeldJoint(bodyA, bodyB, this.position, this.frequency, this.dampingRatio, this.jointMass);

        this.joint = weldJoint;
        world.register(weldJoint, true);

        return weldJoint;
    }
}
