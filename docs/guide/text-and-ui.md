# Text & UI

## Text

`TextObject` is a GameObject that shows text:

```ts
import { TextObject } from 'bare-engine';

const score = new TextObject(this, {
    text: 'Score: 0',
    fontSize: 32,
    fontFamily: 'monospace',
    fill: '#ffffff',
    stroke: '#000000',
    strokeThickness: 4,
});
this.AddGameObject(score).SetPosition(20, 20);

score.SetText('Score: 10');
```

| Option | Default | Description |
| --- | --- | --- |
| `text` | `"Text"` | The text. |
| `fontSize` | `24` | Size in pixels. |
| `fontFamily` | `bare.defaultFont`, then Arial | Font name. |
| `fontWeight` | `"normal"` | For example `"bold"`. |
| `fill` | `"#000000"` | Text color. |
| `stroke` / `strokeThickness` | | Outline color and width. |
| `align` | `"left"` | `"left"`, `"center"` or `"right"` for multiple lines. |
| `lineHeight` | `1` | Line spacing. |

Text objects can also be created from a prefab, with `"baseClass": "TextObject"` and the same fields. A `baseClass` named in `settingsData.json` or in your code is registered automatically. Only a name built while the game runs needs `bare.AddClass(TextObject)`.

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [coin counter](https://github.com/bare-engine/bare-platformer/blob/main/src/ui.ts#L29-L41).

### TextComponent

To add text to an existing GameObject, like a label above a character, use `TextComponent`:

```ts
const label = enemy.AddComponent(TextComponent, { text: 'Goblin', fontSize: 16 });
label.offset.set(0, -40);
label.SetText('Angry goblin');
```

Unlike most components, it also shows in the level editor.

### Fonts

Put a `.ttf` file in `public/fonts/` and load it. The first font you load becomes the default for all text:

```ts
await bare.LoadFont('pixel');
```

To switch the default to another loaded font, set `bare.defaultFont`. `TextObject`, `TextComponent` and `Button` all use it, and fall back to Arial when it isn't set.

A text object that's removed, and doesn't go back to an [object pool](./custom-game-objects#object-pools), frees its text texture on the GPU. Adding it again recreates the texture. To hide text for a moment, set `visible = false` instead.

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer) [loads its font](https://github.com/bare-engine/bare-platformer/blob/main/src/ui.ts#L17-L20) in the UI scene's `OnAwake`.

## Buttons

`Button` is a text button with a background:

```ts
import { Button } from 'bare-engine';

const play = new Button(this, {
    text: 'Play',
    fontSize: 28,
    buttonColor: '#3060c0',
    cornerRadius: 8,
    margin: 16,
    OnPress: () => bare.scene.Goto(Game),
});
this.AddGameObject(play).SetPosition(bare.width / 2, bare.height / 2).CenterPivot();
```

The height comes from the font size and `margin`, not the letters, so buttons with the same style line up.

Besides `OnPress` there are `OnRelease`, `OnEnter` and `OnLeave`. Any other GameObject can act as a button as well, see [pointer events](../reference/hitbox).

A button is as wide as its text plus `margin` on both sides. Give a row of buttons the same `minWidth`, like `minWidth: 220`, and they line up whatever their text, with the text centered. A text that doesn't fit still makes its button wider.

## UI scenes

A UI should stay on screen while the camera moves. Put it in its own scene with `UI: true`:

```ts
export class HUD extends Scene
{
    constructor()
    {
        super({ UI: true, resize: true });
    }

    override OnStart()
    {
        // ...add text and buttons
    }
}

// in your game scene
this.hud = await bare.scene.Add(HUD);
```

`UI` and `resize` are [scene options](../reference/configuration#scene-options); `persistent` keeps the scene when others are cleared.

A click on a button in the UI scene isn't a click in the game scene below: there `bare.mouse.IsPressed()` stays false. See [Mouse](../reference/mouse).

For quick UI there's also `bare.uiScene`, a ready-made UI scene that's created the first time you use it:

```ts
bare.uiScene.AddGameObject(pauseButton);
```

**Examples:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [UI scene](https://github.com/bare-engine/bare-platformer/blob/main/src/ui.ts), and the [RPG](https://github.com/bare-engine/bare-rpg)'s [touch joystick](https://github.com/bare-engine/bare-rpg/blob/main/src/ui/joystick.ts) on [`bare.uiScene`](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L40-L44).

### Anchoring

Use the pivot to anchor UI to the edges of the screen:

```ts
text.SetPosition(bare.width, 0).SetPivot(1, 0);              // top right
text.SetPosition(bare.width / 2, bare.height).SetPivot(0.5, 1); // bottom center
```

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [UI demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/ui/src/DemoUi.ts#L16-L38) anchors text to every edge.
