import { ParticleEmitter } from "../libraries/rapid-render/particle";
import { Vec2 } from "../libraries/rapid-render";
import { events } from "../main";
import { Events } from "../utils/bareTypes";

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

export class ParticleController
{
    private emitters: ParticleEmitterEntry[] = [];

    constructor()
    {
        this.init();
    }

    private init()
    {
        events.persistent.on('update', this.Update.bind(this));
        events.persistent.on('postRender', this.Render.bind(this));
        events.persistent.on('clear', this.Clear.bind(this));
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

    Update(input: Events['update'] | number): void
    {
        const deltaTime = typeof input === 'number' ? input : input.deltaTime;
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

    OneShot(emitter: ParticleEmitter, options: ParticleOneShotOptions = {})
    {
        if (options.position)
        {
            emitter.position.set(options.position.x, options.position.y);
        }

        this.Add(emitter, { autoRemove: true, autoOneShot: true });
    }

    Clear()
    {
        this.emitters.length = 0;
    }
}

export const particleController = new ParticleController();
globalThis.particleController = particleController;
