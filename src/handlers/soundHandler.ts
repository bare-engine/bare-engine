import { Howl, HowlOptions, Howler } from '../libraries/howler/howler.core.js';
import { SaveData, BareEvent } from '../types/bareTypes';
import { Helper } from '../utils/helper';
import { globalEvents } from '../main';

class SoundHandler
{
  private sounds: Map<string, Howl> = new Map();
  private soundPaths: Map<string, string> = new Map();

  public useHowlerHTML5:boolean = false;

  init()
  {
    globalEvents.on(BareEvent.game_focusChange, (hasFocus) => Howler.mute(!hasFocus));
  }

  registerSound(id: string, src: string) {
    this.soundPaths.set(id, bare.soundPath + "/" + src);
  }

  getSound(id: string): Howl | undefined
  {
    return this.sounds.get(id);
  }

  async playMusic(id: string, options: Partial<HowlOptions> = {}): Promise<Howl>
  {
    var sound = await this.CheckToLoadSound(id, options);
    //sound.play();

    return sound;
  }

  playSound(id: string, options: Partial<HowlOptions> = {}): Howl | null
  {
    if (!SaveData.soundEnabled)
      return null;

    var sound = this.CheckToLoadSound(id, options);

    if (options.volume)
      sound.volume(options.volume);

    sound.play();

    return sound;
  }

  async PlayPitchedSound(id: string, options: Partial<HowlOptions> = {}, volume = 1, playRandomPitch: boolean = true)
  {
    if (!SaveData.soundEnabled)
      return;

    var sound = this.CheckToLoadSound(id, options);

    if (playRandomPitch) sound.rate(Helper.RandomRange(0.9, 1.1));
    sound.volume(volume);
    sound.play();
  }

  CheckToLoadSound(id: string, options: Partial<HowlOptions> = {}): Howl
  {
    var origID = id;
    let sound = this.sounds.get(id);

    if (!sound) {
      var src = this.soundPaths.get(id);

      if (!src)
      {
        src = "";
        console.error("No sound path found for", id);
      }

      sound = new Howl({ html5: this.useHowlerHTML5, src: [src], ...options });
      this.sounds.set(origID, sound);
    }

    return sound;
  }

  stopSound(id: string) {
    const sound = this.sounds.get(id);
    if (sound) {
      sound.stop();
    }
  }

  setVolume(id: string, volume: number) {
    const sound = this.sounds.get(id);
    if (sound) {
      sound.volume(volume);
    }
  }

  stopAll() {
    this.sounds.forEach((sound) => sound.stop());
  }
}

export const soundHandler = new SoundHandler();
