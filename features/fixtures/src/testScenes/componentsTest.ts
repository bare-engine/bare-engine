import { Component, Scene, TweenTo, componentController } from "bare-engine";

class WaveComponent extends Component
{
    scene: Scene;
    countDown = 0;

    constructor(scene: Scene, public frequency = 1)
    {
        super(scene);
        this.scene = scene;
    }

    OnUpdate(deltaTime: number): void
    {
        this.countDown -= deltaTime;

        if (this.countDown <= 0)
        {
            this.go.rotation = 0;
            TweenTo(this.go, 0.05, { rotation: 45, yoyo: true, repeat: 1 });
            this.countDown += this.frequency;
        }
    }
}

export class ComponentsTest extends Scene
{
    constructor()
    {
        super({
            baseEntities: {
                ANY: {
                    texture: "NONE",
                },
            },
            entities: {
                wavingHand: {
                    components: {
                        wave: { frequency: 1 },
                    },
                },
            },
            layers: ["objects"],
        });
    }

    OnAwake(): void
    {
        bare.AddClass(WaveComponent);
    }

    OnStart(): void
    {
        const slow = this.AddGameObject("wavingHand");
        const fast = this.AddGameObject("wavingHand");
        const fastWave = componentController.Get(fast, WaveComponent)!;

        fastWave.frequency = 2;

        assert(componentController.Get(slow, WaveComponent)?.frequency === 1, "entity data should add a component with constructor args");
        assert(fastWave.frequency === 2, "component properties should be mutable at runtime");
    }
}
