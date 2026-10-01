# Troubleshooting

## The game doesn't respond or won't load

The dev server on localhost may have crashed or stopped. Check the terminal where you ran `npm run dev`. If it shows an error or isn't running anymore, start it again:

```sh
npm run dev
```

Then reload the page.

## "Component class not found: XComponent"

The engine couldn't find a component named in a prefab.

- Check the class name ends in `Component`, and the prefab uses the name without it, starting lowercase: `PlayerComponent` → `"player"`.
- Make sure the class is **exported** and lives in `src/`. Only exported classes are registered automatically.
- Otherwise, register it yourself: `bare.AddClass(PlayerComponent)`.

## A warning about not knowing which scene

`bare.tween`, `bare.level` and the other [scene modules](../reference/bare#scene-modules) are rewritten to `this.scene.tween` and so on. That only works inside a scene, or inside a class with a `scene` property, like a GameObject or component.

In a plain helper class or function, pass the scene in and use it directly:

```ts
function Explode(scene: Scene, x: number, y: number)
{
    scene.particle.OneShot(...);
}
```

## "Cannot add a GameObject yet"

`AddGameObject` was called in a scene's constructor. Move it to `OnAwake` or `OnStart`.

## An image is missing

- In development: check the name matches the file name without extension, including folders: `enemies/saw` for `public/images/enemies/saw.webp`.
- Images in `public/images/` must be `.webp`. Put `.png` files in `texturePackImages/` instead.
- Only in the production build: you probably use [`texturePackImages.stripUnused`](../reference/package-json#texturepackimages), and the image's name is built while the game runs. Add it to `alwaysInclude`.

## Works in development, broken in the build

Production builds remove some things to save space. Try turning them off one at a time in [package.json Options](../reference/package-json):

| Symptom | Option |
| --- | --- |
| `Asset.Images`, `Data.Prefabs` or another list is empty | `"stripGeneratedAssets": false` |
| A method is suddenly undefined | `"stripUnusedMethods": false`, or keep the method with `keep` |
| Images missing from the atlas | check `texturePackImages.alwaysInclude` |

## Changes in package.json or vite.config.cjs don't apply

Restart the dev server. It reads these files only when it starts.

## Debug keys and `trace` don't work on my phone

They only work on an address with `localhost` in it, not on the dev server's network URL. See [Testing on your phone](./mobile#testing-on-your-phone).

## Save data from another game shows up

Two games with the same `gameId` on the same domain share their saves. Give each game its own [`gameId`](../reference/package-json#gameid).

## Still stuck?

Ask on [Discord](discord:).
