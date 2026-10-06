import { GameMode } from "../../../globals";
import { GameObject } from "../../../objects/gameObject";
import { BareEvent, Entity } from "../../../types/bareTypes";
import { Limit, Percentage } from "../../../utils/decorators";
import { SerializeField } from "../../../utils/serializeFields";
import { Circle } from "../circle";
import { testPointInside } from "../detection";
import { Joint } from "../joint";
import { RigidBody, Type } from "../rigidbody";
import { World } from "../world";

export abstract class JointObject extends GameObject
{
    @SerializeField(GameMode.Edit)
    baseName: string = "";

    @SerializeField(GameMode.Edit)
    targetName: string = "";
    
    protected joint: Joint | null = null;

    // Keep serialized values until the level is loaded and the real joint can be created.
    private _frequency: number = 60;
    private _dampingRatio: number = 1.0;
    private _jointMass: number = 1;

    staticAnchor: Circle;

    override OnAwake(entity?: Entity): void
    {
        this.visible = false;
    }

    override OnAdded(): void
    {
        if (bare.gameMode == GameMode.Play)
        {
            bare.events.once(BareEvent.level_loaded, this.InitJointGame.bind(this));
            return;
        }

        if (this.scene.constructor.name == "EntityScene")
            return;

        bare.events.once(BareEvent.level_loaded, this.CheckAddJoint.bind(this));
        bare.events.on(BareEvent.level_preSavedToDisk, this.CheckAddJoint.bind(this), "joint_level_preSave");
    }

    InitJointGame(): void
    {
        if (bare.gameMode == GameMode.Edit)
            return;

        var bodyA: RigidBody | null = null;
        var bodyB: RigidBody | null = null;
        
        if (this.baseName == "jointAnchor")
            bodyA = this.CreateAnchor();
        else
            bodyA = bare.object.GetByName(this.baseName) as RigidBody;

        bodyB = bare.object.GetByName(this.targetName) as RigidBody;

        if (!bodyA || !bodyB)
        {
            console.warn("No bodies found for joint");
            return;
        }

        this.joint = this.CreateJoint(bodyA, bodyB);
    }

    override OnRemoved(): void
    {
        bare.events.offAlias("joint_level_preSave");
    }

    protected CheckAddJoint(): void
    {
        var world = this.scene.Get("sopiro").world as World;
        
        // RESET
        {
            if (this.staticAnchor)
                world.unregister(this.staticAnchor.id);

            if (this.joint && bare.gameMode == GameMode.Play)
            {
                world.unregister(this.joint.id, true);
            }
            
            this.joint = null;
        }

        var {bodyA, bodyB} = this.GetBodies();

        if (!bodyA || !bodyB)
            return;

        this.joint = this.CreateJoint(bodyA, bodyB);
        
        if (!bodyA.name)
            bodyA.name = ("body_" + bodyA.x + "_" + bodyA.y);

        this.baseName = bodyA.name;
        
        if (!bodyB.name)
            bodyB.name = ("body_" + bodyB.x + "_" + bodyB.y);

        this.targetName = bodyB.name;
    }

    GetBodies(): { bodyA: RigidBody | null; bodyB: RigidBody | null; }
    {
        var world = this.scene.Get("sopiro").world as World;

        var bodyA: RigidBody | null = null;
        var bodyB: RigidBody | null = null;

        for (var body of world.bodies)
        {
            if (!testPointInside(body, this.position))
                continue;

            if (!bodyA)
            {
                bodyA = body;
            }
            else
            {
                bodyB = body;
                break;
            }
        }

        if (!bodyA)
        {
            return { bodyA: null, bodyB: null };
        }

        if (!bodyB)
        {
            var staticAnchor = this.CreateAnchor();

            bodyB = bodyA;
            bodyA = staticAnchor;
        }

        return {bodyA: bodyA, bodyB: bodyB};
    }

    CreateAnchor(): RigidBody
    {
        var staticAnchor = new Circle(this.scene, 0.01, Type.Static);
        staticAnchor.SetPosition(this.position.x, this.position.y);
        staticAnchor.name = "jointAnchor";
        staticAnchor.save = false;
        staticAnchor.visible = false;
        staticAnchor.visibleInEditor = false;
        staticAnchor.collide = false;

        this.staticAnchor = staticAnchor;

        var world = this.scene.Get("sopiro").world as World;// .sopiro TODO - ALL
        world.register(staticAnchor);

        return staticAnchor;
    }

    override OnRender(): void
    {
        if (bare.gameMode != GameMode.Edit)
            return;

        rapid.drawCircle({
            radius: 13,
            color: this.color
        });
    }

    protected abstract CreateJoint(bodyA: RigidBody, bodyB: RigidBody): Joint;

    protected AwakeBodies(): void
    {
        this.joint?.bodyA?.awake();
        this.joint?.bodyB?.awake();
    }

    @SerializeField(GameMode.Edit)
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

    @SerializeField(GameMode.Edit) @Percentage
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

    @SerializeField(GameMode.Edit) @Limit(1, Infinity)
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
