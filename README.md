# Bare Engine

<p align="left">
  <img height="113" src="https://github.com/user-attachments/assets/d9aacea3-b461-4ed4-abb5-8cfc0f322823">&nbsp;<img height="113" src="https://github.com/user-attachments/assets/b4b4f2d4-749c-40e8-8f5d-ed0d87bc3531">&nbsp;<img height="113" src="https://github.com/user-attachments/assets/010c9a7d-5720-46be-9dc0-f5808b8b9d7b">&nbsp;<img height="113" src="https://github.com/user-attachments/assets/a9159947-43d4-43ed-ba05-2a341bd1b112">
</p>

Bare is a small, fast game engine for the web, written in TypeScript. Create GameObjects, attach behavior with components, build levels in the in-game editor, and inspect everything live with the Chrome extension. Production builds leave out every module you don't use, images stream in when they're needed, and Vite hot reload keeps your iteration speed fast.

## Features

- Small minimum size: 34kb gzip
- Fast loading time
- Easy asset streaming
- In-game level editor, extendable with your own editor components
- Live object inspection and editing in the Chrome extension
- Prefabs
- Components
- Save/load levels
- Fast rendering with [Rapid](https://github.com/Nightre/Rapid.js): shaders, particles, tweens
- Optional arcade and rigid-body physics
- Open source

## Get started

1. [Bare Template](https://github.com/bare-engine/bare-template): start your project.
2. [Chrome Extension](https://chromewebstore.google.com/detail/bare-engine/dbohigkcdpdnchgaffmofeoffnpkmphb): inspect and edit your game while it runs.
3. [Bare Showcase](https://github.com/bare-engine/bare-showcase): a small demo for each feature.
4. [Examples](https://bare-engine.github.io/bare-engine/guide/examples): complete example games.
5. [Documentation](https://bare-engine.github.io/bare-engine/): guides and reference.

## Community

Questions and bug reports are welcome on [Discord](https://discord.gg/zq3Qh45JE).

> [!WARNING]
> The engine is still in active development, so some features may be unstable.

## Contributing

For engine development, install dependencies in this repository with `npm install`. The documentation checks are tested with Node 24.19.0.

- `npm test`: build and run the browser fixture scenes in headless Chrome.
- `npm run dev:fixture`: open the browser fixtures for interactive debugging.
- `npm run docs:dev`: preview the documentation locally.
- `npm run docs:validate`: check example links, TypeScript, the built documentation, and executable examples.

See [the documentation contributor guide](docs/README.md) for sample checkout setup, individual checks, and how to add tested examples. Game projects use the template's scripts; this repository has its own development and test commands.
