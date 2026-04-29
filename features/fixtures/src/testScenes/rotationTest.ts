import { GameObject, Scene } from "bare-engine";

export class RotationTest extends Scene
{
    obj!: GameObject;
    fixedUpdates = 0;

    OnStart(): void
    {
        this.obj = this.AddGameObject();
    }

    override OnFixedUpdate(): void
    {
        this.fixedUpdates++;

        if (this.fixedUpdates == 1)
        {
            this.obj.rotation++;
            assert(this.obj.rotation == 1);
        }
    }
}
