import { Scene } from "bare-engine";
import { ArcadeObject } from "bare-engine/arcade";

export class BarePhysicsTest extends Scene
{
    constructor()
    {
        super({
            baseEntities: {
                ANY: {
                    hitbox: "FULL",
                    drag: 0.01,
                    restitution: 0.8,
                    texture: "NONE",
                },
            },
            entities: {
                ball: {
                    hitboxType: "circle",
                },
                block: {
                    static: true,
                },
            },
            layers: ["objects"],
            layersInfo: {
                objects: {
                    hasPhysics: true,
                },
            },
        });
    }

    OnStart(): void
    {
        const block = this.AddGameObject("block") as ArcadeObject;
        const ball = this.AddGameObject("ball") as ArcadeObject;

        ball.SetVelocityXY(546, 546);

        assert(block instanceof ArcadeObject, "physics entity should instantiate as ArcadeObject");
        assert(ball.velocity.x === 546 && ball.velocity.y === 546, "bare physics object velocity should be settable");
        assert(ball.restitution === 0.8, "physics properties should be inherited from entity data");
    }
}
