
import { Scene } from "../../exports";
import { GameObject } from "../../objects/gameObject";
import { Entity } from "../../types/bareTypes";
import { RigidBody, Type } from "./rigidbody";
import { Settings } from "./settings";
import * as Util from "./util";

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
            this._mass = density * this.area;
            this._invMass = 1.0 / this._mass;
            this._inertia = Util.calculateCircleInertia(this.radius, this._mass);
            this._invInertia = 1.0 / this._inertia;
        }
    }

    override ResetValues(): void
    {
        super.ResetValues();
        this.radius = 0;
        this.area = 0;
    }
    
    override OnApplyEntityVarsToGameObject(entity: Entity, obj: GameObject)
    {
        if (!entity.physicsRadius)
        {
            entity.physicsRadius = Math.min(this.texture.width, this.texture.height) * .5;
        }

        super.OnApplyEntityVarsToGameObject(entity, obj);
    }

    set physicsRadius(radius: number)
    {
        this.radius = radius;
        this.area = Math.PI * this.radius * this.radius;
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
