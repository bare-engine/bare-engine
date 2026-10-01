# Chrome Extension

The [Bare Engine Chrome extension](https://chromewebstore.google.com/detail/bare-engine/dbohigkcdpdnchgaffmofeoffnpkmphb) lets you inspect and edit your game while it runs, and edits `settingsData.json` for you.

## Setup

1. Install the extension from the Chrome Web Store.
2. Run your game with `npm run dev` and open it in Chrome.
3. Press **F12** to open the developer tools and open the **Bare Engine** tab.

## What you can do

- View and edit objects and their components in the running scene
- View and edit prefabs
- Jump to any level
- Trigger debug buttons, and add your own
- See the properties of objects you [right-click](./debugging#selecting-objects-in-the-game) in the game

Fields marked `@InspectorField` in your code appear in the extension. See [Components](./components#inspector-fields).

**Example:** the [Shmup](https://github.com/bare-engine/bare-shmup)'s [`ShootComponent`](https://github.com/bare-engine/bare-shmup/blob/main/src/components/shootComponent.ts#L8-L33) has editable fields and a **Shoot** button.

::: info
The extension is still being worked on, and will become a paid feature at some point. See the [Roadmap](./roadmap#chrome-extension) for what's planned.
:::
