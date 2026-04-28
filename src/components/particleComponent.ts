import { BaseComponent } from "../controllers/componentController";
import { particleController } from "../controllers/particleController";
import { assetsHandler } from "../handlers/assetsHandler";
import { Color, IParticleOptions, ParticleEmitter, ParticleShape, Vec2 } from "../libraries/rapid-render";
import { GameObject } from "../objects/gameObject";
import type { Scene } from "../scenes/scene";
import { InspectorButton } from "../utils/decorators";

export class ParticleComponent extends BaseComponent
{
    public emitter: ParticleEmitter;
    private positionData: any;

    constructor(scene: Scene,
        position: any,
        life: number,
        texture: string,
        origin: any,
        emitRate: number,
        localSpace: boolean,
        emitShape: string,
        emitRadius: number,
        animation: any
    )
    {
        super(scene);

        this.positionData = position;

        var tex = assetsHandler.GetTexture(texture);

        // WANT TO SEE THESE IN COMPONENT IN PLUGIN ACTUALLY - TODO
        var options: IParticleOptions = {
            position: new Vec2(position.x, position.y),
            life: life,
            texture: tex,
            origin: origin ? new Vec2(origin.x, origin.y) : undefined,
            emitRate: emitRate,
            localSpace: localSpace,
            emitShape: ParticleShape[emitShape as keyof typeof ParticleShape] ?? ParticleShape.POINT,
            emitRadius: emitRadius,
            animation: {
                scale: animation?.scale ? {
                    start: animation.scale.start,
                    end: animation.scale.end,
                } : undefined,
                rotation: animation?.rotation ? {
                    start: animation.rotation.start,
                    end: animation.rotation.end,
                } : undefined,
                color: animation?.color ? {
                    start: animation.color.start ? Color.fromHex(animation.color.start) : undefined,
                    end: animation.color.end ? Color.fromHex(animation.color.end) : undefined,
                } : undefined,
                speed: animation?.speed ? {
                    start: animation.speed.start,
                    end: animation.speed.end,
                } : undefined,
                velocity: animation?.velocity ? {
                    start: animation.velocity.start ? new Vec2(animation.velocity.start.x, animation.velocity.start.y) : undefined,
                    end: animation.velocity.end ? new Vec2(animation.velocity.end.x, animation.velocity.end.y) : undefined,
                } : undefined,
                acceleration: animation?.acceleration ? {
                    start: animation.acceleration.start ? new Vec2(animation.acceleration.start.x, animation.acceleration.start.y) : undefined,
                    end: animation.acceleration.end ? new Vec2(animation.acceleration.end.x, animation.acceleration.end.y) : undefined,
                } : undefined,
            }
        };

        this.emitter = new ParticleEmitter(options);

        if (!tex)
        {
            (async () =>
            {
                tex = await assetsHandler.GetTexturePromise(texture);
                this.emitter.SetTexture(tex);
            })();
        }
    }

    Added(go: GameObject): void
    {
        super.Added(go);

        this.emitter.gameObject = go;

        this.emitter.position.set(go.x + this.positionData.x, go.y + this.positionData.y);
        particleController.Add(this.emitter);
    }

    @InspectorButton
    Fire()
    {
        this.emitter.oneShot();
    }

    OnUpdate(deltaTime: number): void
    {
        this.emitter.position.set(this.go.x + this.positionData.x, this.go.y + this.positionData.y);
    }

    OnRemoved()
    {
        this.emitter.stop();
        particleController.Remove(this.emitter);
    }
}
