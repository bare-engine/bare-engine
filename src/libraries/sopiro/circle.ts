
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
    }

    get worldRadius(): number
    {
        return this.radius * Math.max(Math.abs(this.scale.x), Math.abs(this.scale.y));
    }

    private RefreshMassProperties()
    {
        if (this.type == Type.Static)
            return;

        if (this._density <= 0)
            this._density = Settings.defaultDensity;

        this._mass = this._density * this.area;
        this._invMass = 1.0 / this._mass;
        this._inertia = Util.calculateCircleInertia(this.radius, this._mass);
        this._invInertia = 1.0 / this._inertia;
    }

    override get mass(): number
    {
        return this._mass;
    }

    // This will automatically set the inertia
    override set mass(mass: number)
    {
        Util.assert(mass > 0);

        this._density = mass / this.area;
        this._mass = mass;
        this._invMass = 1.0 / this._mass;
        this._inertia = Util.calculateCircleInertia(this.radius, this._mass);
        this._invInertia = 1.0 / this._inertia;
    }

    override get density(): number
    {
        return this._density;
    }

    // This will automatically set the mass and inertia
    @InspectorField
    override set density(density: number) //kg/m²
    {
        Util.assert(density > 0);

        this._density = density;
        this._mass = density * this.area;
        this._invMass = 1.0 / this._mass;
        this._inertia = Util.calculateCircleInertia(this.radius, this._mass);
        this._invInertia = 1.0 / this._inertia;
    }
}
