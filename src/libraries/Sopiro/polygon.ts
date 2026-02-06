import { RigidBody, Type } from "./rigidbody";
import { Vec2 } from "../rapid-render";
import * as Util from "./util";
import { Settings } from "./settings";
import { Entity, GameObject } from "../..";

// Children: Box
export class Polygon extends RigidBody
{
    public vertices: Vec2[];
    public area: number;

    constructor(vertices: Vec2[], type: Type = Type.Dynamic, resetPosition: boolean = true, density: number = Settings.defaultDensity)
    {
        super(type);
        
        if (!vertices)
            vertices = [new Vec2()];
        
        this.SetVertices(vertices, resetPosition);

        if (this.type == Type.Dynamic)
        {
            Util.assert(density > 0);

            this._density = density;
            this._mass = density * this.area;
            this._invMass = 1.0 / this._mass;
            this._inertia = Util.calculateConvexPolygonInertia(this.vertices, this._mass, this.area);
            this._invInertia = 1.0 / this._inertia;
        }
    }

    set polygonVertices(value: number[])
    {
        var valueVec:Array<Vec2> = [];
        for (let i = 0; i < value.length; i += 2)
            valueVec.push(new Vec2(value[i], value[i + 1]));

        this.SetVertices(valueVec);
    }

    set physicsRect(value: { width: number, height: number })
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
        this._inertia = Util.calculateConvexPolygonInertia(this.vertices, this._mass, this.area);
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
        this._inertia = Util.calculateConvexPolygonInertia(this.vertices, this._mass, this.area);
        this._invInertia = 1.0 / this._inertia;
    }
}