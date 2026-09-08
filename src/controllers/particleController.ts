import { ParticleEmitter } from "../libraries/new-rapid-render/particle";
import { Color, IParticleAnimation, IParticleOptions, ParticleShape, Texture, Vec2 } from "../libraries/new-rapid-render";
import { assetsHandler } from "../handlers/assetsHandler";
import { Scene } from "../scenes/scene";
import { RegisterController } from "../globals";
import { InspectorField } from "../utils/decorators";
type ParticleEmitterEntry = {
    emitter: ParticleEmitter;
    autoRemove: boolean;
    update: boolean;
    render: boolean;
    hasActivated: boolean;
};

export type ParticleEmitterOptions = {
    autoRemove?: boolean;
    update?: boolean;
    render?: boolean;
    autoStart?: boolean;
    autoOneShot?: boolean;
};

export type ParticleOneShotOptions = {
    position?: Vec2;
};

// PLAIN DATA AS IT COMES OUT OF settingsData.json / AN @InspectorField COMPONENT:
// TEXTURE AND COLORS AS STRINGS, VECTORS AS { x, y } OBJECTS, EMIT SHAPE AS "CIRCLE"
export type ParticleData = Record<string, any>;

export class ParticleController
{
    private emitters: ParticleEmitterEntry[] = [];

    // EMITTERS WHOSE TEXTURE IS STILL LOADING - THEY MUST NOT RENDER YET, DRAWING WITHOUT A
    // TEXTURE THROWS. STATIC SO IT ALSO HOLDS FOR EMITTERS USED OUTSIDE THEIR OWN SCENE.
    private static awaitingTexture: WeakSet<ParticleEmitter> = new WeakSet();

    public scene: Scene;

    @InspectorField
    private get emittersNum():int { return this.emitters.length; }

    @InspectorField
    private get activeEmittersNum():int { return this.emitters.filter(entry => entry.hasActivated).length; }

    @InspectorField
    private get particlesNum():int { return this.emitters.reduce((total, entry) => total + entry.emitter.count, 0); }

    constructor(scene: Scene)
    {
        this.scene = scene;
    }

    Add(emitter: ParticleEmitter, options: ParticleEmitterOptions = {})
    {
        if (this.Has(emitter))
        {
            return emitter;
        }

        this.emitters.push({
            emitter,
            autoRemove: options.autoRemove ?? false,
            update: options.update ?? true,
            render: options.render ?? true,
            hasActivated: false
        });

        if (options.autoOneShot)
        {
            emitter.oneShot();
        }
        else if (options.autoStart)
        {
            emitter.start();
        }

        return emitter;
    }

    Remove(emitter: ParticleEmitter)
    {
        const index = this.emitters.findIndex(entry => entry.emitter === emitter);
        if (index !== -1)
        {
            this.emitters.splice(index, 1);
        }
    }

    Has(emitter: ParticleEmitter): boolean
    {
        return this.emitters.some(entry => entry.emitter === emitter);
    }

    Update(deltaTime: number): void
    {
        for (let i = this.emitters.length - 1; i >= 0; i--)
        {
            const entry = this.emitters[i];
            if (entry.update)
            {
                entry.emitter.update(deltaTime);
            }

            if (entry.emitter.isActive())
            {
                entry.hasActivated = true;
            }

            if (entry.autoRemove && entry.hasActivated && !entry.emitter.isActive())
            {
                this.emitters.splice(i, 1);
            }
        }
    }

    Render(): void
    {
        for (const entry of this.emitters)
        {
            if (entry.render && ParticleController.IsReady(entry.emitter))
            {
                entry.emitter.render();
            }
        }
    }

    // FALSE WHILE AN EMITTER MADE BY CreateEmitter IS STILL WAITING FOR ITS TEXTURE - RENDERING
    // IT BEFORE THAT THROWS, SINCE THE DRAW CALL READS THE TEXTURE'S UVS
    static IsReady(emitter: ParticleEmitter): boolean
    {
        return !ParticleController.awaitingTexture.has(emitter);
    }

