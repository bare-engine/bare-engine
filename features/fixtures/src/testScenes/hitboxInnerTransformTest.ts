import { Scene, Vec2 } from "bare-engine";
import { ArcadeObject, ArcadePhysicsController } from "bare-engine/arcade";
import { Checks } from "./checks";

// covers hitboxes ignoring the inner transform: a squash or wobble tween (innerScale, innerPosition,
// innerRotation) changes how an object looks, not where it collides or can be clicked

const near = (a: number, b: number, epsilon = 0.001) => Math.abs(a - b) < epsilon;
const show = (r: { x: number, y: number, width?: number, height?: number, radius?: number }) => JSON.stringify(r);

export class HitboxInnerTransformTest extends Scene
{
    checks = new Checks();

    constructor()
    {
        super({ basePrefabs: [{ name: "ANY", texture: "PIXEL" }], layers: ["objects"] });
    }

    override OnAwake(): void
    {
        bare.AddClass(ArcadePhysicsController);
    }

    override OnStart(): void
    {
        const c = this.checks;
        const physics = this.arcade as any;

        // rectangle hitbox: physics and pointer
        const box = this.AddGameObject<ArcadeObject>({ baseClass: "ArcadeObject", texture: "PIXEL", static: true } as any).SetPosition(100, 100);
        box.scale.set(40, 20);
        box.OnPointerDown(() => {});
        const physicsBefore = physics.getWorldHitboxRect(box);
        const pointerBefore = this.hitbox.GetRect(box.tapHitbox!);

        box.innerScale = new Vec2(2, 0.5);
        box.innerPosition.set(0.25, 0.25);
        box.innerRotation = 30;

        const physicsAfter = physics.getWorldHitboxRect(box);
        const pointerAfter = this.hitbox.GetRect(box.tapHitbox!);
        c.check(near(physicsAfter.x, physicsBefore.x) && near(physicsAfter.y, physicsBefore.y)
            && near(physicsAfter.width, physicsBefore.width) && near(physicsAfter.height, physicsBefore.height),
            `the inner transform should not change a physics hitbox: ${show(physicsBefore)} -> ${show(physicsAfter)}`);
        c.check(near(pointerAfter.x1, pointerBefore.x1) && near(pointerAfter.y1, pointerBefore.y1) && near(pointerAfter.width, pointerBefore.width) && near(pointerAfter.height, pointerBefore.height),
            `the inner transform should not change a pointer hitbox: ${JSON.stringify(pointerBefore)} -> ${JSON.stringify(pointerAfter)}`);

        // a flip still mirrors the hitbox around the pivot, inner transform or not
        const flipped = this.AddGameObject<ArcadeObject>({ baseClass: "ArcadeObject", texture: "PIXEL", static: true } as any).SetPosition(300, 100);
        flipped.scale.set(40, 20);
        flipped.flipped = true;
        const flippedRect = physics.getWorldHitboxRect(flipped);
        c.check(near(flippedRect.x, 260) && near(flippedRect.width, 40), "a flipped object's hitbox should be mirrored around its pivot: " + show(flippedRect));

        // circle hitbox on a child (the matrix path): physics and pointer
        const holder = this.AddGameObject().SetPosition(500, 100);
        const ball = holder.AddChild<ArcadeObject>({ baseClass: "ArcadeObject", texture: "PIXEL", hitboxType: "Circle", pivot: "CENTER", static: true } as any);
        ball.scale.set(20, 20);
        ball.OnPointerDown(() => {});
        const circleBefore = physics.getWorldCircle(ball);

        ball.innerScale = new Vec2(3, 3);
        ball.innerPosition.set(0.5, 0);

        const circleAfter = physics.getWorldCircle(ball);
        c.check(near(circleAfter.x, circleBefore.x) && near(circleAfter.y, circleBefore.y) && near(circleAfter.radius, circleBefore.radius),
            `the inner transform should not change a child's physics circle: ${show(circleBefore)} -> ${show(circleAfter)}`);
        c.check(nearCenter(ball.GetHitboxCenter(), circleBefore), "GetHitboxCenter should ignore the inner transform: " + show(ball.GetHitboxCenter()));

        c.flush();

        function nearCenter(v: Vec2, circle: { x: number, y: number }): boolean
        {
            return near(v.x, circle.x) && near(v.y, circle.y);
        }
    }
}
