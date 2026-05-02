import { BaseComponent, componentController } from "../controllers/componentController";
import { GameObject } from "../objects/gameObject";
import type { Scene } from "../scenes/scene";
import { InspectorButton, Save } from "../utils/decorators";

export class CollisionEventComponent extends BaseComponent
{
    @Save
    private object: string = "";

    @Save
    private event: string = "";

    @Save
    private once: boolean = false;

    @Save
    private removeObject: boolean = false; // ONLY CHECKED WHEN once = TRUE

    constructor(scene: Scene)
    {
        super(scene);
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
