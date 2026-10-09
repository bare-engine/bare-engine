import { ContactInfo } from "./contact";
import { Texture, Vec2 } from "../rapid-render";
import { Settings } from "./settings";
import * as Util from "./util";
import { Node } from "./aabbtree";
import { GameObject } from "../../objects/gameObject";
import { Matrix3 } from "./math";
import { GameMode, globalEvents } from "../../globals";
import type { Scene } from "../../scenes/scene";
import { BareEvent, Entity, Position } from '../../types/bareTypes';
import { Enum, Limit, Locked, Percentage } from "../../utils/decorators";
import { SerializeField } from "../../utils/serializeFields";

export enum Type
{
    Static = 0,
    Dynamic
}


// ENTITY PROPERTIES FOR this.AddGameObject<Circle / Polygon / Box>({ ... })
// OBJECT VALUES CAN ALSO BE A PRESET NAME
export interface RigidBodyEntity extends Entity
{
    type?: Type;
    collide?: boolean;
    linearVelocity?: Position | string;
    angularVelocity?: number;
    restitution?: number;
    friction?: number;
    surfaceSpeed?: number;
    density?: number;
    mass?: number;
    gravity?: Position | string | null;
}

// Children: Circle, Polygon
export abstract class RigidBody extends GameObject
{
    declare entity: RigidBodyEntity | null;

    public isPhysicsObject = true;
    public collide: boolean = true;
    
    // Center of mass in local space = (0, 0)
    private _force: Vec2;            // N
    private _torque: number;            // N⋅m

    private _linearVelocity: Vec2;   // m/s
    private _angularVelocity: number;   // rad/s

    // SPLIT IMPULSE: MOVES THE BODY OUT OF OVERLAPS FOR ONE STEP WITHOUT BECOMING PART OF ITS VELOCITY
    public pseudoLinearVelocity: Vec2 = new Vec2(0, 0);
    public pseudoAngularVelocity: number = 0;

    protected _density!: number;          // kg/m²
    protected _mass!: number;             // kg
    protected _invMass!: number;
    protected _inertia!: number;          // kg⋅m²
    protected _invInertia!: number;

    private _friction: number;
    private _restitution: number;
    private _surfaceSpeed: number;      // m/s (Tangential speed)

    @SerializeField(GameMode.Edit) @Enum(Type) @Locked 
    public /*readonly*/ type: Type;

    @SerializeField(GameMode.Edit)
    public gravity: Vec2 | null = null; // null USES gravity FROM settingsData

    public id: number = -1;//
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

