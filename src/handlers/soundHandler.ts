import { Howl, HowlOptions, Howler } from '../libraries/howler/howler';
import { SaveData, BareEvent } from '../types/bareTypes';
import { Helper } from '../utils/helper';
import { globalEvents } from '../globals';

class SoundHandler
{
  private sounds: Map<string, Howl> = new Map();
  private soundPaths: Map<string, string> = new Map();

  public useHowlerHTML5: boolean = false;

  public init(): void
  {
    globalEvents.on(BareEvent.game_focusChange, (hasFocus) => Howler.mute(!hasFocus));
  }

  public registerSound(id: string, src: string): void
  {
    this.soundPaths.set(id, `${bare.soundPath}/${src}`);
  }

  public getSound(id: string): Howl | undefined
  {
    return this.sounds.get(id);
  }

  public async playMusic(id: string, options: Partial<HowlOptions> = {}): Promise<Howl>
  {
    return this.loadSound(id, options);
  }

  public playSound(id: string, options: Partial<HowlOptions> = {}): Howl | null
  {
    if (!SaveData.soundEnabled)
      return null;

    const sound = this.loadSound(id, options);

    if (options.volume !== undefined)
      sound.volume(options.volume);

    sound.play();

    return sound;
  }

  public playPitchedSound(id: string, options: Partial<HowlOptions> = {}, volume = 1, playRandomPitch: boolean = true): void
  {
    if (!SaveData.soundEnabled)
      return;

    const sound = this.loadSound(id, options);

    if (playRandomPitch)
      sound.rate(Helper.RandomRange(.9, 1.1));

    sound.volume(volume);
    sound.play();
  }

  public async PlayPitchedSound(id: string, options: Partial<HowlOptions> = {}, volume = 1, playRandomPitch: boolean = true): Promise<void>
  {
    this.playPitchedSound(id, options, volume, playRandomPitch);
  }

  public loadSound(id: string, options: Partial<HowlOptions> = {}): Howl
  {
    let sound = this.sounds.get(id);

    if (sound)
      return sound;

    const src = this.getSoundPath(id);
    sound = new Howl({ html5: this.useHowlerHTML5, src: [src], ...options });
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
      sound.volume(volume);
  }

  public stopAll(): void
  {
    this.sounds.forEach((sound) => sound.stop());
  }
}

export const soundHandler = new SoundHandler();
