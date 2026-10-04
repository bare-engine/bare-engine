import { Circle } from "./circle";
import { RigidBody } from "./rigidbody";
import { Matrix3 } from "./math";
import { Polygon } from "./polygon";
import { Simplex } from "./simplex";
import { AABB } from "./aabb";
import { Settings } from "./settings";
import * as Util from "./util";
import { Joint } from "./joint";
import { RevoluteJoint } from "./revolute";
import { DistanceJoint } from "./distance";
import { MaxDistanceJoint } from "./maxdistance";
import { GrabJoint } from "./grab";
import { WeldJoint } from "./weld";
import { LineJoint } from "./line";
import { PrismaticJoint } from "./prismatic";
import { MotorJoint } from "./motor";
import { Color, Vec2 } from "../rapid-render";

export class Renderer
{
    private gfx: CanvasRenderingContext2D;

    private cameraTransform!: Matrix3;
    private modelTransform!: Matrix3;
    private projectionTransform!: Matrix3;
    private viewportTransform!: Matrix3;
    private vpc!: Matrix3;

    // Call init function before you start using renderer
    constructor()
    {
        //this.gfx = gfx;
    }

    init(viewportTransform: Matrix3, projectionTransform: Matrix3, cameraTransform: Matrix3): void
    {
        this.viewportTransform = viewportTransform;
        this.projectionTransform = projectionTransform;
        this.cameraTransform = cameraTransform;
        this.vpc = this.viewportTransform.mulMatrix(this.projectionTransform).mulMatrix(this.cameraTransform);
    }

    // Mouse picking
    pick(screenPosition: Vec2): Vec2
    {
        let inv_vp = this.vpc.inverted();

        return inv_vp.mulVector2(screenPosition, 1.0);
    }

    log(content: any, line: number = 0): void
    {
        let y = 75 + line * 20;
        this.drawText(15, y, content, 20);
    }

    setCameraTransform(cameraTransform: Matrix3)
    {
        this.cameraTransform = cameraTransform;
        this.vpc = this.viewportTransform.mulMatrix(this.projectionTransform).mulMatrix(this.cameraTransform);
    }

    setProjectionTransform(projectionTransform: Matrix3): void
    {
        this.projectionTransform = projectionTransform;
        this.vpc = this.viewportTransform.mulMatrix(this.projectionTransform).mulMatrix(this.cameraTransform);
    }

    setViewportTransform(viewportTransform: Matrix3): void
    {
        this.viewportTransform = viewportTransform;
        this.vpc = this.viewportTransform.mulMatrix(this.projectionTransform).mulMatrix(this.cameraTransform);
    }

    setModelTransform(modelTransform: Matrix3): void
    {
        this.modelTransform = modelTransform;
    }

    resetModelTransform(): void
    {
        this.modelTransform.loadIdentity();
    }

    drawCircle(x: number, y: number, radius: number = 0.05, filled: boolean = false): void
    {
        this.drawCircleV(new Vec2(x, y), radius, filled);
    }

    drawCircleV(v: Vec2, radius: number = 0.05, filled: boolean = false): void
    {
        let vpcm = this.vpc.mulMatrix(this.modelTransform);

        let tv = vpcm.mulVector2(v, 1);
        let tr = this.vpc.mulVector2(new Vec2(radius, 0), 0).x;

        this.gfx.lineWidth = 1;
        this.gfx.beginPath();
        this.gfx.arc(tv.x, Settings.height - tv.y, tr, 0, 2 * Math.PI);

        if (filled)
            this.gfx.fill();
        else
            this.gfx.stroke();
    }

    drawLine(x0: number, y0: number, x1: number, y1: number, lineWidth = 1, strokeStyle: string = "#000000"): void
    {
        this.drawLineV(new Vec2(x0, y0), new Vec2(x1, y1), lineWidth, strokeStyle);
    }

    drawLineV(v0: Vec2, v1: Vec2, lineWidth: number = 1, strokeStyle: string = "#000000"): void
    {
        let vpcm = this.vpc.mulMatrix(this.modelTransform);

        let tv0 = vpcm.mulVector2(v0, 1);
        let tv1 = vpcm.mulVector2(v1, 1);

        this.gfx.lineWidth = lineWidth;
        this.gfx.strokeStyle = strokeStyle;
        this.gfx.beginPath();
        this.gfx.moveTo(tv0.x, Settings.height - tv0.y);
        this.gfx.lineTo(tv1.x, Settings.height - tv1.y);
        this.gfx.stroke();
    }

    drawText(x: number, y: number, content: any, fontSize = 20): void
    {
        this.gfx.font = fontSize + "px verdana";
        this.gfx.fillText(content, x, y);
    }