    constructor(scene: Scene, type: Type)
    {
        super(scene);

        this._force = new Vec2(0, 0);
        this._torque = 0.0;
        this._linearVelocity = new Vec2(0, 0);
        this._angularVelocity = 0;
        this.pseudoLinearVelocity = new Vec2(0, 0);
        this.pseudoAngularVelocity = 0;
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

    override OnAdded(): void
    {
        // TOUCH THE LAZY scene.sopiro CONTROLLER SO IT EXISTS AND IS LISTENING BEFORE
        // game_objectAdded FIRES FOR THIS OBJECT (BODIES REGISTER INTO THE WORLD VIA THAT EVENT)
        this.scene.sopiro;
    }

    // CENTER PIVOT FOR RIGIDBODIES CREATED DYNAMICALLY BY CODE (NO ENTITY)
    // LEVEL ENTITIES ARE HANDLED IN OnApplyEntityToGameObject INSTEAD
    override async InitTexture(texturePath: string): Promise<Texture | undefined>
    {
        var tex = await super.InitTexture(texturePath);

        if (bare.gameMode == GameMode.Play && !this.entity)
            this.CenterPivotKeepingVisualPosition();

        return tex;
    }

    override OnApplyEntityToGameObject(entity: RigidBodyEntity, addComponents: boolean): void
    {
        // IN THE EDITOR THE PIVOT STAYS WHATEVER THE ENTITY SAYS, SO SAVING KEEPS POSITION/PIVOT UNTOUCHED
        // IN GAME THE PIVOT MUST BE CENTERED (PHYSICS POSITION = CENTER OF MASS)
        // ENTITY VARS (POSITION, PIVOT, SCALE) WERE JUST APPLIED, SO totalScale IS CORRECT AND THIS STAYS IDEMPOTENT
        if (bare.gameMode == GameMode.Play)
            this.CenterPivotKeepingVisualPosition();

        // IN SerializeObject: MAKES THE origEntity FILL PROPER PHYSICS VALUES
        // SO THEY'RE NOT SAVED IN THE LEVEL WHEN THEY'RE ACTUALLY DEFAULTS
        //
        // ONE PROBLEM: OBJECTS WITH SCALE > 1, WILL AWALYS HAVE THEIR MASS SAVED
        // THE origEntity HAS SCALE 1,1 WHICH PRODUCES A CERTAIN MASS VALUE
        // WHEN WE COMPARE THAT TO THE fullEntity, WITH EG SCALE 2,2, THE DENSITY IS DIFFERENT
        // AND IT GETS SERIALIZED IN THE LEVEL. WHILE MASS/DENSITY WAS NOT CHANGED
        // COULD FILTER FOR THIS AFTER, IN SerializeObject(), BUT SEEMS MESSY - TODO
        if (this.type != Type.Static && entity.mass === undefined)
            this.density = entity.density ?? Settings.defaultDensity;
    }

    // THE PIVOT OFFSET LIVES INSIDE THE ROTATED SPACE (render = pos -> rotate -> scale -> -pivot),
    // SO THE COMPENSATION MUST BE ROTATED ALONG OR ROTATED BODIES SHIFT AWAY FROM THEIR EDITOR SPOT
    private CenterPivotKeepingVisualPosition(): void
    {
        var origPivot = this.pivot.clone();
        this.CenterPivot();

        var dx = (this.pivot.x - origPivot.x) * this.totalScaleX;
        var dy = (this.pivot.y - origPivot.y) * this.totalScaleY;

        var cos = Math.cos(this.rotationRad);
        var sin = Math.sin(this.rotationRad);

        this.x += dx * cos - dy * sin;
        this.y += dx * sin + dy * cos;
    }

    override ResetValues(): this
    {
        super.ResetValues();

        this._force = new Vec2(0, 0);
        this._torque = 0.0;
        this._linearVelocity = new Vec2(0, 0);
        this._angularVelocity = 0;
        this.pseudoLinearVelocity = new Vec2(0, 0);
        this.pseudoAngularVelocity = 0;
        this._friction = Settings.defaultFriction;
        this._restitution = Settings.defaultRestitution;
        this._surfaceSpeed = 0.0;
        this.sleeping = false;
        this.resting = 0;
        this.manifoldIDs = [];
        this.jointIDs = [];
        this.node = undefined;
        this.onContact = undefined;
        this.islandID = 0;
        this.id = -1;
        this.collide = true;
        this.gravity = null;
        
        this._density = 0.0;
        this._mass = 0.0;
        this._invMass = 0.0;
        this._inertia = 0.0;
        this._invInertia = 0.0;

        if (this.type == Type.Static)
        {
            this._density = Number.MAX_VALUE;
            this._mass = Number.MAX_VALUE;
            this._invMass = 0;
            this._inertia = Number.MAX_VALUE;
            this._invInertia = 0;
            this.sleeping = true;
        }

        return this;
    }

    OnCollisionStart(collidingObject: GameObject)
    {
        
    }

    OnCollisionUpdate(collidingObject: GameObject)
    {
        
    }

    OnCollisionEnd(collidingObject: GameObject)
    {
        
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

    @SerializeField(GameMode.Edit)
    get linearVelocity(): Vec2
    {
        return this._linearVelocity;
    }
    set linearVelocity(v: Vec2)
    {
        this._linearVelocity = v.copy();
    }

    @SerializeField(GameMode.Edit)
    get angularVelocity(): number
    {
        return this._angularVelocity;
    }
    set angularVelocity(w: number)
    {
        this._angularVelocity = w;
    }

    @SerializeField(GameMode.Edit) @Percentage
    get restitution(): number
    {
        return this._restitution;
    }
    set restitution(r: number)
    {
        Util.assert(r >= 0.0 && r <= 1.0);

        this._restitution = r;
    }

    @SerializeField(GameMode.Edit) @Limit(0, Infinity)
    get friction(): number
    {
        return this._friction;
    }
    set friction(f: number)
    {
        Util.assert(f >= 0.0);

        this._friction = f;
    }

    @SerializeField(GameMode.Edit)
    get surfaceSpeed(): number
    {
        return this._surfaceSpeed;
    }
    set surfaceSpeed(s: number)
    {
        this._surfaceSpeed = s;
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

    SetVelocity(velocity: Vec2): this
    {
        this._linearVelocity.x = velocity.x;
        this._linearVelocity.y = velocity.y;

        return this;
    }

    SetVelocityXY(x: number, y: number): this
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
    // THAT'S SOME WORK, SO GENERALLY BETTER TO this.scene.AddGameObject(rigidbody) AFTER SETTING ALL THESE
    // TO PREVENT THAT

    override SetPosition(x: number, y: number): this
    {
        super.SetPosition(x, y);
        this.RefreshBody();

        return this;
    }

    override SetScale(scale: number): this
    {
        super.SetScale(scale);

        return this;
    }

    override SetScaleXY(x: number, y: number): this
    {
        super.SetScaleXY(x, y);

        return this;
    }

    override OnResize(): void
    {
        super.OnResize();
        this.RefreshMassProperties();
        this.RefreshBody();
    }

    // COLLISION RUNS IN WORLD SPACE (localToGlobal BAKES IN SCALE), SO MASS/INERTIA ARE WORLD SPACE TOO
    // AND MUST BE RECOMPUTED FROM DENSITY WHENEVER THE SCALE CHANGES - IMPLEMENTED BY CHILDREN
    RefreshMassProperties(): void {}

    RefreshBody()
    {
        this.awake();
		
        if (this.type == Type.Static)
            globalEvents.emit(BareEvent.physics_refreshBody, this);
            //sopiroPhysicsController.RefreshBody(this); // CALLING UP
    }
    
    /*override set position(value: Vec2)
    {
        super.position = value;
        this.awake();

        if (this.type == Type.Static)
        if (window.physicsController)
            window.physicsController.RefreshBody(this);
    }*/

    // ROTATION IN RADIANS FOR THE PHYSICS ENGINE
    // rotation ITSELF STAYS IN DEGREES, LIKE EVERY OTHER GAMEOBJECT
    set rotationRad(value: number)
    {
        this.transform.rotation = value * (180 / Math.PI);
    }

    get rotationRad(): number
    {
        return this.transform.rotation / (180 / Math.PI);
    }

    // The collision hull is built centered on local origin (center of mass). In game the pivot is
    // centered and position is shifted to match (see CenterPivotKeepingVisualPosition), so the hull
    // lines up with the sprite. In the editor the pivot is left as-authored, so the hull would sit at
    // the pivot anchor instead of the visual center - offsetting hit tests and debug draws. This is
    // the same pivot->center shift baked into position in game, and it is exactly zero once centered.
    get pivotCompensation(): Vec2
    {
        if (!this.texture)
            return new Vec2();

        var dx = (this.texture.width * 0.5 - this.pivot.x) * this.totalScaleX;
        var dy = (this.texture.height * 0.5 - this.pivot.y) * this.totalScaleY;

        var cos = Math.cos(this.rotationRad);
        var sin = Math.sin(this.rotationRad);

        return new Vec2(dx * cos - dy * sin, dx * sin + dy * cos);
    }

    // Returns local to global transform
    get localToGlobal(): Matrix3
    {
        var o = this.pivotCompensation;

        return new Matrix3()
            .translate(this.position.x + o.x, this.position.y + o.y)
            .rotate(this.rotationRad)
            .scale(this.scale.x, this.scale.y);
    }

    // Returns global to local transform
    get globalToLocal(): Matrix3
    {
        var o = this.pivotCompensation;

        return new Matrix3()
            .scale(1.0 / this.scale.x, 1.0 / this.scale.y)
            .rotate(-this.rotationRad)
            .translate(-(this.position.x + o.x), -(this.position.y + o.y));
    }
}
