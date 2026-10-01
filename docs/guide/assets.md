# Assets

Bare has three ways to get images into your game. Pick per image, and switch between them without changing your code.

| Where | When it loads | Good for |
| --- | --- | --- |
| `texturePackImages/` | Packed into an atlas, loaded before the game starts | Small images used right away (UI, player) |
| `public/initial/` | Loaded before the game starts | Anything that must be ready at once |
| `public/images/` | Streamed in when first used | Everything else, especially large images |

In code you always refer to an image by name. The engine looks for it in the initial assets first, then streams it from `public/images/`:

```ts
this.AddGameObject('gear');
```

## Texture atlas

While the dev server runs, every image in `texturePackImages/` is packed into one atlas in `public/initial/generated/`. Add, change or remove an image and the atlas updates automatically.

## Streaming images

Put `.webp` images in `public/images/`, in subfolders if you like. A GameObject using a streamed image appears as soon as its image has loaded. Prefabs can point to a subfolder with `imagePath`:

```json
{
  "name": "saw",
  "imagePath": "enemies",
  "texture": "saw"
}
```

To wait for an image yourself:

```ts
await bare.asset.LoadTexture('backgrounds/sky');
```

**Examples:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [image loading demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/imageLoading/src/DemoImageLoading.ts), and the [Platformer](https://github.com/bare-engine/bare-platformer), which streams in everything, including animations.

## Generated assets

The dev server writes `src/generated/assets.ts` with a typed list of your assets:

```ts
import { Asset } from './generated/assets';

this.AddGameObject(Asset.Image.EMOJI_GEAR);
bare.sound.Play(Asset.Sound.JUMP);
bare.level.Load(Asset.Level.LEVEL_1);
```

Don't edit this file; it's regenerated whenever your assets change.

## Sounds

Put `.mp3` files in `public/sounds/` and play them by name. They load on first use:

```ts
bare.sound.Play('jump');
bare.sound.Play('music', { loop: true, volume: 0.5 });
```

See [Sound](../reference/sound).

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [sound demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/sound/src/DemoSound.ts#L17-L24) registers a sound with a different file name and plays it with a random pitch.

## Fonts

Put fonts in `public/fonts/` and load them by name (`.ttf` by default):

```ts
await bare.LoadFont('myFont');
```

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s UI [loads a font and an image](https://github.com/bare-engine/bare-platformer/blob/main/src/ui.ts#L17-L20) before it shows the coin counter.

## Animations

Frame animations are defined in `settingsData.json`, and their frames load like any other image. See [Animations](./animations).