    // CONVERTS PLAIN PARTICLE DATA (JSON PRESET OR COMPONENT FIELDS) INTO IParticleOptions:
    // LOOKS UP THE TEXTURE BY NAME, TURNS { x, y } INTO Vec2, HEX STRINGS INTO Color AND
    // THE EMIT SHAPE NAME INTO ParticleShape. PASS texture TO OVERRIDE THE NAME LOOKUP.
    ToOptions(data: ParticleData, texture?: Texture): IParticleOptions
    {
        const animation: ParticleData = data.animation ?? {};

        return {
            position: ParticleController.ToVec2(data.position) ?? new Vec2(0, 0),
            life: data.life ?? 1,
            texture: texture ?? (typeof data.texture === "string" ? assetsHandler.GetTexture(data.texture) : data.texture),
            shader: data.shader,
            origin: ParticleController.ToVec2(data.origin),
            emitRate: data.emitRate,
            emitTime: data.emitTime,
            localSpace: data.localSpace,
            emitShape: ParticleController.ToEmitShape(data.emitShape),
            emitRadius: data.emitRadius,
            emitRect: data.emitRect,
            maxParticles: data.maxParticles,
            animation: {
                // NUMBERS AND [min, max] RANGES NEED NO CONVERSION
                scale: animation.scale,
                rotation: animation.rotation,
                speed: animation.speed,
                color: ParticleController.ToAttribute<Color>(animation.color, ParticleController.ToColor),
                velocity: ParticleController.ToAttribute<Vec2>(animation.velocity, ParticleController.ToVec2),
            } as IParticleAnimation
        };
    }

    // BUILDS AN EMITTER FROM PLAIN PARTICLE DATA. THE TEXTURE IS LOADED IF IT ISN'T CACHED
    // YET AND SET ON THE EMITTER WHEN IT ARRIVES - THE EMITTER RENDERS NOTHING UNTIL THEN.
    CreateEmitter(data: ParticleData, options?: ParticleEmitterOptions): ParticleEmitter
    {
        const particleOptions = this.ToOptions(data);
        const emitter = new ParticleEmitter(rapid, particleOptions);

        if (!particleOptions.texture && typeof data.texture === "string" && data.texture)
        {
            ParticleController.awaitingTexture.add(emitter);

            assetsHandler.LoadTexture(data.texture).then(texture =>
            {
                emitter.setTexture(texture);
                ParticleController.awaitingTexture.delete(emitter);
            });
        }

        if (options)
            this.Add(emitter, options);

        return emitter;
    }

    private static ToVec2(value: any): Vec2 | undefined
    {
        if (!value) return undefined;
        if (value instanceof Vec2) return value;
        return new Vec2(value.x ?? 0, value.y ?? 0);
    }

    private static ToColor(value: any): Color | undefined
    {
        if (!value) return undefined;
        if (value instanceof Color) return value;
        if (typeof value === "string") return Color.fromHex(value);
        return value;
    }

    private static ToEmitShape(value: any): ParticleShape | undefined
    {
        if (!value) return undefined;
        // ACCEPTS BOTH THE ENUM KEY ("CIRCLE", AS WRITTEN IN JSON) AND ITS VALUE ("circle")
        return ParticleShape[value as keyof typeof ParticleShape] ?? value as ParticleShape;
    }

    // AN ANIMATED ATTRIBUTE IS EITHER A BARE VALUE OR { start, end, delta }, AND EACH OF
    // THOSE CAN BE A [from, to] RANGE - convert IS APPLIED TO EVERY VALUE IN THERE.
    private static ToAttribute<T>(value: any, convert: (value: any) => T | undefined): any
    {
        if (!value) return undefined;

        const convertValue = (v: any) => Array.isArray(v) ? v.map(convert) : convert(v);

        if (typeof value === "object" && !Array.isArray(value) && ("start" in value || "end" in value || "delta" in value || "damping" in value))
        {
            return {
                start: convertValue(value.start),
                end: convertValue(value.end),
                delta: convertValue(value.delta),
                damping: value.damping,
            };
        }

        return convertValue(value);
    }

    OneShot(emitter: ParticleEmitter, options: ParticleOneShotOptions = {})
    {
        if (options.position)
        {
            emitter.position.set(options.position.x, options.position.y);
        }

        // ALREADY MANAGED BY THIS CONTROLLER (EG ADDED ONCE AT STARTUP) - Add() WOULD IGNORE
        // THE autoOneShot AND NOTHING WOULD BE EMITTED, SO FIRE IT DIRECTLY
        if (this.Has(emitter))
        {
            emitter.oneShot();
            return;
        }

        this.Add(emitter, { autoRemove: true, autoOneShot: true });
    }

    Clear()
    {
        for (var i = this.emitters.length - 1; i >= 0; i--)
        {
            this.Remove(this.emitters[i].emitter);
        }
    }
}

RegisterController(ParticleController);
