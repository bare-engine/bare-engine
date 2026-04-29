import { Scene } from "bare-engine";

export class EntityTest extends Scene
{
    OnStart(): void
    {
        var obj = this.AddGameObject({ rotation: 1 });
        assert(obj.rotation == 1, "Object's rotation should be 1");
    }
}
