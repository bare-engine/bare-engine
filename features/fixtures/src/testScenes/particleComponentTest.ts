import { ParticleComponent, ParticleController, Scene } from "bare-engine";
import { Checks } from "./checks";

// covers ParticleComponent: every setting a prefab gives it reaches the emitter, like with bare.particle.CreateEmitter

// one value for every plain-data setting CreateEmitter reads (shader is a GL object, so it can't live in a prefab)
const SETTINGS = {
    position: { x: 3, y: 4 },
    life: 0.7,
    texture: "PIXEL",
    origin: { x: 0.5, y: 0.5 },
    emitRate: 6,
    emitTime: 0.5,
    localSpace: true,
    emitShape: "RECT",
    emitRadius: 9,
    emitRect: { width: 10, height: 20 },
    maxParticles: 5,
    scale: 2,
    animation: { scale: { start: 1, end: 0 } },
};

export class ParticleComponentTest extends Scene
{
    checks = new Checks();

    constructor()
    {
        super({
            basePrefabs: [{ name: "ANY", texture: "PIXEL" }],
            prefabs: [{ name: "sparkler", components: { particle: SETTINGS } } as any],
            layers: ["objects"],
        });
    }

    override OnAwake(): void
    {
        bare.AddClass(ParticleComponent);
    }

    override OnStart(): void
    {
        const c = this.checks;

        // capture what the component hands to CreateEmitter
        let passed: Record<string, any> = {};
        const createEmitter = this.particle.CreateEmitter.bind(this.particle);
        this.particle.CreateEmitter = (data, options) => {
            passed = data;
            return createEmitter(data, options);
        };

        const sparkler = this.AddGameObject("sparkler");
        const emitter = sparkler.GetComponent(ParticleComponent)!.emitter;
        this.particle.CreateEmitter = createEmitter;

        for (const [key, value] of Object.entries(SETTINGS))
            c.check(JSON.stringify(passed[key]) === JSON.stringify(value), `ParticleComponent should pass ${key} to CreateEmitter: ${JSON.stringify(passed[key])}`);

        const options = (emitter as any).options;
        c.check(options.maxParticles === 5, "maxParticles should reach the emitter: " + options.maxParticles);
        c.check(options.emitTime === 0.5, "emitTime should reach the emitter: " + options.emitTime);
        c.check(options.emitRect?.width === 10 && options.emitRect?.height === 20, "emitRect should reach the emitter: " + JSON.stringify(options.emitRect));
        c.check(ParticleController.GetTransform(emitter).scale === 2, "scale should reach the emitter: " + ParticleController.GetTransform(emitter).scale);

        // 0 maxParticles means no limit
        const unlimited = this.AddGameObject({ components: { particle: { texture: "PIXEL" } } });
        c.check((unlimited.GetComponent(ParticleComponent)!.emitter as any).options.maxParticles === undefined, "maxParticles 0 should mean no limit");

        c.flush();
    }
}
