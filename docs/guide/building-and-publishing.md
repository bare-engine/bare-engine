# Building & Publishing

## Building

```sh
npm run build
```

This creates a production build in `dist/`. It's a plain static website: an `index.html` with your code, images and data next to it. All paths are relative, so it works from any folder on any host.

To create a zip you can upload directly:

```sh
npm run build-zip
```

This builds and zips `dist/` into `dist.zip`.

## What a production build does

A production build makes your game as small as possible:

- Code is minified, and engine modules you never use are left out.
- Inspector decorators like `@InspectorField` are removed. `@SerializeField` and `@Run` are kept.
- Class methods that are never called are removed.
- The asset lists in `assets.ts` (`Asset.Images`, `Data.Prefabs`, …) are emptied.
- Debug keys and other development-only code are removed.

Each of these can be turned off in [package.json Options](../reference/package-json). If something works in development but not in the build, that's the first place to look. See also [Troubleshooting](./troubleshooting).

To also leave unused images out of the texture atlas, turn on [`texturePackImages.stripUnused`](../reference/package-json#texturepackimages).

## Checking the size

```sh
npm install --save-dev vite-bundle-visualizer@^1.2.1
npm run analyze
```

This builds your game and opens a map of the bundle, showing which code takes up how much space.

## Testing the build

Open the build through a local web server, not by double-clicking `index.html`, because browsers block loading files directly from disk. For example:

```sh
npx vite preview --config vite.config.cjs
```

## Publishing

Upload the contents of `dist/`, or `dist.zip`, to any static host:

| Host | How |
| --- | --- |
| itch.io | Create a project, set the kind to **HTML**, upload `dist.zip` and tick **This file will be played in the browser**. |
| GitHub Pages | Push `dist/` to a branch and turn on Pages for it. |
| Netlify, Vercel, Cloudflare Pages | Drag `dist/` into their dashboard, or connect your repo with `npm run build` as the build command and `dist` as the output folder. |
| Game portals | Most accept a zip of an HTML5 game; upload `dist.zip`. |

::: tip
Give each game its own [`gameId`](../reference/package-json#gameid). Games on the same domain, like everything on itch.io, would otherwise share save data.
:::
