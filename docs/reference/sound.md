# Sound

`bare.sound` plays sound effects and music. Sounds are `.mp3` files in `public/sounds/`, played by name. They load on first play.

```ts
bare.sound.Play('jump');
bare.sound.PlayWithRandomRate('hit');                 // slight pitch variation
bare.sound.Play('music', { loop: true, volume: 0.4 });
bare.sound.FadeOut('music', 2);
```

To avoid a delay the first time, load a sound up front:

```ts
await bare.sound.Load('explosion');
```

**Examples:** the [Platformer](https://github.com/bare-engine/bare-platformer) plays [win](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L87) and [lose](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L96) sounds, and the [Showcase](https://github.com/bare-engine/bare-showcase)'s [sound demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/sound/src/DemoSound.ts#L17-L24) uses `Register` and `PlayWithRandomRate`.

## Other audio file formats

Unregistered sound names default to `<name>.mp3`. To reuse a name for a WAV or another browser-supported format, register its path once:

```ts
bare.sound.Register('splash', 'splash.wav');
bare.sound.Play('splash');
```

Registered paths are relative to `public/sounds/`. Registration maps the name without preloading the sound. Alternatively, supply a browser URL to `Load(id, src)` or the `src` playback option. Those URLs are used directly, so include `bare.soundPath` for a file in the sound directory:

```ts
await bare.sound.Load('splash', `${bare.soundPath}/splash.wav`);
bare.sound.Play('splash');
bare.sound.Play('bell', { src: `${bare.soundPath}/bell.wav` });
```

## Default volume per sound

To level a file that's louder or quieter than the rest, give it a volume once, where it's registered, instead of in every `Play`:

```ts
bare.sound.Register('coin', 'coin.mp3', { volume: 1.4 });
bare.sound.Register('explosion', { volume: 0.6 });    // keeps the default file, explosion.mp3
```

Or in [`settingsData.json`](../guide/settings-data), keyed by sound name. `src` is optional:

```json
"sounds": {
  "coin": { "src": "coin.mp3", "volume": 1.4 },
  "explosion": { "volume": 0.6 }
}
```

Every volume given in code for that sound is multiplied by it: `Play('coin', { volume: 0.5 })` plays at 0.7, and `SetVolume`, `FadeTo` and `FadeIn` work the same way. So the volumes in code only say how loud a sound should be at that moment, not how loud its file is. `GetDefaultVolume(id)` returns it, 1 when none is set. `Get(id).volume` is the volume that's actually used, with the default already applied.

The entries in `sounds` are registered when a scene with that settings data starts, and from then on they hold for the whole game.

## Play options

| Option | Description |
| --- | --- |
| `volume` | 1 is the file as it is, 0 is silent. Above 1 makes it louder, though very loud sounds can distort. Multiplied by the sound's [default volume](#default-volume-per-sound). |
| `loop` | Repeat forever. |
| `rate` | Playback speed and pitch. |
| `pan` | -1 (left) to 1 (right). |
| `start` | Start position in seconds. |
| `echo`, `reverb` | `true`, or an object with settings. |
| `src` | A different file than `<name>.mp3`. |
| `loaded`, `complete` | Callbacks. |

## Methods

| Method | Description |
| --- | --- |
| `Play(id, options?)` | Play a sound. |
| `PlayWithRandomRate(id, variation?, options?)` | Play at `options.rate` (default 1), up to `variation` higher or lower (default 0.1, ±10%). `{ rate: 0.7 }` plays at 0.63 to 0.77. |
| `Load(id, src?)` | Load without playing. |
| `Register(id, src?, { volume }?)` / `Register(id, { volume })` | Map a name to a file in `public/sounds/`, and/or set its [default volume](#default-volume-per-sound). |
| `GetDefaultVolume(id)` | The sound's [default volume](#default-volume-per-sound), 1 when none is set. |
| `Get(id)` | The loaded sound. |
| `Stop(id)` / `StopAll()` | Stop playback. |
| `SetVolume(id, volume)` | Change volume. Above 1 makes it louder. |
| `FadeIn(id, seconds)` / `FadeOut(id, seconds)` / `FadeTo(id, volume, seconds)` | Fade volume. A newer fade, or `SetVolume`, replaces a fade that's still going: it starts from the volume heard at that moment. `FadeIn` starts from silence. Fades only work on a sound that's playing. |
| `Mute()` / `Unmute()` | Silence all sound, for example during an ad. Playing sounds hold their place and continue on `Unmute()`. |
| `isMuted` | `true` between `Mute()` and `Unmute()`. |
| `isUnlocked` | `true` once the browser lets the game make sound. See [Before the first tap](#before-the-first-tap). |
| `Position(id)` | The seconds into the file that are heard now, output latency included. See [Following the music](#following-the-music). |

Sounds don't play when `SaveData.soundEnabled` is `false`, so you can build a mute toggle with [Save Data](./save-data).

`Mute()` is for silencing the game for a while, not a player setting: it isn't saved, and sounds started while muted wait and play on `Unmute()`. When the tab is hidden the sound is paused the same way, and coming back doesn't unmute a muted game.

## Before the first tap

Browsers hold back sound until the player first taps, clicks or presses a key. Sounds played before that count as playing (`Get(id).playing` is `true`), but they are silent and don't move forward. On that first tap they start where they were, so music started on load begins from the top then.

`bare.sound.isUnlocked` is `true` from then on, also while muted or while the tab is hidden, and `BareEvent.sound_unlocked` is sent the moment it turns true. If the browser allows sound right away, `isUnlocked` is `true` from the start and the event isn't sent, so check it first:

```ts
if (bare.sound.isUnlocked)
    this.HideTapHint();
else
    bare.globalEvents.once(BareEvent.sound_unlocked, () => this.HideTapHint());
```

## Following the music

To keep animation on the beat that's heard, read the music's position instead of counting game time, which can drift away from the audio:

```ts
const BEAT = 60 / 120;    // 120 beats per minute

const beat = Math.floor(bare.sound.Position('music') / BEAT);
```

`Position(id)` is the seconds into the file that are heard right now, with the delay before sound reaches the speakers taken off. It wraps around for a looping sound and takes the `rate` into account. It stands still whenever nothing is heard: before the first tap, while muted and while the tab is hidden. It is `0` for a sound that hasn't loaded or was stopped.
