import { BaseComponent, GameObject, componentController } from "../exports";
import { Scene } from "../main";
import { InspectorButton } from "../utils/decorators";

export class CollisionEventComponent extends BaseComponent
{
    private object: string;
    private event: string;
    private once: boolean;
    private removeObject: boolean; // ONLY CHECKED WHEN once = TRUE

    constructor(scene: Scene, object: string, event: string, once: boolean = false, removeObject: boolean = false)
    {
        super(scene);

        this.object = object;
        this.event = event;
        this.once = once;
        this.removeObject = removeObject;
    }

    OnCollisionStart(other: GameObject): void
    {
        this.Fire(other);
    }

    @InspectorButton
    Fire(collidingObject: GameObject = null): void
    {
        bareEngine.SendEvent(this.event, { collidingObject: collidingObject, trigger: this });

        if (this.once)
        {
            if (this.removeObject)
            {
                this.go.Remove();
            }
            else
            {
                componentController.RemoveComponent(this.go, this);
            }
        }
    }
}
