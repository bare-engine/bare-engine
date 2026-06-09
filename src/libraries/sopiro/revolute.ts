import { Matrix2 } from "./math";
import { RigidBody } from "./rigidbody";
import { Settings } from "./settings";
import * as Util from "./util";
import { Joint } from "./joint";
import { Vec2 } from "../new-rapid-render";

export class RevoluteJoint extends Joint
{
    public localAnchorA: Vec2;
    public localAnchorB: Vec2;

    private ra!: Vec2;
    private rb!: Vec2;
    private m!: Matrix2;
    private bias!: Vec2;
    private impulseSum: Vec2 = new Vec2();

    constructor(
        bodyA: RigidBody, bodyB: RigidBody,
        anchor: Vec2,
        frequency = 15, dampingRatio = 1.0, mass = -1
    )
    {
        super(bodyA, bodyB, frequency, dampingRatio, mass);
        
        this.localAnchorA = this.bodyA.globalToLocal.mulVector2(anchor, 1);
        this.localAnchorB = this.bodyB.globalToLocal.mulVector2(anchor, 1);
    }

    override prepare()
    {
        // Calculate Jacobian J and effective mass M
        // J = [-I, -skew(ra), I, skew(rb)]
        // M = (J · M^-1 · J^t)^-1

        this.ra = this.bodyA.localToGlobal.mulVector2(this.localAnchorA, 0);
        this.rb = this.bodyB.localToGlobal.mulVector2(this.localAnchorB, 0);

        let k = new Matrix2();

        k.m00 = this.bodyA.inverseMass + this.bodyB.inverseMass +
            this.bodyA.inverseInertia * this.ra.y * this.ra.y + this.bodyB.inverseInertia * this.rb.y * this.rb.y;

        k.m01 = -this.bodyA.inverseInertia * this.ra.y * this.ra.x - this.bodyB.inverseInertia * this.rb.y * this.rb.x;

        k.m10 = -this.bodyA.inverseInertia * this.ra.x * this.ra.y - this.bodyB.inverseInertia * this.rb.x * this.rb.y;

        k.m11 = this.bodyA.inverseMass + this.bodyB.inverseMass
            + this.bodyA.inverseInertia * this.ra.x * this.ra.x + this.bodyB.inverseInertia * this.rb.x * this.rb.x;

        k.m00 += this.gamma;
        k.m11 += this.gamma;

        this.m = k.inverted();

        let pa = this.bodyA.position.add(this.ra);
        let pb = this.bodyB.position.add(this.rb);

        let error = pb.sub(pa);

        if (Settings.positionCorrection)
            this.bias = error.mul(this.beta * Settings.inv_dt);
        else
            this.bias = new Vec2(0.0, 0.0);

        if (Settings.warmStarting)
            this.applyImpulse(this.impulseSum);
    }

    override solve()
    {
        // Calculate corrective impulse: Pc
        // Pc = J^t * λ (λ: lagrangian multiplier)
        // λ = (J · M^-1 · J^t)^-1 ⋅ -(J·v+b)

        let jv: Vec2 = this.bodyB.linearVelocity.add(Util.cross(this.bodyB.angularVelocity, this.rb))
            .sub(this.bodyA.linearVelocity.add(Util.cross(this.bodyA.angularVelocity, this.ra)));

        // You don't have to clamp the impulse. It's equality constraint.
        let lambda = this.m.mulVector(jv.add(this.bias).add(this.impulseSum.mul(this.gamma)).inverted());

        this.applyImpulse(lambda);

        if (Settings.warmStarting)
            this.impulseSum = this.impulseSum.add(lambda);
    }

    protected override applyImpulse(lambda: Vec2)
    {
        // V2 = V2' + M^-1 ⋅ Pc
        // Pc = J^t ⋅ λ

        this.bodyA.linearVelocity = this.bodyA.linearVelocity.sub(lambda.mul(this.bodyA.inverseMass));
        this.bodyA.angularVelocity = this.bodyA.angularVelocity - this.bodyA.inverseInertia * this.ra.cross(lambda);
        this.bodyB.linearVelocity = this.bodyB.linearVelocity.add(lambda.mul(this.bodyB.inverseMass));
        this.bodyB.angularVelocity = this.bodyB.angularVelocity + this.bodyB.inverseInertia * this.rb.cross(lambda);
    }
}