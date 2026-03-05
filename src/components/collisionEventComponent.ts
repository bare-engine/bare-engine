import { BaseComponent, GameObject, componentController } from "../exports";
import { Scene } from "../main";

declare var bareEngine: any;

export class CollisionEventComponent extends BaseComponent
{
    private object: string;
    private event: string;
    private once: boolean;

    constructor(scene: Scene, object: string, event: string, once: boolean = false)
    {
        super(scene);

        this.object = object;
        this.event = event;
        this.once = once;
    }

    OnCollisionStart(other: GameObject, self: GameObject): void
    {
        if (other.name == this.object || self.name == this.object)
        {
            bareEngine.SendEvent(this.event);

            if (this.once)
            {
                componentController.RemoveComponent(this.go, this);
            }
        }
    }
}
