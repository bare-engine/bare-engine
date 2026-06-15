import { actx, makeSound, type SoundJsSound } from '../libraries/soundjs';
import { SaveData, BareEvent } from '../types/bareTypes';
import { Helper } from '../utils/helper';
import { globalEvents } from '../globals';

export type SoundOptions = {
    src?: string | string[];
    volume?: number;
    pan?: number;
    loop?: boolean;
    rate?: number;
    start?: number;
    echo?: boolean | { delay?: number; feedback?: number; filter?: number };
    reverb?: boolean | { duration?: number; decay?: number; reverse?: boolean };
    autoplay?: boolean;
    complete?: (sound: SoundJsSound) => void;
    loaded?: (sound: SoundJsSound) => void;
};

export class SoundHandler
{
    private sounds: Map<string, SoundJsSound> = new Map();
    private soundPaths: Map<string, string> = new Map();
    private pendingPlays: Map<string, SoundOptions[]> = new Map();

    constructor()
    {
        globalEvents.persistent.on(BareEvent.game_awake, () => bare.sound = this);
    }

    public Init(): void
    {
        globalEvents.on(BareEvent.game_focusChange, (hasFocus) =>
            {
                if (hasFocus)
                    actx.resume();
                else
                    actx.suspend();
            });
    }

    public Register(id: string, src: string): void
    {
        this.soundPaths.set(id, `${bare.soundPath}/${src}`);
    }

    public Get(id: string): SoundJsSound | undefined
    {
        return this.sounds.get(id);
    }

    public Play(id: string, options: SoundOptions = {}): SoundJsSound | null
    {
        if (!SaveData.soundEnabled)
            return null;

        const sound = this.Load(id, options);

        this.PlayLoaded(id, sound, options);

        return sound;
    }

    public PlayWithRandomRate(id: string, randomRange: number = .2, options: SoundOptions = {}): SoundJsSound | null
    {
        return this.Play(id, { ...options, rate: Helper.RandomRange(1 - randomRange*.5, 1 + randomRange*.5) });
    }

    public Load(id: string, options: SoundOptions = {}): SoundJsSound
    {
        let sound = this.sounds.get(id);

        if (sound)
            return sound;

        const src = this.GetOptionSource(options) ?? this.GetPath(id);
        sound = makeSound(
            src,
            () =>
            {
                options.loaded?.(sound!);
                this.FlushPendingPlays(id, sound!);
            },
            true,
            undefined,
            (source, error) => console.error(`Audio could not be loaded: ${source}`, error)
        );

        this.ApplyOptions(sound, options);
        this.sounds.set(id, sound);

        if (options.autoplay)
            this.PlayLoaded(id, sound, options);

        return sound;
    }

    private GetPath(id: string): string
    {
        const src = this.soundPaths.get(id);

        if (src)
            return src;

        const fallbackFileName = `${id}.mp3`;
        this.Register(id, fallbackFileName);

        return this.soundPaths.get(id)!;
    }

    public Stop(id: string): void
    {
        const sound = this.sounds.get(id);

        if (sound)
            this.StopSound(sound);
    }

    public SetVolume(id: string, volume: number): void
    {
        const sound = this.sounds.get(id);

        if (sound)
            sound.volume = volume;
    }

    public FadeTo(id: string, endValue: number, durationInSeconds: number): void
    {
        this.sounds.get(id)?.fade(endValue, durationInSeconds);
    }

    public FadeIn(id: string, durationInSeconds: number): void
    {
        this.sounds.get(id)?.fadeIn(durationInSeconds);
    }

    public FadeOut(id: string, durationInSeconds: number): void
    {
        this.sounds.get(id)?.fadeOut(durationInSeconds);
    }

    public StopAll(): void
    {
        this.sounds.forEach((sound) => this.StopSound(sound));
    }

    private StopSound(sound: SoundJsSound): void
    {
        sound.pause();
        sound.startOffset = 0;
    }

    private ApplyOptions(sound: SoundJsSound, options: SoundOptions): void
    {
        if (options.volume !== undefined)
            sound.volume = options.volume;

        if (options.pan !== undefined)
            sound.pan = options.pan;

        if (options.loop !== undefined)
            sound.loop = options.loop;

        if (options.echo)
        {
            const echo = options.echo === true ? {} : options.echo;
            sound.setEcho(echo.delay, echo.feedback, echo.filter);
        }

        if (options.reverb)
        {
            const reverb = options.reverb === true ? {} : options.reverb;
            sound.setReverb(reverb.duration, reverb.decay, reverb.reverse);
        }

        sound.playbackRate = (options.rate ?? 1);
    }

    private PlayLoaded(id: string, sound: SoundJsSound, options: SoundOptions): void
    {
        if (sound.hasLoaded || sound.buffer)
            this.StartPlayback(sound, options);
        else
            this.QueuePlay(id, options);
    }

    private StartPlayback(sound: SoundJsSound, options: SoundOptions): void
    {
        this.ApplyOptions(sound, options);

        if (options.start !== undefined)
            sound.playFrom(options.start);
        else
            sound.play();

        this.AttachCompleteHandler(sound, options);
    }

    private QueuePlay(id: string, options: SoundOptions): void
    {
        const pending = this.pendingPlays.get(id) ?? [];

        pending.push({ ...options });
        this.pendingPlays.set(id, pending);
    }

    private FlushPendingPlays(id: string, sound: SoundJsSound): void
    {
        const pending = this.pendingPlays.get(id);

        if (!pending)
            return;

        this.pendingPlays.delete(id);
        pending.forEach((options) => this.StartPlayback(sound, options));
    }

    private AttachCompleteHandler(sound: SoundJsSound, options: SoundOptions): void
    {
        if (!options.complete || sound.loop || !sound.soundNode)
            return;

        sound.soundNode.addEventListener('ended', () => options.complete?.(sound), { once: true });
    }

    private GetOptionSource(options: SoundOptions): string | undefined
    {
        if (typeof options.src === 'string')
            return options.src;

        return options.src?.[0];
    }
}

export const soundHandler = new SoundHandler();