    // Draw vector from point p toward direction v
    drawVector(p: Vec2, v: Vec2, arrowSize: number = 0.03): void
    {
        this.drawLine(p.x, p.y, p.x + v.x, p.y + v.y);
        let n = new Vec2(-v.y, v.x).normalize().multiply(3 * arrowSize);
        const nv = v.normalize();
        arrowSize *= 4;

        this.drawLine(p.x + v.x + n.x - nv.x * arrowSize, p.y + v.y + n.y - nv.y * arrowSize, p.x + v.x, p.y + v.y);
        this.drawLine(p.x + v.x - n.x - nv.x * arrowSize, p.y + v.y - n.y - nv.y * arrowSize, p.x + v.x, p.y + v.y);
    }

    // Draw p1 to p2 vector
    drawVectorP(p1: Vec2, p2: Vec2, arrowSize: number = 0.03): void
    {
        this.drawVector(p1, p2.subtract(p1), arrowSize);
    }

    drawSimplex(sp: Simplex): void
    {
        switch (sp.count)
        {
            case 1:
                this.drawCircleV(sp.vertices[0], 0.1, false);
                break;
            case 2:
                this.drawLineV(sp.vertices[0], sp.vertices[1]);
                break;
            case 3:
                this.drawLineV(sp.vertices[0], sp.vertices[1]);
                this.drawLineV(sp.vertices[1], sp.vertices[2]);
                this.drawLineV(sp.vertices[2], sp.vertices[0]);
                break;
            default:
                break;
        }
    }

    drawBody(b: RigidBody, drawCenterOfMass: boolean = false, lineWidth: number = 1, outlined = true, filled = false,
        outLineColor = "#ffffff", fillColor: string = "#000000"): void
    {
        this.setModelTransform(b.localToGlobal);

        Util.assert(outlined || filled);

        let center = new Vec2(0, 0)

        //this.gfx.strokeStyle = outLineColor;
        //this.gfx.fillStyle = fillColor;
        //this.gfx.lineWidth = lineWidth;

        if (b instanceof Polygon)
        {
            rapid.matrixStack.save()
            // MUST MATCH localToGlobal: translate (incl. pivot compensation) -> rotate -> scale
            rapid.matrixStack.translate(b.position.x + b.pivotCompensation.x, b.position.y + b.pivotCompensation.y)
            rapid.matrixStack.rotate(b.rotationRad)
            rapid.matrixStack.scale(b.scale.x, b.scale.y)
            rapid.drawGraphic({
                points: b.vertices,
                color: Color.fromHex(fillColor),
                drawMode: rapid.gl.TRIANGLE_FAN,
            });
            rapid.matrixStack.restore()

            /*this.gfx.beginPath();
            for (let i = 0; i < b.count; i++)
            {
                let curr = b.vertices[i];
                let next = b.vertices[(i + 1) % b.count];

                let vpcm = this.vpc.mulMatrix(this.modelTransform);

                let tv0 = vpcm.mulVector2(curr, 1);
                let tv1 = vpcm.mulVector2(next, 1);


                if (i == 0)
                    this.gfx.moveTo(tv0.x, Settings.height - tv0.y);
                this.gfx.lineTo(tv1.x, Settings.height - tv1.y);
            }
            this.gfx.closePath();

            if (outlined) this.gfx.stroke();
            if (filled) this.gfx.fill();*/
        }
        else if (b instanceof Circle)
        {
            rapid.matrixStack.save()
            // MUST MATCH localToGlobal: translate (incl. pivot compensation) -> rotate -> scale
            rapid.matrixStack.translate(b.position.x + b.pivotCompensation.x, b.position.y + b.pivotCompensation.y)
            rapid.matrixStack.rotate(b.rotationRad)
            rapid.matrixStack.scale(b.scale.x, b.scale.y)
            rapid.drawCircle({
                radius: b.radius,
                color: Color.fromHex(fillColor),
                segments: 32,
                position: center,
            });
            //rapid.renderCircle({ position: center, radius: b.radius, segments: 32, color: Color.fromHex(fillColor) });
            rapid.matrixStack.restore()

            /*this.gfx.lineWidth = 1;
            this.gfx.beginPath();
            this.gfx.arc(tv.x, Settings.height - tv.y, tr, 0, 2 * Math.PI);
            this.gfx.closePath();

            if (outlined) this.gfx.stroke();
            if (filled) this.gfx.fill();

            this.drawLineV(center, new Vec2(b.radius, 0));*/
        }
        else
        {
            throw "Not a supported shape";
        }

        //this.gfx.strokeStyle = "#000000";
        //this.gfx.fillStyle = "#000000";

        if (drawCenterOfMass)
        {
            var centerVec2 = new Vec2(center.x, center.y);
            // rapid.renderCircle({ position: centerVec2, radius: 0.01, segments: 8 });
            rapid.drawCircle({
                radius: 0.01,
                color: Color.fromHex(fillColor),
                segments: 8,
                position: centerVec2,
            });
            //this.drawCircleV(center, 0.01, true);
        }

        this.resetModelTransform();
    }

