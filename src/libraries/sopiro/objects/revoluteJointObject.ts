import { RevoluteJoint } from "../revolute";
import { RigidBody } from "../rigidbody";
import { World } from "../world";
import { JointObject } from "./jointObject";

export class RevoluteJointObject extends JointObject
{
    OnAwake(): void
    {
        this.resizeable = false;
    }

    protected override CreateJoint(bodyA: RigidBody, bodyB: RigidBody): RevoluteJoint
    {
        var world = this.scene.Get("sopiro").world as World;

        var revoluteJoint = new RevoluteJoint(bodyA, bodyB, this.position, this.frequency, this.dampingRatio, this.jointMass);
        
        this.joint = revoluteJoint;
        world.register(revoluteJoint, true);

        return revoluteJoint;
    }
}
