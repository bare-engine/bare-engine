
import { GameMode } from "../../globals";
import type { Scene } from "../../scenes/scene";
import { GameObject } from "../../objects/gameObject";
import { Entity } from "../../types/bareTypes";
import { RigidBody, RigidBodyEntity, Type } from "./rigidbody";
import { Settings } from "./settings";
import * as Util from "./util";
import { SerializeField } from "../../utils/serializeFields";

export interface CircleEntity extends RigidBodyEntity
{
    hitboxRadius?: number;
}

export class Circle extends RigidBody
{
    declare entity: CircleEntity | null;

    public radius: number;
    public area: number;

    constructor(scene: Scene, radius: number = 1, type: Type = Type.Dynamic, density: number = Settings.defaultDensity)
    {
        super(scene, type);

        this.radius = radius;
        this.area = Math.PI * this.radius * this.radius;

        if (this.type == Type.Dynamic)
        {
            Util.assert(density > 0);

            this.density = density;
        }
    }

    override ResetValues(): this
    {
        super.ResetValues();
        this.radius = 0;
        this.area = 0;

        return this;
    }
    
    override RefreshMassProperties(): void
    {
        if (this.type == Type.Static || this.area <= 0 || !(this._density > 0) || this._density == Number.MAX_VALUE)
            return;

        this.density = this._density;
    }

    override OnApplyEntityVarsToGameObject(entity: CircleEntity, obj: GameObject)
    {
        if (!entity.hitboxRadius)
        {
            entity.hitboxRadius = Math.min(this.texture!.width, this.texture!.height) * .5;
        }
    }

    set hitboxRadius(radius: number)
    {
        this.radius = radius;
        this.area = Math.PI * this.radius * this.radius;
        this.density = this._density;
    }

    get worldRadius(): number
    {
        return this.radius * Math.max(Math.abs(this.scale.x), Math.abs(this.scale.y));
    }

    // radius/area STAY IN LOCAL SPACE, THIS GIVES THE WORLD-SPACE VERSION THAT MASS/INERTIA NEED
    get worldArea(): number
    {
        return Math.PI * this.worldRadius * this.worldRadius;
    }

    @SerializeField(GameMode.Edit)
    override get density(): number
    {
        return this._density;
    }
    // This will automatically set the mass and inertia
    override set density(density: number) //kg/m²
    {
        density = Math.max(density, 0);
        //Util.assert(density > 0);

        this._density = density;
        this._mass = (density * this.worldArea) / Settings.densityFactor;
        this._invMass = 1.0 / this._mass;
        this._inertia = Util.calculateCircleInertia(this.worldRadius, this._mass);
        this._invInertia = 1.0 / this._inertia;
    }

    @SerializeField(GameMode.Edit)
    override get mass(): number
    {
        return this._mass;
    }
    // This will automatically set the inertia
    override set mass(mass: number)
    {
        Util.assert(mass > 0);

        this._density = mass / this.worldArea * Settings.densityFactor;
        this._mass = mass;
        this._invMass = 1.0 / this._mass;
        this._inertia = Util.calculateCircleInertia(this.worldRadius, this._mass);
        this._invInertia = 1.0 / this._inertia;
    }
}
