import { ContactInfo } from "./contact";
import { Texture, Vec2 } from "../rapid-render";
import { Settings } from "./settings";
import * as Util from "./util";
import { Node } from "./aabbtree";
import { GameObject } from "../../objects/gameObject";
import { Matrix3 } from "./math";
import { events } from "../../main";
import { BareEvent } from '../../types/bareTypes';

export enum Type
{
    Static = 0,
    Dynamic
}


// Children: Circle, Polygon
export abstract class RigidBody extends GameObject
{
    public isPhysicsObject = true;
    
    // Center of mass in local space = (0, 0)
    private _force: Vec2;            // N
    private _torque: number;            // N⋅m

    private _linearVelocity: Vec2;   // m/s
    private _angularVelocity: number;   // rad/s

    protected _density!: number;          // kg/m²
    protected _mass!: number;             // kg
    protected _invMass!: number;
    protected _inertia!: number;          // kg⋅m²
    protected _invInertia!: number;

    private _friction: number;
    private _restitution: number;
    private _surfaceSpeed: number;      // m/s (Tangential speed)

    public /*readonly*/ type: Type;

    public id: number = -1;
    public islandID: number = 0;
    public manifoldIDs: number[] = [];  // ids of contact manifold containing this body
    public jointIDs: number[] = [];     // ids of the joint containing this body
    public resting: number = 0;
    public sleeping: boolean = false;

    // Pointer to the node in the AABB tree
    public node?: Node;

    // Callback function which is called after the constraint is solved
    // If the callback returns true, it will reset itself to undefined
    public onContact?: (contactInfo: ContactInfo) => boolean;

    constructor(type: Type)
    {
        super();

        this._force = new Vec2(0, 0);
        this._torque = 0.0;
        this._linearVelocity = new Vec2(0, 0);
        this._angularVelocity = 0;
        this._friction = Settings.defaultFriction;
        this._restitution = Settings.defaultRestitution;
        this._surfaceSpeed = 0.0;
        this.type = type;

        if (this.type == Type.Static)
        {
            this._density = Number.MAX_VALUE;
            this._mass = Number.MAX_VALUE;
            this._invMass = 0;
            this._inertia = Number.MAX_VALUE;
            this._invInertia = 0;
            this.sleeping = true;
        }
        else
        {
            // This part is implemented by children.
        }
    }

    // SET PIVOT TO CENTER, ALREADY HAPPENS IN ENTITY CREATION IN BARE GAME
    // BUT ALSO NEEDS TO HAPPEN HERE, IN CASE RIGIDBODY IS CREATED DYNAMICALLY
    override InitTexture(texturePath: string): Promise<Texture>
    {
        var tex = super.InitTexture(texturePath);
        this.CenterPivot();
        return tex;
    }

    override ResetValues(): void
    {
        super.ResetValues();

        this._force = new Vec2(0, 0);
        this._torque = 0.0;
        this._linearVelocity = new Vec2(0, 0);
        this._angularVelocity = 0;
        this._friction = Settings.defaultFriction;
        this._restitution = Settings.defaultRestitution;
        this._surfaceSpeed = 0.0;

        if (this.type == Type.Static)
        {
            this._density = Number.MAX_VALUE;
            this._mass = Number.MAX_VALUE;
            this._invMass = 0;
            this._inertia = Number.MAX_VALUE;
            this._invInertia = 0;
            this.sleeping = true;
        }
    }

    abstract get density(): number;
    abstract set density(d: number);

    abstract get mass(): number;
    abstract set mass(m: number)

    awake(): void
    {
        if (this.type == Type.Static) return;

        this.resting = 0;
        this.sleeping = false;
    }

    set static(value: boolean)
    {
        this.type = Type.Static
        this._density = Number.MAX_VALUE;
        this._mass = Number.MAX_VALUE;
        this._invMass = 0;
        this._inertia = Number.MAX_VALUE;
        this._invInertia = 0;
        this.sleeping = true;

        this.RefreshBody();
    }

    // Getters and Setters
    get inverseMass(): number
    {
        return this._invMass;
    }

    get inertia(): number
    {
        return this._inertia;
    }

    get inverseInertia(): number
    {
        return this._invInertia;
    }

    get friction(): number
    {
        return this._friction;
    }

    set friction(f: number)
    {
        Util.assert(f >= 0.0);

        this._friction = f;
    }

    get restitution(): number
    {
        return this._restitution;
    }

    set restitution(r: number)
    {
        Util.assert(r >= 0.0 && r <= 1.0);

        this._restitution = r;
    }

    get surfaceSpeed(): number
    {
        return this._surfaceSpeed;
    }

    set surfaceSpeed(s: number)
    {
        this._surfaceSpeed = s;
    }

    get linearVelocity(): Vec2
    {
        return this._linearVelocity;
    }

    set linearVelocity(v: Vec2)
    {
        this._linearVelocity = v.copy();
    }

    get angularVelocity(): number
    {
        return this._angularVelocity;
    }

    set angularVelocity(w: number)
    {
        this._angularVelocity = w;
    }

    get force(): Vec2
    {
        return this._force;
    }

    set force(f: Vec2)
    {
        this._force.x = f.x;
        this._force.y = f.y;
    }

    get torque(): number
    {
        return this._torque;
    }

    set torque(t)
    {
        this._torque = t;
    }

    SetVelocity(velocity: Vec2): RigidBody
    {
        this._linearVelocity.x = velocity.x;
        this._linearVelocity.y = velocity.y;

        return this;
    }

    SetVelocityXY(x: number, y: number): RigidBody
    {
        this._linearVelocity.x = x;
        this._linearVelocity.y = y;

        return this;
    }

    ResetVelocity(): void
    {
        this._linearVelocity.x = 0;
        this._linearVelocity.y = 0;
    }

    // ALL THESE REFRESHES MAKE SOPIRO PHYSICS REMOVE AND ADD THE RIGIDBODY FROM THE WORLD
    // THAT'S SOME WORK, SO GENERALLY BETTER TO bare.AddGameObject(rigidbody) AFTER SETTING ALL THESE
    // TO PREVENT THAT

    override SetPosition(x: number, y: number): this
    {
        super.SetPosition(x, y);
        this.RefreshBody();

        return this;
    }

    override SetScale(scale: number): GameObject
    {
        super.SetScale(scale);
        this.RefreshBody();

        return this;
    }

    override SetScaleXY(x: number, y: number): GameObject
    {
        super.SetScaleXY(x, y);
        this.RefreshBody();
        
        return this;
    }

    RefreshBody()
    {
        this.awake();
		
        if (this.type == Type.Static)
            events.emit(BareEvent.physics_refreshBody, this);
            //physicsControllerSopiro.RefreshBody(this); // CALLING UP
    }
    
    /*override set position(value: Vec2)
    {
        super.position = value;
        this.awake();

        if (this.type == Type.Static)
        if (window.physicsController)
            window.physicsController.RefreshBody(this);
    }*/

    set rotation(value: number)
    {
        this.transform.rotation = value * (180 / Math.PI);
    }

    get rotation(): number
    {
        return this.transform.rotation / (180 / Math.PI);
    }
    // Returns local to global transform
    get localToGlobal(): Matrix3
    {
        return new Matrix3()
            .translate(this.position.x, this.position.y)
            .rotate(this.rotation)
            .scale(this.scale.x, this.scale.y);
    }

    // Returns global to local transform
    get globalToLocal(): Matrix3
    {
        return new Matrix3()
            .scale(1.0 / this.scale.x, 1.0 / this.scale.y)
            .rotate(-this.rotation)
            .translate(-this.position.x, -this.position.y);
    }
}