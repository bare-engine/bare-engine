import { GameMode } from "../../../globals";
import { GameObject } from "../../../objects/gameObject";
import { BareEvent } from "../../../types/bareTypes";
import { InspectorField, Percentage, Range } from "../../../utils/decorators";
import { Circle } from "../circle";
import { testPointInside } from "../detection";
import { Joint } from "../joint";
import { RigidBody, Type } from "../rigidbody";
import { World } from "../world";

export abstract class JointObject extends GameObject
{
    @InspectorField
    baseCustomName: string = "";

    @InspectorField
    targetCustomName: string = "";
    
    protected joint: Joint | null = null;

    // Keep serialized values until the level is loaded and the real joint can be created.
    private _frequency: number = 60;
    private _dampingRatio: number = 1.0;
    private _jointMass: number = 1;

    staticAnchor: Circle;

    override OnAwake(): void
    {
        if (bare.gameMode == GameMode.Game)
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
        if (bare.gameMode == GameMode.Editor)
            return;

        var bodyA: RigidBody | null = null;
        var bodyB: RigidBody | null = null;
        
        if (this.baseCustomName == "jointAnchor")
            bodyA = this.CreateAnchor();
        else
            bodyA = bare.object.GetByCustomName(this.baseCustomName) as RigidBody;

        bodyB = bare.object.GetByCustomName(this.targetCustomName) as RigidBody;

        if (!bodyA || !bodyB)
        {
            console.warn("No bodies found for joint");
            return;
        }

        this.joint = this.CreateJoint(bodyA, bodyB);
    }

    override OnRemove(): void
    {
        bare.events.offAlias("joint_level_preSave");
    }

    protected CheckAddJoint(): void
    {
        var world = this.scene.Get("sopiro").world as World;

        // RESET
        {
            this.baseCustomName = "";
            this.targetCustomName = "";

            if (this.staticAnchor)
                world.unregister(this.staticAnchor.id);

            if (this.joint && bare.gameMode == GameMode.Game)
            {
                world.unregister(this.joint.id, true);
            }
            
            this.joint = null;
        }

        var {bodyA, bodyB} = this.GetBodies();

        if (!bodyA || !bodyB)
            return;

        this.joint = this.CreateJoint(bodyA, bodyB);
        
        if (!bodyA.customName)
            bodyA.customName = ("body_" + bodyA.x + "_" + bodyA.y);

        this.baseCustomName = bodyA.customName;
        
        if (!bodyB.customName)
            bodyB.customName = ("body_" + bodyB.x + "_" + bodyB.y);

        this.targetCustomName = bodyB.customName;
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
            this.Remove();
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
        staticAnchor.customName = staticAnchor.name;
        staticAnchor.save = false;
        staticAnchor.visible = false;
        staticAnchor.visibleInEditor = false;
        staticAnchor.collide = false;

        this.staticAnchor = staticAnchor;

        var world = this.scene.Get("sopiro").world as World;
        world.register(staticAnchor);

        return staticAnchor;
    }

    override Render(): void
    {
        if (bare.gameMode == GameMode.Editor)
        {
            super.Render();
            return;
        }

        // DISABLE RENDERING TEXTURE FOR GAME
        this.OnRender();
    }

    protected abstract CreateJoint(bodyA: RigidBody, bodyB: RigidBody): Joint;

    protected AwakeBodies(): void
    {
        this.joint?.bodyA?.awake();
        this.joint?.bodyB?.awake();
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
