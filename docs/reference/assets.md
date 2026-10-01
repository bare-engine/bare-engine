# Assets

`bare.asset` loads and holds textures, atlases and animations. Usually you don't need it: GameObjects load their images by name, and animations load their frames when they first play. See the [Assets guide](../guide/assets) for where to put files.

```ts
await bare.asset.LoadTexture('backgrounds/sky');   // public/images/backgrounds/sky.webp
const sky = bare.asset.GetTexture('backgrounds/sky');
```

## Textures

Texture names are paths relative to `public/images/`, without the extension. Images from the texture atlas and `public/initial/` are already loaded when the game starts.

| Method | Description |
| --- | --- |
| `LoadTexture(name)` | Load a `.webp` from `public/images/`. Resolves with the texture; already loaded or loading textures aren't fetched twice. A failed load resolves with a red placeholder pixel. |
| `LoadTextureBatch(names)` | Load several textures in parallel. |
| `GetTexture(name)` / `HasTexture(name)` | A loaded texture, or whether it's loaded. |
| `AddTexture(name, texture)` | Register a texture you made, for example a `RenderTexture`, so it can be used by name. |
| `RemoveTexture(name)` | Forget a texture. |

## Atlases

| Method | Description |
| --- | --- |
| `LoadAtlas(path)` | Load `<path>.json` and `<path>.webp` from `public/images/` and add every image in it by name. |

The atlas built from `texturePackImages/` is loaded automatically.

## Animations

| Method | Description |
| --- | --- |
| `AddAnimation(name, frames, framesPerSecond = 8, loop = true, removeOnComplete = false)` | Define an animation in code, like an entry in `settingsData.json`'s `animations`. |
| `GetAnimation(name)` | The animation's data, or `undefined`. |

See [Animations](../guide/animations) for defining and playing them.
