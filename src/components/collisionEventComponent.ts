import { Component } from "../controllers/componentController";
import { GameMode } from "../globals";
import { GameObject } from "../objects/gameObject";
import type { Scene } from "../scenes/scene";
import { InspectorButton } from "../utils/decorators";
import { SerializeField } from "../utils/serializeFields";

export class CollisionEventComponent extends Component
{
    @SerializeField(GameMode.Edit) private object: string = ""; // LEAVE EMPTY TO TRIGGER ON COLLIDE WITH ANYTHING
    @SerializeField(GameMode.Edit) private event: string = ""; // THE EVENT THAT NEEDS TO FIRE ON TRIGGER
    @SerializeField(GameMode.Edit) private once: boolean = false; // IF TRUE, THE EVENT WILL ONLY FIRE ONCE (REMOVE ITSELF)
    @SerializeField(GameMode.Edit) private removeObject: boolean = false; // ONLY CHECKED WHEN once = TRUE

    constructor(scene: Scene)
    {
        super(scene);
    }

    OnCollisionStart(other: GameObject): void
    {
        if (this.object == "" || other.name == this.object)
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
                bare.component.RemoveComponent(this.go, this);
            }
        }
    }
}
