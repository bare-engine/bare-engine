import { Vec2 } from "../new-rapid-render";
import { Joint } from "./joint";
import { Matrix2 } from "./math";
import { RigidBody } from "./rigidbody";
import { Settings } from "./settings";
import * as Util from "./util";

export class GrabJoint extends Joint
{
    public localAnchor: Vec2;
    public target: Vec2;

    private r!: Vec2;
    private m!: Matrix2;
    private bias!: Vec2;
    private impulseSum: Vec2 = new Vec2();

    constructor(
        body: RigidBody, anchor: Vec2,
        target: Vec2,
        frequency = 0.8, dampingRatio = 0.6, jointMass = -1
    )
    {
        super(body, body, frequency, dampingRatio, jointMass);

        this.localAnchor = body.globalToLocal.mulVector2(anchor, 1);
        this.target = target;
    }

    override prepare(): void
    {
        // Calculate Jacobian J and effective mass M
        // J = [I, skew(r)]
        // M = (J · M^-1 · J^t)^-1

        this.r = this.bodyA.localToGlobal.mulVector2(this.localAnchor, 0);
        let p = this.bodyA.position.add(this.r);

        let k = new Matrix2();

        k.m00 = this.bodyA.inverseMass + this.bodyA.inverseInertia * this.r.y * this.r.y;
        k.m01 = -this.bodyA.inverseInertia * this.r.y * this.r.x;
        k.m10 = -this.bodyA.inverseInertia * this.r.x * this.r.y;
        k.m11 = this.bodyA.inverseMass + this.bodyA.inverseInertia * this.r.x * this.r.x;

        k.m00 += this.gamma;
        k.m11 += this.gamma;

        this.m = k.inverted();

        let error = p.sub(this.target);

        if (Settings.positionCorrection)
            this.bias = error.mul(this.beta * Settings.inv_dt);
        else
            this.bias = new Vec2(0.0, 0.0);

        if (Settings.warmStarting)
            this.applyImpulse(this.impulseSum);
    }

    override solve(): void
    {
        // Calculate corrective impulse: Pc
        // Pc = J^t · λ (λ: lagrangian multiplier)
        // λ = (J · M^-1 · J^t)^-1 ⋅ -(J·v+b)

        let jv: Vec2 = this.bodyA.linearVelocity.add(Util.cross(this.bodyA.angularVelocity, this.r));

        let lambda = this.m.mulVector(jv.add(this.bias).add(this.impulseSum.mul(this.gamma)).inverted());

        this.applyImpulse(lambda);

        if (Settings.warmStarting)
            this.impulseSum = this.impulseSum.add(lambda);
    }

    protected override applyImpulse(lambda: Vec2): void
    {
        // V2 = V2' + M^-1 ⋅ Pc
        // Pc = J^t ⋅ λ

        this.bodyA.linearVelocity = this.bodyA.linearVelocity.add(lambda.mul(this.bodyA.inverseMass));
        this.bodyA.angularVelocity = this.bodyA.angularVelocity + this.bodyA.inverseInertia * this.r.cross(lambda);
    }
}