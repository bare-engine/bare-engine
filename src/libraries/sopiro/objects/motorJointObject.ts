import { GameMode, Scene } from "../../../globals";
import { GameObject } from "../../../objects/gameObject";
import { BareEvent, Entity } from "../../../types/bareTypes";
import { InspectorField, Percentage, Range } from "../../../utils/decorators";
import { Vec2 } from "../../new-rapid-render";
import { Circle } from "../circle";
import { testPointInside } from "../detection";
import { MotorJoint } from "../motor";
import { RigidBody } from "../rigidbody";
import { Type } from "../rigidbody";

export class MotorJointObject extends GameObject
{
    bodyA: RigidBody | null = null;
    bodyB: RigidBody | null = null;

    private motorJoint: MotorJoint | null = null;
    private addMotorOnLevelLoaded: (() => void) | null = null;

    // SETTING THESE PRIVATE FIELDS TO KEEP THE VALUES WHEN OBJECT IS CREATED FROM LEVEL
    // THEN, AFTER LEVEL IS LOADED, VALUES CAN BE PASSED ON TO MOTORJOINT
    // WAS PASSING IT DIRECTLY AT FIRST, BUT THEN MOTORJOINT HAD TO BE CREATED 
    // PREMATURELY, REQUIRING IT TO BE THE END OF THE LEVEL.
    private _maxForce: number = 1000000000.0;
    private _maxTorque: number = 1000000000.0;
    private _frequency: number = 60;
    private _dampingRatio: number = 1.0;
    private _jointMass: number = 1;
    private _linearOffset: Vec2 = new Vec2();
    private _angularOffset: number = 0.0;

    @InspectorField private angularSpeed: number = 0;

    constructor(scene: Scene)
    {
        super(scene);
    }

    OnAwake(entity?: Entity): void
    {
        this.bodyA = null;
        this.bodyB = null;
        this.motorJoint = null;

        if (bare.gameMode != GameMode.Game)
            return;

        this.addMotorOnLevelLoaded ??= this.AddMotor.bind(this);
        bare.events.on(BareEvent.level_loaded, this.addMotorOnLevelLoaded);
    }

    override Removed(): void
    {
        if (this.addMotorOnLevelLoaded)
            bare.events.off(BareEvent.level_loaded, this.addMotorOnLevelLoaded);

        super.Removed();
    }

    private AddMotor(): void
    {
        var world = this.scene.Get("sopiro").world;
        this.bodyA = null;
        this.bodyB = null;
        this.motorJoint = null;

        for (var body of world.bodies)
        {
            if (!testPointInside(body, this.position))
                continue;

            if (!this.bodyA)
            {
                this.bodyA = body;
            }
            else
            {
                this.bodyB = body;
                break;
            }
        }

        if (!this.bodyA)
        {
            this.Remove();
            return;
        }

        if (!this.bodyB)
        {
            var staticAnchor = new Circle(this.scene, 0.01, Type.Static);
            staticAnchor.SetPosition(this.position.x, this.position.y);
            staticAnchor.save = false;
            staticAnchor.visible = false;
            staticAnchor.visibleInEditor = false;

            world.register(staticAnchor);

            this.bodyB = this.bodyA;
            this.bodyA = staticAnchor;
        }

        if (!this.bodyA || !this.bodyB)
            return;
        
        this.motorJoint = new MotorJoint(this.bodyA, this.bodyB, this.position, this._maxForce, this._maxTorque, this._frequency, this._dampingRatio, this._jointMass);
        this.motorJoint.linearOffset.x = this._linearOffset.x;
        this.motorJoint.linearOffset.y = this._linearOffset.y;
        this.motorJoint.angularOffset = this._angularOffset;
        
        if (bare.gameMode == GameMode.Game)
            world.register(this.motorJoint, true);
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

    private AwakeBodies(): void
    {
        this.bodyA?.awake();
        this.bodyB?.awake();
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
    get frequency(): number
    {   
        return this._frequency;
    }
    set frequency(frequency: number)
    {
        this._frequency = frequency;

        if (this.motorJoint)
            this.motorJoint.frequency = frequency;
    }

    @InspectorField @Percentage
    get dampingRatio(): number
    {
        return this._dampingRatio;
    }
    set dampingRatio(dampingRatio: number)
    {
        this._dampingRatio = dampingRatio;

        if (this.motorJoint)
            this.motorJoint.dampingRatio = dampingRatio;
    }

    @InspectorField @Range(1, Infinity)
    get jointMass(): number
    {
        return this._jointMass;
    }
    set jointMass(jointMass: number)
    {
        this._jointMass = jointMass;

        if (this.motorJoint)
            this.motorJoint.jointMass = jointMass;
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
