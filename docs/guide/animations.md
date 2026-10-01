# Animations

Frame animations are defined as data in `settingsData.json` and played by `AnimationComponent`.

## Defining animations

Animation names start with the name of the GameObject they belong to, followed by `_` and the animation:

```json
"animations": {
  "player_idle": {
    "frames": ["player/player_idle"]
  },
  "player_walk": {
    "frames": ["player/player_walk1#2"],
    "framesPerSecond": 10
  },
  "player_jump": {
    "frames": ["player/player_jump"],
    "loop": false
  },
  "saw": {
    "imagePath": "enemies",
    "frames": ["saw", "sawMove"],
    "framesPerSecond": 40
  }
}
```

| Field | Default | Description |
| --- | --- | --- |
| `frames` | | Image names, in order. |
| `imagePath` | | Folder added in front of every frame name. |
| `framesPerSecond` | `8` | Playback speed. |
| `loop` | `true` | Start over at the end. |
| `removeOnComplete` | `false` | Remove the GameObject when the animation ends. Handy for explosions. |

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [animations](https://github.com/bare-engine/bare-platformer/blob/main/public/data/settingsData.json#L104-L123).

### Numbered frames

Use `#` to list numbered images without typing them all:

| Written | Becomes |
| --- | --- |
| `walk#3` | `walk1`, `walk2`, `walk3` |
| `walk1#2` | `walk1`, `walk2` |
| `walk_00#03` | `walk_00`, `walk_01`, `walk_02`, `walk_03` |
| `walk1#2+4+6#8` | `walk1`, `walk2`, `walk4`, `walk6`, `walk7`, `walk8` |

Frames load automatically when an animation first plays, so they can be streamed from `public/images/` too.

## Playing animations

Add `"animation": {}` to a prefab's components, or add it in code:

```ts
const anim = player.AddComponent(AnimationComponent);
anim.Play('walk');      // plays "player_walk"
```

You pass the part after the `_`. The generated names work too: `anim.Play(Data.Animation.PLAYER_WALK)`.

An animation with exactly the object's name, like `saw` for a GameObject named `saw`, plays automatically.

| Method | Description |
| --- | --- |
| `Play(name, then?)` | Play an animation. `then` is another animation name or a function to run once when it ends. Returns a promise that resolves when the frames are loaded. |
| `Pause()` / `Resume()` | Stop and continue. |
| `GotoFrame(frame)` | Jump to a frame. |
| `OnComplete(name, then)` | Every time `name` ends, play `then` (a name) or call it (a function). |

```ts
anim.Play('attack', 'idle');              // attack once, then go back to idle
anim.Play('die', () => player.Remove());
```

**Examples:** the [Platformer](https://github.com/bare-engine/bare-platformer) [switches the player's animation by state](https://github.com/bare-engine/bare-platformer/blob/main/src/components/playerComponent.ts#L85-L96) and [raises the flag](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L89-L91) when you win. The [Showcase](https://github.com/bare-engine/bare-showcase) has an [animation demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/animation/src/DemoAnimation.ts).

## Animation events

```ts
import { AnimationEvent } from 'bare-engine';

anim.events.on(AnimationEvent.frameChanged, ({ frame }) => {
    if (frame == 3) bare.sound.Play('step');
});
```

| Event | When |
| --- | --- |
| `AnimationEvent.started` | An animation starts. |
| `AnimationEvent.frameChanged` | The frame changes. |
| `AnimationEvent.looped` | A looping animation starts over. |
| `AnimationEvent.completed` | A non-looping animation ends. |

## Objects without a base image

A prefab that only shows animations may not have an image with its own name. Put a `-` in front of the prefab name to skip looking for that image:

```ts
// "explosion" is a prefab with an animation component, but there's no "explosion" image
const explosion = this.AddGameObject('-explosion');
explosion.GetComponent(AnimationComponent).Play('big');
```

In production, a missing image would otherwise cause a failed image request.
