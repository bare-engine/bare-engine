import { sound as pixiSound } from '../libraries/pixi-sound';
import type { IMediaInstance, Options as PixiSoundOptions, PlayOptions, Sound } from '../libraries/pixi-sound';
import { SaveData, BareEvent } from '../types/bareTypes';
import { Helper } from '../utils/helper';
import { globalEvents } from '../globals';

export type SoundOptions = Partial<Omit<PixiSoundOptions, 'url' | 'preload'> & PixiPlayOptions> & {
  src?: string | string[];
  html5?: boolean;
  preload?: boolean | 'metadata';
  autoplay?: boolean;
  rate?: number;
  mute?: boolean;
};

type PixiPlayOptions = Omit<PlayOptions, 'volume' | 'speed'> & {
  volume?: number;
  speed?: number;
};

class SoundHandler
{
  private sounds: Map<string, Sound> = new Map();
  private soundPaths: Map<string, string> = new Map();
  private useLegacyAudio: boolean = false;

  public get usePixiSoundLegacy(): boolean
  {
    return this.useLegacyAudio;
  }

  public set usePixiSoundLegacy(value: boolean)
  {
    this.useLegacyAudio = value;
    pixiSound.useLegacy = value;
  }

  public get useHowlerHTML5(): boolean
  {
    return this.usePixiSoundLegacy;
  }

  public set useHowlerHTML5(value: boolean)
  {
    this.usePixiSoundLegacy = value;
  }

  public init(): void
  {
    globalEvents.on(BareEvent.game_focusChange, (hasFocus) =>
    {
      if (hasFocus)
        pixiSound.unmuteAll();
      else
        pixiSound.muteAll();
    });
  }

  public registerSound(id: string, src: string): void
  {
    this.soundPaths.set(id, `${bare.soundPath}/${src}`);
  }

  public getSound(id: string): Sound | undefined
  {
    return this.sounds.get(id);
  }

  public async playMusic(id: string, options: SoundOptions = {}): Promise<Sound>
  {
    return this.loadSound(id, options);
  }

  public playSound(id: string, options: SoundOptions = {}): Sound | null
  {
    if (!SaveData.soundEnabled)
      return null;

    const sound = this.loadSound(id, options);

    if (options.volume !== undefined)
      sound.volume = options.volume;

    sound.play(this.getPlayOptions(options));

    return sound;
  }

  public playPitchedSound(id: string, options: SoundOptions = {}, volume = 1, playRandomPitch: boolean = true): void
  {
    if (!SaveData.soundEnabled)
      return;

    const sound = this.loadSound(id, options);

    if (playRandomPitch)
      sound.speed = Helper.RandomRange(.9, 1.1);
    else if (options.rate !== undefined)
      sound.speed = options.rate;
    else if (options.speed !== undefined)
      sound.speed = options.speed;

    sound.volume = volume;
    sound.play(this.getPlayOptions(options));
  }

  public async PlayPitchedSound(id: string, options: SoundOptions = {}, volume = 1, playRandomPitch: boolean = true): Promise<void>
  {
    this.playPitchedSound(id, options, volume, playRandomPitch);
  }

  public loadSound(id: string, options: SoundOptions = {}): Sound
  {
    let sound = this.sounds.get(id);

    if (sound)
      return sound;

    if (pixiSound.exists(id))
    {
      sound = pixiSound.find(id);
      this.sounds.set(id, sound);

      return sound;
    }

    const src = this.getSoundPath(id);
    sound = pixiSound.add(id, this.getSoundOptions(src, options));

    if (options.mute !== undefined)
      sound.muted = options.mute;

    this.sounds.set(id, sound);

    return sound;
  }

  private getSoundPath(id: string): string
  {
    const src = this.soundPaths.get(id);

    if (src)
      return src;

    //console.error("No sound path found for", id);

    const fallbackFileName = `${id}.mp3`;
    this.registerSound(id, fallbackFileName);

    return this.soundPaths.get(id)!;
  }

  public stopSound(id: string): void
  {
    const sound = this.sounds.get(id);

    if (sound)
      sound.stop();
  }

  public setVolume(id: string, volume: number): void
  {
    const sound = this.sounds.get(id);

    if (sound)
      sound.volume = volume;
  }

  public stopAll(): void
  {
    this.sounds.forEach((sound) => sound.stop());
  }

  private getSoundOptions(src: string, options: SoundOptions): PixiSoundOptions
  {
    if (options.html5 !== undefined)
      this.usePixiSoundLegacy = options.html5;
    else
      pixiSound.useLegacy = this.usePixiSoundLegacy;

    const { autoplay, html5, mute, preload, rate, src: optionSrc, ...pixiOptions } = options;
    const soundOptions: PixiSoundOptions = {
      ...pixiOptions,
      url: optionSrc ?? src,
    };

    const autoPlay = options.autoPlay ?? autoplay;
    const playbackSpeed = options.speed ?? rate;

    if (autoPlay !== undefined) soundOptions.autoPlay = autoPlay;
    if (preload !== undefined) soundOptions.preload = preload === true;
    if (playbackSpeed !== undefined) soundOptions.speed = playbackSpeed;

    return soundOptions;
  }

  private getPlayOptions(options: SoundOptions): PixiPlayOptions
  {
    const { autoPlay, autoplay, complete, end, filters, loaded, loop, muted, rate, singleInstance, speed, sprite, start } = options;
    const playOptions: PixiPlayOptions = {};
    const playbackSpeed = speed ?? rate;

    if (complete !== undefined) playOptions.complete = complete;
    if (end !== undefined) playOptions.end = end;
    if (filters !== undefined) playOptions.filters = filters;
    if (loaded !== undefined) playOptions.loaded = loaded;
    if (loop !== undefined) playOptions.loop = loop;
    if (muted !== undefined) playOptions.muted = muted;
    if (singleInstance !== undefined) playOptions.singleInstance = singleInstance;
    if (playbackSpeed !== undefined) playOptions.speed = playbackSpeed;
    if (sprite !== undefined) playOptions.sprite = sprite;
    if (start !== undefined) playOptions.start = start;

    return playOptions;
  }
}

export const soundHandler = new SoundHandler();
