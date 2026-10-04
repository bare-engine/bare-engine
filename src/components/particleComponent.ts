import { Component } from "../controllers/componentController";
import { ParticleController } from "../controllers/particleController";
import { ParticleEmitter } from "../libraries/rapid-render";
import { GameObject } from "../objects/gameObject";
import type { Scene } from "../scenes/scene";
import { InspectorButton, InspectorField } from "../utils/decorators";

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
        // THE @InspectorField VALUES ARE PLAIN DATA (TEXTURE NAME, HEX COLORS, { x, y }
        // OBJECTS) - THE CONTROLLER TURNS THEM INTO IParticleOptions AND LOADS THE TEXTURE
        this.emitter = bare.particle.CreateEmitter({
            position: this.position,
            life: this.life,
            texture: this.texture,
            origin: this.origin,
            emitRate: this.emitRate,
            localSpace: this.localSpace,
            emitShape: this.emitShape,
            emitRadius: this.emitRadius,
            animation: this.animation,
        });
    }

    OnAdded(go: GameObject): void
    {
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
        // NOTHING TO DRAW WHILE THE TEXTURE IS STILL LOADING
        if (!ParticleController.IsReady(this.emitter))
            return;

        this.emitter.render();
    }

    OnRemoved()
    {
        this.emitter.stop();
        bare.particle.Remove(this.emitter);
    }
}
