import { Component } from "../controllers/componentController";
import { assetsHandler } from "../handlers/assetsHandler";
import { Color, IParticleOptions, ParticleEmitter, ParticleShape, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import type { Scene } from "../scenes/scene";
import { InspectorButton, InspectorField, Save } from "../utils/decorators";

export class ParticleComponent extends Component
{
    public emitter: ParticleEmitter;
    
    @InspectorField
    private position: any = {x: 0, y: 0};

    @InspectorField
    private life: number = 1;

    @InspectorField
    private texture: string = "";

    @InspectorField
    private origin: any;

    @InspectorField
    private emitRate: number = 0;

    @InspectorField
    private localSpace: boolean = false;

    @InspectorField
    private emitShape: string = "POINT";

    @InspectorField
    private emitRadius: number = 0;

    @InspectorField
    private animation: Record<string, any> = {};
    
    constructor(scene: Scene)
    {
        super(scene);
    }

    private initEmitter(): void
    {
        var tex = assetsHandler.GetTexture(this.texture);

        // WANT TO SEE THESE IN COMPONENT IN PLUGIN ACTUALLY - TODO
        var options: IParticleOptions = {
            position: new Vec2(this.position.x, this.position.y),
            life: this.life,
            texture: tex,
            origin: this.origin ? new Vec2(this.origin.x, this.origin.y) : undefined,
            emitRate: this.emitRate,
            localSpace: this.localSpace,
            emitShape: ParticleShape[this.emitShape as keyof typeof ParticleShape] ?? ParticleShape.POINT,
            emitRadius: this.emitRadius,
            animation: {
                scale: this.animation?.scale ? {
                    start: this.animation.scale.start,
                    end: this.animation.scale.end,
                } : undefined,
                rotation: this.animation?.rotation ? {
                    start: this.animation.rotation.start,
                    end: this.animation.rotation.end,
                } : undefined,
                color: this.animation?.color ? {
                    start: this.animation.color.start ? Color.fromHex(this.animation.color.start) : undefined,
                    end: this.animation.color.end ? Color.fromHex(this.animation.color.end) : undefined,
                } : undefined,
                speed: this.animation?.speed ? {
                    start: this.animation.speed.start,
                    end: this.animation.speed.end,
                } : undefined,
                velocity: this.animation?.velocity ? {
                    start: this.animation.velocity.start ? new Vec2(this.animation.velocity.start.x, this.animation.velocity.start.y) : undefined,
                    end: this.animation.velocity.end ? new Vec2(this.animation.velocity.end.x, this.animation.velocity.end.y) : undefined,
                } : undefined,
                acceleration: this.animation?.acceleration ? {
                    start: this.animation.acceleration.start ? new Vec2(this.animation.acceleration.start.x, this.animation.acceleration.start.y) : undefined,
                    end: this.animation.acceleration.end ? new Vec2(this.animation.acceleration.end.x, this.animation.acceleration.end.y) : undefined,
                } : undefined,
            }
        };

        this.emitter = new ParticleEmitter(rapid, options);

        if (!tex)
        {
            (async () =>
            {
                tex = await assetsHandler.LoadTexture(this.texture);
                this.emitter.setTexture(tex);
            })();
        }
    }

    Added(go: GameObject): void
    {
        super.Added(go);

        this.initEmitter();
        this.emitter.position.set(go.x + this.position.x, go.y + this.position.y);
    }

    @InspectorButton
    Fire()
    {
        this.emitter.oneShot();
    }

    OnUpdate(deltaTime: number): void
    {
        this.emitter.position.set(this.go.x + this.position.x, this.go.y + this.position.y);
        this.emitter.update(deltaTime);
    }

    OnPostRender(): void
    {
        this.emitter.render();
    }

    OnRemoved()
    {
        this.emitter.stop();
        bare.particle.Remove(this.emitter);
    }
}
