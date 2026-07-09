import { GameMode, Scene } from "../../../globals";
import { GameObject } from "../../../objects/gameObject";
import { BareEvent, Entity } from "../../../types/bareTypes";
import { InspectorField, Percentage, Range } from "../../../utils/decorators";
import { Circle } from "../circle";
import { testPointInside } from "../detection";
import { Joint } from "../joint";
import { RevoluteJoint } from "../revolute";
import { RigidBody, Type } from "../rigidbody";

export class JointObject extends GameObject
{
    bodyA: RigidBody | null = null;
    bodyB: RigidBody | null = null;

    protected joint: Joint | null = null;

    // Keep serialized values until the level is loaded and the real joint can be created.
    private _frequency: number = 60;
    private _dampingRatio: number = 1.0;
    private _jointMass: number = 1;

    constructor(scene: Scene)
    {
        super(scene);
    }

    OnAwake(entity?: Entity): void
    {
        this.bodyA = null;
        this.bodyB = null;
        this.joint = null;

        if (bare.gameMode != GameMode.Game)
            return;

        bare.events.once(BareEvent.level_loaded, this.AddJoint.bind(this));
    }

    private AddJoint(): void
    {
        var world = this.scene.Get("sopiro").world;
        this.bodyA = null;
        this.bodyB = null;
        this.joint = null;

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

        this.joint = this.CreateJoint(this.bodyA, this.bodyB);

        if (bare.gameMode == GameMode.Game)
            world.register(this.joint, true);
    }

    protected CreateJoint(bodyA: RigidBody, bodyB: RigidBody): Joint
    {
        return new RevoluteJoint(bodyA, bodyB, this.position, this.frequency, this.dampingRatio, this.jointMass);
    }

    protected AwakeBodies(): void
    {
        this.bodyA?.awake();
        this.bodyB?.awake();
    }

    @InspectorField
    get frequency(): number
    {   
        return this._frequency;
    }
    set frequency(frequency: number)
    {
        this._frequency = frequency;

        if (this.joint)
            this.joint.frequency = frequency;
    }

    @InspectorField @Percentage
    get dampingRatio(): number
    {
        return this._dampingRatio;
    }
    set dampingRatio(dampingRatio: number)
    {
        this._dampingRatio = dampingRatio;

        if (this.joint)
            this.joint.dampingRatio = dampingRatio;
    }

    @InspectorField @Range(1, Infinity)
    get jointMass(): number
    {
        return this._jointMass;
    }
    set jointMass(jointMass: number)
    {
        this._jointMass = jointMass;

        if (this.joint)
            this.joint.jointMass = jointMass;
    }
}
