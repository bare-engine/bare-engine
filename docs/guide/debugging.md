# Debugging

## Debug drawing

Press **E** while the game runs, or use **Toggle Debug Visuals** in the [Chrome extension](https://chromewebstore.google.com/detail/bare-engine/dbohigkcdpdnchgaffmofeoffnpkmphb) ([Firefox](https://addons.mozilla.org/en-GB/firefox/addon/bare-engine/)), to turn debug drawing on and off. It shows:

- each GameObject's pivot
- physics hitboxes
- pointer hitboxes, the areas that react to clicks

In code, check `bare.debug`, for example to draw your own helpers:

```ts
import { Color } from 'bare-engine';

override OnRender()
{
    if (bare.debug)
        bare.drawCircle({
            position: this.go.position,
            radius: this.range,
            color: Color.fromHex('#ff000040'),
        });
}
```

## Selecting objects in the game

During development, **right-click** works like left-click in the [level editor](./level-editor#editing), so you can move objects around to try things out. If your game uses the right mouse button itself, turn this off with `bare.DisableRightClick()`, for example in your scene's `OnAwake`. This works without the [Chrome extension](https://chromewebstore.google.com/detail/bare-engine/dbohigkcdpdnchgaffmofeoffnpkmphb) ([Firefox](https://addons.mozilla.org/en-GB/firefox/addon/bare-engine/)); with it, the selected objects also open in the extension, where you can see and edit their properties.

| Action | Controls |
| --- | --- |
| Select an object. | Right-click |
| Move it. | Right-click and drag |
| Select the deepest child under the pointer. | **Alt** + right-click |
| Add to the selection. Right-clicking an object that's already selected removes it. | **Shift** / **Ctrl** + right-click or right-drag |
| Deselect. | Right-click an empty spot |
| Select objects whose bounds are fully inside the rectangle. | Right-drag on an empty spot |
| Select objects whose bounds overlap the rectangle, even partly. | **Alt** + right-drag on an empty spot |

This doesn't work while the game is paused or the level editor is open; in the editor, use left-click.

## Debug keys

During development, these keys are available:

| Key | Action |
| --- | --- |
| **E** | Toggle debug drawing. |
| **P** | Pause. |
| **R** | Restart the game. |
| **L** | Restart the level. |
| **C** | Restart with cleared save data. |
| **F2** | Show or hide the [performance panel](#performance). |

If a game control uses one of these keys, turn that debug key off with [`bare.DisableDebugKey`](#changing-keys-while-the-game-runs).

They only work on the dev server, not in production builds, and only when the key is pressed on its own, so shortcuts like **Ctrl+C** still work normally.

To add your own, pass `debugKeys` to `StartBare`. This **replaces** the defaults, so include the ones you want to keep:

```ts
StartBare(Game, {
    debugKeys: [
        { e: () => bare.debug = !bare.debug },
        { r: () => bare.Restart() },
        { k: () => bare.object.GetByName('player')?.Remove() },  // kill the player
        { n: () => bare.level.Load('level2') },                  // skip to the next level
    ],
});
```

Pass `debugKeys: null` (or `[]`) to turn them all off.

### Changing keys while the game runs

When a default key is also one of your controls, turn just that one off. For example, in a puzzle game where **R** restarts the level:

```ts
override OnAwake()
{
    bare.DisableDebugKey('r');   // R restarts the level, not the whole game
}
```

| Method | Description |
| --- | --- |
| `bare.DisableDebugKey(key)` | Turn off one debug key. |
| `bare.DisableAllDebugKeys()` | Turn off every debug key. |
| `bare.SetDebugKey(key, action)` | Add or change one debug key. Passing `null` turns it off, like `DisableDebugKey`. |
| `bare.SetDebugKeys(keys)` | Replace all of them, in the same format as the `debugKeys` option. |

```ts
bare.SetDebugKey('f', () => bare.TogglePause()); // pause on F instead of P
bare.DisableDebugKey('p');
```

Keys are not case sensitive. All of these do nothing in production builds. Restarting the game with new `bareOptions` resets the keys to its `debugKeys`, so change them in `OnAwake`, which runs again after a restart.

## Debug buttons in the extension

Add buttons to the extension's debug panel with `plugin`:

```ts
import { plugin } from 'bare-engine';

plugin?.AddDebugAction('Give 100 coins', () => this.AddCoins(100));
```

`plugin` only exists during development and is left out of production builds, hence the `?.`.

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg) [adds a **Toggle Map Editor** button](https://github.com/bare-engine/bare-rpg/blob/main/src/handlers/mapHandler.ts#L88-L89).

For buttons that belong to one object, use [`@InspectorButton`](../reference/inspector-decorators#buttons) instead. They show up when you select the object.

## Performance

Press **F2**, or call `bare.TogglePerfOverlay()`, for a panel in the top right with the game's timings, averaged over half a second:

| Line | Meaning |
| --- | --- |
| fps, ms (worst) | Frames per second, and the average and slowest time between frames. |
| fixed | Time spent in fixed updates per frame, physics included, and how many ran. |
| update | Time spent in `OnUpdate`, tweens and other per-frame updates. |
| render | Time spent building and sending draw calls, and how many there were. The GPU's own time only shows in the frame time. |
| objects | GameObjects on all scenes' layers, without children. |
| slowed down | Fixed updates take longer than the time they simulate, so the game runs slower to keep responding. See `bare.fixedStepsBehind` in [The bare Object](../reference/bare#general-properties). |

The panel is left out of production builds. In code:

- `rapid.drawcallCount` counts the draw calls of the frame being drawn. Read in `OnUpdate`, it's the total of the previous frame.
- `bare.fixedStepsBehind` is true while the game is slowed down.

## Logging

`trace(...)` works like `console.log`, but only logs on the dev server, so you can leave it in. See [Globals](../reference/globals#logging-and-checks).

## Testing in a headless browser

Automated tests and screenshots often run the game in a headless browser, through Puppeteer, Playwright or the Chrome DevTools Protocol. A few things differ from a normal browser window:

- **The game freezes without focus.** [`freezeOnUnfocus`](../reference/configuration#startbare-options) is on by default, and a headless page often doesn't count as focused, so the first frame renders and then nothing moves. Turn on focus emulation, for example with the DevTools Protocol command `Emulation.setFocusEmulationEnabled({ enabled: true })`, or start the game with `freezeOnUnfocus: false` while testing, for example behind a URL flag:

  ```ts
  StartBare(Game, {
      freezeOnUnfocus: !location.search.includes('test'),
  });
  ```

- **Wait in real time.** The game loop runs on `requestAnimationFrame`, which Chrome's `--virtual-time-budget` doesn't drive reliably, so `--screenshot` with a time budget can capture a game that hardly moved. Open the page, wait real seconds, then take the screenshot.
- **WebGL needs a software renderer** on machines without a GPU. For Chrome and Edge, pass `--use-angle=swiftshader --enable-unsafe-swiftshader`.
- **Read the game's state with `bare`.** It's a global, so a test can evaluate expressions like `bare.scene.GetAll().map(s => s.constructor.name)`. In a production build, [unused methods are removed](../reference/package-json#stripunusedmethods), so a method your game never calls may not exist there.
- **Send real input.** Mouse and keyboard events from the testing tool reach the game like a player's. For keys like Escape, include the key code (`windowsVirtualKeyCode: 27` in the DevTools Protocol), or the browser may not fire a `keydown`.

## More help

- [Troubleshooting](./troubleshooting) lists common problems and their fixes.
- `npm run analyze` shows what takes up space in your build. See [Building & Publishing](./building-and-publishing#checking-the-size).
