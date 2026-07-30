import type { Scene } from "../../scenes/scene";
import { Entity } from "../../types/bareTypes";
import { InspectorField, Limit, Save } from "../../utils/decorators";
import { Vec2 } from "../new-rapid-render";
import { RigidBody, Type } from "./rigidbody";
import { Settings } from "./settings";
import * as Util from "./util";

export class Polygon extends RigidBody
{
    public vertices: Vec2[];
    public area: number;

    constructor(scene: Scene, vertices: Vec2[], type: Type = Type.Dynamic, resetPosition: boolean = true, density: number = Settings.defaultDensity)
    {
        super(scene, type);
        
        this._density = density;//
        
        if (!vertices)
            vertices = [new Vec2()];
        
        this.SetVertices(vertices, resetPosition);
    }

    override ResetValues(): this
    {
        super.ResetValues();
        this.vertices = [new Vec2()];
        this.area = 0;

        return this;
    }

    set polygonVertices(value: number[])
    {
        var valueVec:Array<Vec2> = [];
        for (let i = 0; i < value.length; i += 2)
            valueVec.push(new Vec2(value[i], value[i + 1]));

        this.SetVertices(valueVec);
    }

    set rigidbodyRect(value: { width: number, height: number })
    {
        this.SetPhysicsDimensions(value.width, value.height);
    }

    SetPhysicsDimensions(width: number, height: number): void
    {
        this.vertices = this.ScaleVertices(this.vertices, width, height);
        this.SetVertices(this.vertices);
    }

    ScaleVertices(vertices: Vec2[], width: number, height: number): Vec2[]
    {
        let res: Vec2[] = [];

        var transform = (val:number) => (val < 0 ? 0 : 1);

        for (let i = 0; i < vertices.length; i++)
            res.push(new Vec2(transform(vertices[i].x) * width, transform(vertices[i].y) * height));

        return res;
    }

    SetVertices(vertices: Vec2[], resetPosition: boolean = true)
    {
        this.vertices = vertices;
        //this.vertices = vertices.map(v => new Vec2(v.x, v.y));

        let centerOfMass = new Vec2(0, 0);
        let count = this.count;

        for (let i = 0; i < count; i++)
        {
            centerOfMass.x += this.vertices[i].x;
            centerOfMass.y += this.vertices[i].y;
        }

        centerOfMass.x /= count;
        centerOfMass.y /= count;

        let area = 0;

        this.vertices[0].x -= centerOfMass.x;
        this.vertices[0].y -= centerOfMass.y;

        for (let i = 1; i < count; i++)
        {
            this.vertices[i].x -= centerOfMass.x;
            this.vertices[i].y -= centerOfMass.y;

            area += this.vertices[i - 1].cross(this.vertices[i]);
        }
        area += this.vertices[count - 1].cross(this.vertices[0]);

        this.area = Math.abs(area) / 2.0;

        this.density = this._density; // RECALCULATES MASS AND SUCH

        // BIT HACKY
        if (!resetPosition)
        {
            var pos = this.position.add(centerOfMass)
            this.SetPosition(pos.x, pos.y);
        }
    }

    repositionCenterOfMass(p: Vec2)
    {
        for (let i = 0; i < this.vertices.length; i++)
        {
            let vertex = this.vertices[i];
            vertex.x -= p.x;
            vertex.y -= p.y;
        }
    }

    get count(): number
    {
        return this.vertices.length;
    }

    // vertices/area STAY IN LOCAL SPACE, THESE GIVE THE WORLD-SPACE VERSIONS THAT MASS/INERTIA NEED
    get worldArea(): number
    {
        return this.area * Math.abs(this.scale.x * this.scale.y);
    }

    get worldVertices(): Vec2[]
    {
        return this.vertices.map(v => new Vec2(v.x * this.scale.x, v.y * this.scale.y));
    }

    override RefreshMassProperties(): void
    {
        if (this.type == Type.Static || !this.vertices || this.area <= 0 || !(this._density > 0) || this._density == Number.MAX_VALUE)
            return;

        this.density = this._density;
    }

    @InspectorField @Save @Limit(0.0001, Infinity)
    override get density(): number
    {
        return this._density;
    }
    // This will automatically set the mass and inertia
    override set density(density: number)
    {
        density = Math.max(density, 0);
        //Util.assert(density > 0);

        this._density = density;
        this._mass = (density * this.worldArea) / Settings.densityFactor;
        this._invMass = 1.0 / this._mass;
        this._inertia = Util.calculateConvexPolygonInertia(this.worldVertices, this._mass, this.worldArea);
        this._invInertia = 1.0 / this._inertia;
    }

    @InspectorField @Save @Limit(0.0001, Infinity)
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
        this._inertia = Util.calculateConvexPolygonInertia(this.worldVertices, this._mass, this.worldArea);
        this._invInertia = 1.0 / this._inertia;
    }
}
