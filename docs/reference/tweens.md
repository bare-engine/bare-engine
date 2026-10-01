# Tweens

Tweens animate any numeric property over time.

```ts
TweenTo(player, 0.5, { x: 300, rotation: 90 });
```

`TweenTo(object, seconds, props)` is shorthand for `bare.tween.To(...)`. Both return a tween with a `promise`, so you can wait for it:

```ts
await TweenTo(door, 1, { y: 0 }).promise;
```

## Options

Add these to `props` next to the values you animate:

| Option | Description |
| --- | --- |
| `ease` | An easing function, for example `Easing.Back.Out`. Default `Easing.Quadratic.Out`. |
| `delay` | Seconds to wait before starting. |
| `yoyo` | Play back and forth. |
| `repeat` | Number of repeats, `-1` for forever. |
| `onStart`, `onUpdate`, `onComplete`, `onRepeat`, `onStop` | Callbacks. |
| `persistent` | Keep the tween when the scene is cleared. |

```ts
import { Easing } from 'bare-engine';

TweenTo(coin, 0.4, { innerY: '+=10', ease: Easing.Sinusoidal.InOut, yoyo: true, repeat: -1 });
```

Relative values like `'+=10'` and `'-=10'` add to the current value.

By default, a new tween on the same object and property replaces the old one. Pass `false` as the fourth argument to keep both.

## bare.tween

| Method | Description |
| --- | --- |
| `To(object, seconds, props, overwrite?)` | Start a tween. |
| `Shake(object, property, duration, …)` | Shake a property and settle back to 0. |
| `SetTimer(seconds, onComplete)` | Call a function after a delay. |
| `AddChain(...tweens)` | Play tweens one after another. |
| `GetAllFrom(object)` | All tweens running on an object. |
| `RemoveAllFrom(object)` | Stop all tweens on an object. |
| `FinishAllFrom(object)` / `FinishAll()` | Jump tweens to their end. |
| `RemoveTimers()` | Cancel all timers. |
