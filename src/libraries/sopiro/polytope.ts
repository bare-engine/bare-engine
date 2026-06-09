import { Vec2 } from "../new-rapid-render";
import { Simplex } from "./simplex";

export interface ClosestEdgeInfo
{
    index: number;
    distance: number;
    normal: Vec2;
}

export class Polytope
{
    public readonly vertices: Vec2[];

    constructor(simplex: Simplex)
    {
        if (simplex.count != 3) throw "Input simplex isn't a triangle";

        this.vertices = [
            simplex.vertices[0].copy(),
            simplex.vertices[1].copy(),
            simplex.vertices[2].copy()
        ];
    }

    public get count(): number
    {
        return this.vertices.length;
    }

    // Returns the edge closest to the origin
    getClosestEdge(): ClosestEdgeInfo
    {
        let minIndex = 0;
        let minDistance = Infinity;
        let minNormal = new Vec2();

        for (let i = 0; i < this.count; i++)
        {
            let j = (i + 1) % this.count;

            let vertexI = this.vertices[i];
            let vertexJ = this.vertices[j];

            let edge = vertexJ.sub(vertexI);

            let normal = new Vec2(-edge.y, edge.x).normalized();
            let distance = normal.dot(vertexI);

            if (distance < 0)
            {
                distance *= -1;
                normal.invert();
            }

            if (distance < minDistance)
            {
                minDistance = distance;
                minNormal = normal;
                minIndex = i;
            }
        }

        return { index: minIndex, distance: minDistance, normal: minNormal };
    }
}