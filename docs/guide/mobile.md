# Mobile & Touch

Bare games run in mobile browsers without changes. This page covers what's worth adjusting.

## Testing on your phone

Start the dev server so other devices on your network can reach it:

```sh
npm run dev -- --host
```

The terminal then shows a **Network** URL, like `http://192.168.1.20:5173/`. Open it on your phone, connected to the same Wi-Fi.

Everything works as on your computer: [`trace`](../reference/globals#logging-and-checks) logs, and saves from the [level editor](./level-editor) on your phone write to the level file on your computer.

## Touch is the mouse

`bare.mouse` and pointer events handle touch as well: a tap is a press, and dragging a finger moves the pointer. Code written for the mouse works on touch screens.

```ts
button.OnPointerDown(() => this.Jump());
```

## Multiple fingers

By default only the first finger counts, so a second finger doesn't interrupt the first. For controls that are used at the same time, like a joystick and a jump button, turn on `multiTouch`:

```ts
StartBare(Game, { multiTouch: true });
```

Each finger can then press its own button.

## Fingers are less precise

A fingertip covers more than the exact point it touches. For a layer with small or crowded objects, pick the object whose center is **nearest** to the touch instead of the one on top:

```ts
this.SetPointerCollisionTypeForLayer(CollisionHandlingType.RADIUS, 'objects');
```

Or set it in `settingsData.json`:

```json
"layersInfo": {
  "objects": {
    "pointerCollisionType": "RADIUS"
  }
}
```

`"POINT"`, the top object under the pointer, is the default.

## On-screen controls

Put touch controls in a [UI scene](./text-and-ui#ui-scenes), or on `bare.uiScene`, so they don't move with the camera. Show them only on touch devices with the `isMobile` global, or hide them as soon as a key is pressed.

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg) has a [touch joystick](https://github.com/bare-engine/bare-rpg/blob/main/src/ui/joystick.ts), which it [adds to `bare.uiScene`](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L40-L44) and [hides on the first key press](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L53-L55).

## Screen size

Phones come in many shapes, and turn between portrait and landscape. Lay things out relative to `bare.width` and `bare.height`, or pick a [resolution setup](./resolution) that scales for you. A UI scene with `resize: true` keeps its objects in place when the screen turns.

## Device checks

| Check | Description |
| --- | --- |
| `isMobile` | A phone or tablet. |
| `bare.util.IsAndroid()` | An Android device. |
| `bare.util.HasNotch()` | A screen with a notch. |

## Leaving the game

With `freezeOnUnfocus` on (the default), the game pauses when the player switches apps or tabs, and continues when they come back.
