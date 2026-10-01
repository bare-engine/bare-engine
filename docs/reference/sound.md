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

## Play options

| Option | Description |
| --- | --- |
| `volume` | 0 to 1. |
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
| `PlayWithRandomRate(id, range?, options?)` | Play with a random rate, default ±10%. |
| `Load(id, src?)` | Load without playing. |
| `Register(id, src)` | Map a name to a file in `public/sounds/`. |
| `Get(id)` | The loaded sound. |
| `Stop(id)` / `StopAll()` | Stop playback. |
| `SetVolume(id, volume)` | Change volume. |
| `FadeIn(id, seconds)` / `FadeOut(id, seconds)` / `FadeTo(id, volume, seconds)` | Fade volume. |

Sounds don't play when `SaveData.soundEnabled` is `false`, so you can build a mute toggle with [Save Data](./save-data).
