import { GameObject, Scene, Vec2 } from "bare-engine";

export class BasicsTest extends Scene
{
    cog!: GameObject;
    checkedRotation = false;

    OnStart(): void
    {
        this.cog = this.AddGameObject({ name: "cog", texture: "NONE" })
            .SetPosition(bare.width * 0.5, bare.height * 0.5)
            .CenterPivot();

        assert(this.cog.x === bare.width * 0.5, "basic object should be centered on x");
        assert(this.cog.y === bare.height * 0.5, "basic object should be centered on y");

        const parent = this.AddGameObject();
        const child = parent.AddChild().SetPosition(100, 0);
        parent.innerPosition.set(12, -7);
        parent.innerScale = new Vec2(1.25, 0.75);
        parent.innerRotation = 268;
        parent.flipped = true;

        const outerFlippedChildPosition = child.ToGlobal(new Vec2(), false);
        const outerFlippedTexturePoint = parent.ToGlobal(new Vec2(100, 0), true);
        const epsilon = 0.0001;

        assert(
            Math.abs(outerFlippedChildPosition.x - outerFlippedTexturePoint.x) < epsilon
                && Math.abs(outerFlippedChildPosition.y - outerFlippedTexturePoint.y) < epsilon,
            "an inherited inner transform should keep the child aligned with the texture",
        );

        parent.flipped = false;
        parent.innerFlipped = true;

        const innerFlippedChildPosition = child.ToGlobal(new Vec2(), false);

        assert(
            Math.abs(outerFlippedChildPosition.x - innerFlippedChildPosition.x) < epsilon,
            "outer and inner flipping should place an inner-rotated child at the same x",
        );
        assert(
            Math.abs(outerFlippedChildPosition.y - innerFlippedChildPosition.y) < epsilon,
            "outer and inner flipping should place an inner-rotated child at the same y",
        );
    }

    OnUpdate(): void
    {
        this.cog.rotation++;
        // only the first update: later ones would fail it, racing the runner's check
        if (!this.checkedRotation)
            assert(this.cog.rotation === 1, "basic object should rotate during update");
        this.checkedRotation = true;
    }
}
