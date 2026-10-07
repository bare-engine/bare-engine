import { Component } from "../controllers/componentController";
import { GameMode } from "../globals";
import { ParticleController } from "../controllers/particleController";
import { ParticleEmitter } from "../libraries/rapid-render";
import { GameObject } from "../objects/gameObject";
import type { Scene } from "../scenes/scene";
import { InspectorButton } from "../utils/decorators";
import { SerializeField } from "../utils/serializeFields";

export class ParticleComponent extends Component
{
    public emitter!: ParticleEmitter;
    
    @SerializeField(GameMode.Edit)
    private position: any = {x: 0, y: 0};

    @SerializeField(GameMode.Edit)
    private life: number = 1;

    @SerializeField(GameMode.Edit)
    private texture: string = "";

    @SerializeField(GameMode.Edit)
    private origin: any;

    @SerializeField(GameMode.Edit)
    private emitRate: number = 0;

    @SerializeField(GameMode.Edit)
    private localSpace: boolean = false;

    @SerializeField(GameMode.Edit)
    private emitShape: string = "POINT";

    @SerializeField(GameMode.Edit)
    private emitRadius: number = 0;

    @SerializeField(GameMode.Edit)
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

    override OnAdded(go: GameObject): void
    {
        this.initEmitter();
        this.followGameObject(go);
    }

    private followGameObject(go: GameObject): void
    {
        ParticleController.SetPosition(this.emitter, go.x + this.position.x, go.y + this.position.y);
    }

    @InspectorButton
    Fire()
    {
        ParticleController.Emit(this.emitter);
    }

    override OnUpdate(deltaTime: number): void
    {
        this.followGameObject(this.go);
        ParticleController.UpdateEmitter(this.emitter, deltaTime);
    }

    override OnPostRender(): void
    {
        // NOTHING TO DRAW WHILE THE TEXTURE IS STILL LOADING
        if (!ParticleController.IsReady(this.emitter))
            return;

        ParticleController.RenderEmitter(this.emitter);
    }

    override OnRemoved()
    {
        this.emitter.stop();
        bare.particle.Remove(this.emitter);
    }
}
