import { Vec2 } from "../../new-rapid-render";
import { Joint } from "../joint";
import { PrismaticJoint } from "../prismatic";
import { RigidBody } from "../rigidbody";
import { World } from "../world";
import { DirectionalJointObject } from "./directionalJointObject";

export class PrismaticJointObject extends DirectionalJointObject
{
    protected override CreateDirectionalJoint(bodyA: RigidBody, bodyB: RigidBody, anchorA: Vec2, anchorB: Vec2, direction: Vec2): Joint
    {
        var world = this.scene.Get("sopiro").world as World;
        var prismaticJoint = new PrismaticJoint(bodyA, bodyB, anchorA, anchorB, direction, this.frequency, this.dampingRatio, this.jointMass);

        this.joint = prismaticJoint;
        world.register(prismaticJoint, true);

        return prismaticJoint;
    }
}
