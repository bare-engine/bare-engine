import { Type } from "./rigidbody";
import { Vec2 } from "../rapid-render";
import { Polygon } from "./polygon";
import * as Util from "./util";
import { Settings } from "./settings";

export class Box extends Polygon
{
    phyWidth: number;
    phyHeight: number;

    constructor(width: number = 1, height: number = width, type: Type = Type.Dynamic, density: number = Settings.defaultDensity)
    {
        super([new Vec2(0, 0), new Vec2(0, height), new Vec2(width, height), new Vec2(width, 0)], type, true, density);

        this.phyWidth = width;
        this.phyHeight = height;
    }

    override set physicsRect(value: { width: number, height: number })
    {
        super.physicsRect = value;
        
        this.phyWidth = value.width;
        this.phyHeight = value.height;
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
        this._inertia = Util.calculateBoxInertia(this.phyWidth, this.phyHeight, this._mass);
        this._invInertia = 1.0 / this._inertia;
    }

    override get density(): number
    {
        return this._density;
    }

    // This will automatically set the mass and inertia
    override set density(density: number)
    {
        Util.assert(density > 0);

        this._density = density;
        this._mass = density * this.area;
        this._invMass = 1.0 / this._mass;
        this._inertia = Util.calculateBoxInertia(this.phyWidth, this.phyHeight, this._mass);
        this._invInertia = 1.0 / this._inertia;
    }
}