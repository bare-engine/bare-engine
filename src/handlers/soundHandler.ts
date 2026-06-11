import { actx, makeSound, type SoundJsSound } from '../libraries/soundjs';
import { SaveData, BareEvent } from '../types/bareTypes';
import { Helper } from '../utils/helper';
import { globalEvents } from '../globals';

export type SoundOptions = {
  src?: string | string[];
  volume?: number;
  loop?: boolean;
  rate?: number;
  speed?: number;
  start?: number;
  html5?: boolean;
  preload?: boolean | 'metadata';
  autoplay?: boolean;
  autoPlay?: boolean;
  mute?: boolean;
  muted?: boolean;
  singleInstance?: boolean;
  complete?: (sound: SoundJsSound) => void;
  loaded?: (sound: SoundJsSound) => void;
};

export class SoundHandler
{
  private sounds: Map<string, SoundJsSound> = new Map();
  private soundPaths: Map<string, string> = new Map();
  private pendingPlays: Map<string, SoundOptions[]> = new Map();
  private useHtml5Audio: boolean = false;

  constructor()
  {
    globalEvents.persistent.on(BareEvent.game_awake, () => bare.sound = this);
  }

  public get useHowlerHTML5(): boolean
  {
    return this.useHtml5Audio;
  }

  public set useHowlerHTML5(value: boolean)
  {
    this.useHtml5Audio = value;
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

  public async PlayMusic(id: string, options: SoundOptions = {}): Promise<SoundJsSound>
  {
    return this.Load(id, options);
  }

  public Play(id: string, options: SoundOptions = {}): SoundJsSound | null
  {
    if (!SaveData.soundEnabled)
      return null;

    const sound = this.Load(id, options);

    this.ApplyOptions(sound, options);
    this.PlayLoaded(id, sound, options);

    return sound;
  }

  public PlayPitched(id: string, options: SoundOptions = {}, volume = 1, playRandomPitch: boolean = true): void
  {
    if (!SaveData.soundEnabled)
      return;

    const sound = this.Load(id, options);
    const playbackRate = playRandomPitch
      ? Helper.RandomRange(.9, 1.1)
      : this.GetPlaybackRate(options);
    const playOptions = { ...options, volume, speed: playbackRate };

    this.ApplyOptions(sound, playOptions);
    sound.volume = volume;
    sound.playbackRate = playbackRate;

    this.PlayLoaded(id, sound, playOptions);
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

    if (options.autoplay || options.autoPlay)
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

    if (!sound)
      return;

    sound.pause();
    sound.startOffset = 0;
  }

  public SetVolume(id: string, volume: number): void
  {
    const sound = this.sounds.get(id);

    if (sound)
      sound.volume = volume;
  }

  public StopAll(): void
  {
    this.sounds.forEach((sound) =>
    {
      sound.pause();
      sound.startOffset = 0;
    });
  }

  private ApplyOptions(sound: SoundJsSound, options: SoundOptions): void
  {
    if (options.volume !== undefined)
      sound.volume = options.volume;

    if (options.loop !== undefined)
      sound.loop = options.loop;

    sound.playbackRate = this.GetPlaybackRate(options);
  }

  private GetPlaybackRate(options: SoundOptions): number
  {
    return options.speed ?? options.rate ?? 1;
  }

  private PlayLoaded(id: string, sound: SoundJsSound, options: SoundOptions): void
  {
    const play = () =>
    {
      if (options.start !== undefined)
        sound.playFrom(options.start);
      else
        sound.play();

      this.AttachCompleteHandler(sound, options);
    };

    if (sound.hasLoaded || sound.buffer)
      play();
    else
      this.QueuePlay(id, options);
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
    pending.forEach((options) =>
    {
      this.ApplyOptions(sound, options);

      if (options.start !== undefined)
        sound.playFrom(options.start);
      else
        sound.play();

      this.AttachCompleteHandler(sound, options);
    });
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
