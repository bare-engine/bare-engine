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
    complete?: (sound: SoundJsSound) => void;
    loaded?: (sound: SoundJsSound) => void;
};

export class SoundHandler
{
    private sounds: Map<string, SoundJsSound> = new Map();
    private loads: Map<string, Promise<SoundJsSound>> = new Map();
    private soundPaths: Map<string, string> = new Map();
    private suspendedByHandler: boolean = false;
    private muted: boolean = false;
    private unlocked: boolean = actx.state === 'running';

    private static readonly unlockGestures = ['pointerdown', 'touchend', 'keydown', 'click'];
    private readonly unlockOnGesture = (): void => this.UnlockOnGesture();

    constructor()
    {
        globalEvents.persistent.on(BareEvent.game_awake, () => bare.sound = this);

        document.addEventListener('visibilitychange', () => this.SyncAudioContext());
        actx.addEventListener('statechange', () => this.OnAudioStateChange());

        if (!this.unlocked)
        {
            for (const type of SoundHandler.unlockGestures)
                window.addEventListener(type, this.unlockOnGesture, { capture: true });
        }
    }

    /** True between `Mute()` and `Unmute()`. */
    public get isMuted(): boolean
    {
        return this.muted;
    }

    /** True once the browser lets the game make sound, which most browsers only allow after the
     *  first tap or key press. Before that, sounds that are played count as playing, but they are
     *  silent and their `Position` stands still. Stays true after that, also while muted or while
     *  the tab is hidden. `BareEvent.sound_unlocked` is sent the moment it turns true. */
    public get isUnlocked(): boolean
    {
        return this.unlocked;
    }

    /** The seconds into the sound's file that are heard right now, output latency included, so
     *  animation can follow the music. Stands still while nothing is heard: before the first tap
     *  (see `isUnlocked`), while muted and while the tab is hidden. Wraps around for a looping
     *  sound. 0 for a sound that hasn't loaded or was stopped. */
    public Position(id: string): number
    {
        const sound = this.sounds.get(id);

        if (!sound?.buffer)
            return 0;

        let position = sound.startOffset ?? 0;

        if (sound.playing && sound.soundNode)
        {
            const latency = (actx.outputLatency || 0) + (actx.baseLatency || 0);
            const elapsed = Math.max(0, actx.currentTime - latency - sound.startTime);
            position += elapsed * sound.soundNode.playbackRate.value;
        }

        const duration = sound.buffer.duration;

        return sound.loop ? position % duration : Math.min(position, duration);
    }

    /** Silences all sound, for example during an ad. Sounds that are playing hold their place
     *  and carry on from there on `Unmute()`. */
    public Mute(): void
    {
        this.muted = true;
        this.SyncAudioContext();
    }

    public Unmute(): void
    {
        this.muted = false;
        this.SyncAudioContext();
    }

    // the browser holds the context until the first tap or key press. resuming it inside that
    // gesture is what lets it run (safari needs this; chrome resumes it by itself). not while
    // muted or hidden: the next gesture after that tries again
    private UnlockOnGesture(): void
    {
        if (actx.state !== 'running' && !this.muted && !document.hidden && !this.suspendedByHandler)
            actx.resume().catch(() => {});
    }

    private OnAudioStateChange(): void
    {
        if (actx.state === 'running' && !this.unlocked)
        {
            this.unlocked = true;

            for (const type of SoundHandler.unlockGestures)
                window.removeEventListener(type, this.unlockOnGesture, { capture: true });

            // firefox can start the context a moment after the page loads, before the game is
            // up, so then only the global bus hears it
            if (typeof bare !== 'undefined' && bare.scene)
                bare.SendEvent(BareEvent.sound_unlocked);
            else
                globalEvents.emit(BareEvent.sound_unlocked);
        }

        // a browser that resumes the context by itself on the first tap can do so while muted
        // or hidden, so it is suspended again here
        this.SyncAudioContext();
    }

    // The context runs only while the game is unmuted and the tab is visible. It is only
    // resumed when this handler suspended it, so a context the browser holds until the first
    // tap stays that way (UnlockOnGesture resumes that one).
    private SyncAudioContext(): void
    {
        if (this.muted || document.hidden)
        {
            if (actx.state === 'running' && !this.suspendedByHandler)
            {
                this.suspendedByHandler = true;
                actx.suspend().catch(() => {});
            }
        }
        else if (this.suspendedByHandler)
        {
            this.suspendedByHandler = false;
            actx.resume().catch(() => {});
        }
    }

    public Register(id: string, src: string): void
    {
        this.soundPaths.set(id, `${bare.soundPath}/${src}`);
    }

    public Get(id: string): SoundJsSound | undefined
    {
        return this.sounds.get(id);
    }

    // Ensure a sound is fetched and decoded. The decode runs once per id and is
    // shared through a cached promise, so calling this repeatedly - or preloading
    // up front via `await bare.sound.Load(id)` - is cheap. Resolves with the
    // playable sound; does not start playback (that's `Play`).
    public Load(id: string, src?: string): Promise<SoundJsSound>
    {
        const existing = this.loads.get(id);

        if (existing)
            return existing;

        const source = src ?? this.GetPath(id);

        const load = new Promise<SoundJsSound>((resolve, reject) =>
            {
                const sound = makeSound(
                    source,
                    () => resolve(sound),
                    true,
                    undefined,
                    (failedSource, error) =>
                    {
                        console.error(`Audio could not be loaded: ${failedSource}`, error);
                        // Evict so a later Play can retry instead of staying stuck.
                        this.loads.delete(id);
                        this.sounds.delete(id);
                        //reject(error);
                    }
                );

                this.sounds.set(id, sound);
            });

        this.loads.set(id, load);

        return load;
    }

    public Play(id: string, options: SoundOptions = {}): SoundJsSound | null
    {
        if (!SaveData.soundEnabled)
            return null;

        const ready = this.Load(id, this.GetOptionSource(options));
        const sound = this.sounds.get(id)!;

        // Start now if the buffer is ready, otherwise as soon as it decodes.
        if (sound.hasLoaded || sound.buffer)
        {
            this.StartPlayback(sound, options);
        }
        else
        {
            ready
                .then(() =>
                    {
                        options.loaded?.(sound);
                        this.StartPlayback(sound, options);
                    })
                .catch(() => { /* load failure already reported in Load */ });
        }

        return sound;
    }

    public PlayWithRandomRate(id: string, variation: number = .1, options: SoundOptions = {}): SoundJsSound | null
    {
        const rate = (options.rate ?? 1) * Helper.RandomRange(1 - variation, 1 + variation);
        return this.Play(id, { ...options, rate });
    }

    public Stop(id: string): void
    {
        const sound = this.sounds.get(id);

        if (sound)
            this.StopSound(sound);
    }

    public StopAll(): void
    {
        this.sounds.forEach((sound) => this.StopSound(sound));
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

    private GetPath(id: string): string
    {
        const src = this.soundPaths.get(id);

        if (src)
            return src;

        const fallbackFileName = `${id}.mp3`;
        this.Register(id, fallbackFileName);

        return this.soundPaths.get(id)!;
    }

    private StopSound(sound: SoundJsSound): void
    {
        sound.pause();
        sound.startOffset = 0;
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
