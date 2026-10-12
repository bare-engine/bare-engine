# Debugging

## Debug drawing

Press **E** while the game runs, or use **Toggle Debug Visuals** in the browser extension ([Chrome](https://chromewebstore.google.com/detail/bare-engine/dbohigkcdpdnchgaffmofeoffnpkmphb) / [Firefox](https://addons.mozilla.org/en-GB/firefox/addon/bare-engine/)), to turn debug drawing on and off. It shows:

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

During development, **right-click** works like left-click in the [level editor](./level-editor#editing), so you can move objects around to try things out. This works without the browser extension ([Chrome](https://chromewebstore.google.com/detail/bare-engine/dbohigkcdpdnchgaffmofeoffnpkmphb) / [Firefox](https://addons.mozilla.org/en-GB/firefox/addon/bare-engine/)); with it, the selected objects also open in the extension, where you can see and edit their properties.

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

## Watching values

Fields marked `@InspectorField` and `@SerializeField` update live in the extension. To watch values that aren't on an object, like the number of enemies, put them in a [manager](./scenes#managers) with a getter. Getters update live too:

```ts
import { InspectorClass, InspectorField, Scene } from 'bare-engine';

class Stats
{
    constructor(private scene: Scene) {}

    @InspectorField
    get enemies(): number { return this.scene.object.GetLayerByName('enemies').length; }
}

export class Game extends Scene
{
    @InspectorClass
    stats = new Stats(this);
}
```

## Logging

`trace(...)` works like `console.log`, but only logs on the dev server, so you can leave it in. See [Globals](../reference/globals#logging-and-checks).

## More help

- [Troubleshooting](./troubleshooting) lists common problems and their fixes.
- `npm run analyze` shows what takes up space in your build. See [Building & Publishing](./building-and-publishing#checking-the-size).
