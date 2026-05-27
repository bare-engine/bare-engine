import { Scene, TweenTo } from "bare-engine";

export class TweensTest extends Scene
{
    completed = false;
    deadline = 0;

    OnStart(): void
    {
        this.deadline = bare.time + 1000;
        const heart = this.AddGameObject({ name: "heart", texture: "NONE" }).CenterPivot();

        TweenTo(heart, 0.02, {
            scale: 2,
            rotation: 45,
            onComplete: () => {
                this.completed = true;
                assert(heart.scale.x === 2 && heart.scale.y === 2, "TweenTo should tween scalar scale into both axes");
                assert(heart.rotation === 45, "TweenTo should tween rotation");
            },
        });
    }

    OnUpdate(): void
    {
        if (!this.completed && bare.time > this.deadline)
        {
            assert(false, "TweenTo did not complete");
        }
    }
}
