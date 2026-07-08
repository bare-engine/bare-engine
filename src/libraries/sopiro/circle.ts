
import type { Scene } from "../../scenes/scene";
import { GameObject } from "../../objects/gameObject";
import { Entity } from "../../types/bareTypes";
import { RigidBody, Type } from "./rigidbody";
import { Settings } from "./settings";
import * as Util from "./util";
import { InspectorField } from "../../utils/decorators";

export class Circle extends RigidBody
{
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

            this._density = density;
            this.RefreshMassProperties();
        }
    }

    override ResetValues(): this
    {
        super.ResetValues();
        this.radius = 0;
        this.area = 0;

        return this;
    }
    
    override OnApplyEntityVarsToGameObject(entity: Entity, obj: GameObject)
    {
        if (!entity.hitboxRadius)
        {
            entity.hitboxRadius = Math.min(this.texture.width, this.texture.height) * .5;
        }
    }

    set hitboxRadius(radius: number)
    {
        this.radius = radius;
        this.area = Math.PI * this.radius * this.radius;
        this.RefreshMassProperties();
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

    override RefreshMassProperties()
    {
        if (this.type == Type.Static || this.radius <= 0)
            return;

        if (this._density <= 0 || this._density == Number.MAX_VALUE)
            this._density = Settings.defaultDensity;

        this._mass = this._density * this.worldArea;
        this._invMass = 1.0 / this._mass;
        this._inertia = Util.calculateCircleInertia(this.worldRadius, this._mass);
        this._invInertia = 1.0 / this._inertia;
    }

    @InspectorField
    override get mass(): number
    {
        return this._mass;
    }
    // This will automatically set the inertia
    override set mass(mass: number)
    {
        Util.assert(mass > 0);

        this._density = mass / this.worldArea;
        this._mass = mass;
        this._invMass = 1.0 / this._mass;
        this._inertia = Util.calculateCircleInertia(this.worldRadius, this._mass);
        this._invInertia = 1.0 / this._inertia;
    }

    @InspectorField
    override get density(): number
    {
        return this._density;
    }
    // This will automatically set the mass and inertia
    override set density(density: number) //kg/m²
    {
        Util.assert(density > 0);

        this._density = density;
        this._mass = density * this.worldArea;
        this._invMass = 1.0 / this._mass;
        this._inertia = Util.calculateCircleInertia(this.worldRadius, this._mass);
        this._invInertia = 1.0 / this._inertia;
    }
}
