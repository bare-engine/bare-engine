import { GameMode, Scene } from "../../../globals";
import { InspectorField, Percentage, Range } from "../../../utils/decorators";
import { Color, Vec2 } from "../../new-rapid-render";
import { MotorJoint } from "../motor";
import { RigidBody } from "../rigidbody";
import { World } from "../world";
import { JointObject } from "./jointObject";

export class MotorJointObject extends JointObject
{
    // SETTING THESE PRIVATE FIELDS TO KEEP THE VALUES WHEN OBJECT IS CREATED FROM LEVEL
    // THEN, AFTER LEVEL IS LOADED, VALUES CAN BE PASSED ON TO MOTORJOINT
    // WAS PASSING IT DIRECTLY AT FIRST, BUT THEN MOTORJOINT HAD TO BE CREATED 
    // PREMATURELY, REQUIRING IT TO BE THE END OF THE LEVEL.
    private _maxForce: number = 1000000000.0;
    private _maxTorque: number = 1000000000.0;
    private _linearOffset: Vec2 = new Vec2();
    private _angularOffset: number = 0.0;

    @InspectorField private angularSpeed: number = 0;

    constructor(scene: Scene)
    {
        super(scene);
    }

    OnAwake(): void
    {
        super.OnAwake();
        this.SetColor(Color.Orange);
    }

    protected CreateJoint(bodyA: RigidBody, bodyB: RigidBody): MotorJoint
    {
        var world = this.scene.Get("sopiro").world as World;

        var motorJoint = new MotorJoint(bodyA, bodyB, this.position, this._maxForce, this._maxTorque, this.frequency, this.dampingRatio, this.jointMass);
        motorJoint.linearOffset.x = this._linearOffset.x;
        motorJoint.linearOffset.y = this._linearOffset.y;
        motorJoint.angularOffset = this._angularOffset;

        this.joint = motorJoint;
        world.register(motorJoint, true);

        return motorJoint;
    }

    override OnUpdate(deltaTime: number): void
    {
        if (bare.gameMode == GameMode.Editor)
            return;

        if (this.angularSpeed == 0)
            return;

        if (!this.motorJoint)
            return;

        this.angularOffset = this.angularOffset + this.angularSpeed * deltaTime;
    }

    private get motorJoint(): MotorJoint | null
    {
        return this.joint as MotorJoint | null;
    }

    @InspectorField
    get maxForce(): number
    {
        return this._maxForce;
    }
    set maxForce(maxForce: number)
    {
        this._maxForce = maxForce;

        if (this.motorJoint)
            this.motorJoint.maxForce = maxForce;
    }

    @InspectorField
    get maxTorque(): number
    {
        return this._maxTorque;
    }
    set maxTorque(maxTorque: number)
    {
        this._maxTorque = maxTorque;

        if (this.motorJoint)
            this.motorJoint.maxTorque = maxTorque;
    }

    @InspectorField
    get linearOffset(): Vec2
    {
        return this._linearOffset;
    }
    set linearOffset(linearOffset: Vec2)
    {
        this._linearOffset.x = linearOffset.x;
        this._linearOffset.y = linearOffset.y;

        if (this.motorJoint)
        {
            this.motorJoint.linearOffset.x = linearOffset.x;
            this.motorJoint.linearOffset.y = linearOffset.y;
        }

        if (bare.gameMode == GameMode.Game)
            this.AwakeBodies();
    }

    @InspectorField
    get angularOffset(): number
    {
        return this._angularOffset;
    }
    set angularOffset(angularOffset: number)
    {
        this._angularOffset = angularOffset;

        if (this.motorJoint)
            this.motorJoint.angularOffset = angularOffset;

        if (bare.gameMode == GameMode.Game)
            this.AwakeBodies();
    }
}
