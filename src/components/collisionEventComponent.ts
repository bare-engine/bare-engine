import { BaseComponent, componentController } from "../controllers/componentController";
import { GameObject } from "../objects/gameObject";
import type { Scene } from "../scenes/scene";
import { InspectorButton, Save } from "../utils/decorators";

export class CollisionEventComponent extends BaseComponent
{
    @Save private object: string = ""; // LEAVE EMPTY TO TRIGGER ON COLLIDE WITH ANYTHING
    @Save private event: string = ""; // THE EVENT THAT NEEDS TO FIRE ON TRIGGER
    @Save private once: boolean = false; // IF TRUE, THE EVENT WILL ONLY FIRE ONCE (REMOVE ITSELF)
    @Save private removeObject: boolean = false; // ONLY CHECKED WHEN once = TRUE

    constructor(scene: Scene)
    {
        super(scene);
    }

    OnCollisionStart(other: GameObject): void
    {
        if (this.object != "" && other.name == this.object)
            this.Fire(other);
    }

    @InspectorButton
    Fire(collidingObject: GameObject = null): void
    {
        bare.SendEvent(this.event, { collidingObject: collidingObject, trigger: this });

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