    drawAABB(aabb: AABB, lineWidth = 1, strokeStyle: string = "#000000")
    {
        this.drawLine(aabb.min.x, aabb.min.y, aabb.min.x, aabb.max.y, lineWidth, strokeStyle);
        this.drawLine(aabb.min.x, aabb.max.y, aabb.max.x, aabb.max.y, lineWidth, strokeStyle);
        this.drawLine(aabb.max.x, aabb.max.y, aabb.max.x, aabb.min.y, lineWidth, strokeStyle);
        this.drawLine(aabb.max.x, aabb.min.y, aabb.min.x, aabb.min.y, lineWidth, strokeStyle);
    }

    drawJoint(j: Joint)
    {
        if (j instanceof RevoluteJoint)
        {
            let anchorA = j.bodyA.localToGlobal.mulVector2(j.localAnchorA, 1);
            let anchorB = j.bodyB.localToGlobal.mulVector2(j.localAnchorB, 1);

            if (j.drawConnectionLine)
            {
                this.drawLineV(anchorA, j.bodyA.position);
                this.drawLineV(anchorB, j.bodyB.position);
            }
            if (j.drawAnchor)
            {
                this.drawCircleV(anchorA, 0.03);
            }
        }
        else if (j instanceof DistanceJoint)
        {
            let anchorA = j.bodyA.localToGlobal.mulVector2(j.localAnchorA, 1);
            let anchorB = j.bodyB.localToGlobal.mulVector2(j.localAnchorB, 1);

            if (j.drawConnectionLine)
            {
                this.drawLineV(anchorA, anchorB);
            }
            if (j.drawAnchor)
            {
                this.drawCircleV(anchorA, 0.03);
                this.drawCircleV(anchorB, 0.03);
            }
        } else if (j instanceof MaxDistanceJoint)
        {
            let anchorA = j.bodyA.localToGlobal.mulVector2(j.localAnchorA, 1);
            let anchorB = j.bodyB.localToGlobal.mulVector2(j.localAnchorB, 1);

            if (j.drawConnectionLine)
            {
                this.drawLineV(anchorA, anchorB);
            }
            if (j.drawAnchor)
            {
                this.drawCircleV(anchorA, 0.03);
                this.drawCircleV(anchorB, 0.03);
            }
        }
        else if (j instanceof GrabJoint)
        {
            let anchor = j.bodyA.localToGlobal.mulVector2(j.localAnchor, 1);

            if (j.drawConnectionLine)
            {
                this.drawLineV(anchor, j.target);
            }
            if (j.drawAnchor)
            {
                this.drawCircleV(anchor, 0.03);
                this.drawCircleV(j.target, 0.03);
            }
        }
        else if (j instanceof WeldJoint)
        {
            let anchor = j.bodyA.localToGlobal.mulVector2(j.localAnchorA, 1);

            if (j.drawConnectionLine)
            {
                this.drawLineV(j.bodyA.position, j.bodyB.position);
            }
            if (j.drawAnchor)
            {
                this.drawCircleV(anchor, 0.03);
            }
        } else if (j instanceof LineJoint)
        {
            let anchorA = j.bodyA.localToGlobal.mulVector2(j.localAnchorA, 1);
            let anchorB = j.bodyB.localToGlobal.mulVector2(j.localAnchorB, 1);

            if (j.drawConnectionLine)
            {
                this.drawLineV(anchorA, anchorB);
            }
            if (j.drawAnchor)
            {
                this.drawCircleV(anchorA, 0.03);
                this.drawCircleV(anchorB, 0.03);
            }
        }
        else if (j instanceof PrismaticJoint)
        {
            let anchorA = j.bodyA.localToGlobal.mulVector2(j.localAnchorA, 1);
            let anchorB = j.bodyB.localToGlobal.mulVector2(j.localAnchorB, 1);

            if (j.drawConnectionLine)
            {
                this.drawLineV(anchorA, anchorB);
            }
            if (j.drawAnchor)
            {
                this.drawCircleV(anchorA, 0.03);
                this.drawCircleV(anchorB, 0.03);
            }
        }
        else if (j instanceof MotorJoint)
        {
            let anchorA = j.bodyA.localToGlobal.mulVector2(j.localAnchorA, 1);
            let anchorB = j.bodyB.localToGlobal.mulVector2(j.localAnchorB, 1);

            if (j.drawConnectionLine)
            {
                this.drawLineV(anchorA, anchorB);
            }
            if (j.drawAnchor)
            {
                this.drawCircleV(anchorA.add(j.linearOffset), 0.03);
                this.drawCircleV(anchorB, 0.03);
            }
        }
    }
}
