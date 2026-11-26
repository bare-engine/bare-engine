import { Color, CustomGlShader, IParticleAnimation, IParticleOptions, ParticleEmitter, ParticleShape, Texture, Vec2 } from "../libraries/rapid-render";
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
    count?: number;
};

// PLAIN DATA AS IT COMES OUT OF settingsData.json / AN @InspectorField COMPONENT:
// TEXTURE AND COLORS AS STRINGS, VECTORS AS { x, y } OBJECTS, EMIT SHAPE AS "CIRCLE"
// the engine classes (Texture, Color, Vec2, ParticleShape) are accepted too
export type ParticleVec2Data = Vec2 | { x: number; y: number };
export type ParticleColorData = Color | string;

// a fixed value or a [min, max] range to pick from at random
export type ParticleRange<T> = T | [T, T];

// a value that changes over a particle's life: a bare value, or start + end (or start + delta, the
// change per second), each of which can be a range
export type ParticleAttributeValue<T> = ParticleRange<T> | {
    start?: ParticleRange<T>;
    end?: ParticleRange<T>;
    delta?: ParticleRange<T>;
    damping?: number;
};

export type ParticleAnimationData = {
    scale?: ParticleAttributeValue<number>;
    rotation?: ParticleAttributeValue<number>;
    speed?: ParticleAttributeValue<number>;
    color?: ParticleAttributeValue<ParticleColorData>;
    velocity?: ParticleAttributeValue<ParticleVec2Data>;
};

export type ParticleData = {
    texture?: string | Texture;
    shader?: CustomGlShader;
    life?: ParticleRange<number>;
    // where the emitter sits; move it later with emitter.position
    position?: ParticleVec2Data;
    // scales the whole effect around position
    scale?: number;
    origin?: ParticleVec2Data;
    emitRate?: number;
    emitTime?: number;
    localSpace?: boolean;
    emitShape?: keyof typeof ParticleShape | ParticleShape;
    emitRadius?: number;
    emitRect?: { width: number; height: number };
    maxParticles?: number;
    animation?: ParticleAnimationData;
};

export class ParticleController
{
    private emitters: ParticleEmitterEntry[] = [];

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
            if (entry.render)
            {
                entry.emitter.render();
            }
        }
    }

    // CONVERTS PLAIN PARTICLE DATA (JSON PRESET OR COMPONENT FIELDS) INTO IParticleOptions:
    // LOOKS UP THE TEXTURE BY NAME, TURNS { x, y } INTO Vec2, HEX STRINGS INTO Color AND
    // THE EMIT SHAPE NAME INTO ParticleShape. PASS texture TO OVERRIDE THE NAME LOOKUP.
    ToOptions(data: ParticleData, texture?: Texture): IParticleOptions
    {
        const animation: ParticleAnimationData = data.animation ?? {};

        return {
            life: data.life ?? 1,
            texture: texture ?? (typeof data.texture === "string" ? assetsHandler.textures.get(data.texture) : data.texture) as Texture,
            shader: data.shader,
            origin: ParticleController.ToVec2(data.origin),
            emitRate: data.emitRate,
            emitTime: data.emitTime,
            localSpace: data.localSpace ?? false,
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

        const position = ParticleController.ToVec2(data.position);
        if (position)
            emitter.position.set(position.x, position.y);
        emitter.scale = data.scale ?? 1;

        // the emitter draws nothing until its texture is set
        if (!particleOptions.texture && typeof data.texture === "string" && data.texture)
        {
            assetsHandler.LoadTexture(data.texture).then(texture => emitter.setTexture(texture));
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
        if (!this.Has(emitter))
        {
            this.Add(emitter, { autoRemove: true });
        }

        emitter.oneShot(options.count);
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
