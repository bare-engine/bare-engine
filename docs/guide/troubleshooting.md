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
- Classes are registered in the `OnAwake` of the scene you pass to `StartBare`. That scene must be declared in the same file, or imported from a relative path (`import { Menu } from './menu'`). If the dev server can't find it, it prints a warning saying so.
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
| `Asset.Images`, `Data.Prefabs` or another list is empty | remove `"stripGeneratedAssets": true` |
| A method is suddenly undefined | `"stripUnusedMethods": false`, or keep the method with `keep` |
| Images missing from the atlas | check `texturePackImages.alwaysInclude` |

## "This member must have an 'override' modifier"

A member of your class has the same name as one in the engine class it extends. Both are the same property, so the engine would read and change yours, and you would replace its behavior. For example, a scene with its own `paused` flag would pause the whole scene.

- For a hook like `OnStart` or `OnUpdate`, add `override`: `override OnStart()`. VS Code's quick fix **Add all missing 'override' modifiers** does a whole file at once, but it also adds `override` to accidental clashes like `paused`, which hides them again. Check what it marked.
- For your own member, rename it: `isPaused` instead of `paused`.
- To only narrow an engine field's type, use `declare`: `declare go: Player;`.
- To give an engine field a starting value, assign it in the constructor or `OnAwake` instead of declaring it again.

This check comes from [`noImplicitOverride`](https://www.typescriptlang.org/tsconfig/#noImplicitOverride), which is on in the engine's base tsconfig that your `tsconfig.json` extends. The dev server doesn't type-check, so the error shows in your editor, or with `npx tsc --noEmit`.

## Changes in package.json or vite.config.cjs don't apply

Restart the dev server. It reads these files only when it starts.

## A field keeps an old value after loading

A value saved into a level keeps being loaded, even after the field is no longer saved, for example after changing `@SerializeField` to `@InspectorField`. Press **C** to restart with cleared save data.

## Save data from another game shows up

Two games with the same `gameId` on the same domain share their saves. Give each game its own [`gameId`](../reference/package-json#gameid).

## Still stuck?

Ask on [Discord](discord:).
