import { GameObject, Scene } from "bare-engine";

export class BasicsTest extends Scene
{
    cog!: GameObject;

    OnStart(): void
    {
        this.cog = this.AddGameObject({ name: "cog", texture: "NONE" })
            .SetPosition(bareEngine.width * 0.5, bareEngine.height * 0.5)
            .CenterPivot();

        assert(this.cog.x === bareEngine.width * 0.5, "basic object should be centered on x");
        assert(this.cog.y === bareEngine.height * 0.5, "basic object should be centered on y");
    }

    OnUpdate(): void
    {
        this.cog.rotation++;
        assert(this.cog.rotation === 1, "basic object should rotate during update");
    }
}
