<h1>Bare Game Engine</h1>

<p align="left">
  <img height="113" src="https://github.com/user-attachments/assets/d9aacea3-b461-4ed4-abb5-8cfc0f322823">&nbsp;<img height="113" src="https://github.com/user-attachments/assets/b4b4f2d4-749c-40e8-8f5d-ed0d87bc3531">&nbsp;<img height="113" src="https://github.com/user-attachments/assets/010c9a7d-5720-46be-9dc0-f5808b8b9d7b">&nbsp;<img height="113" src="https://github.com/user-attachments/assets/a9159947-43d4-43ed-ba05-2a341bd1b112">
</p>
<br>

Build for Web:
- Small production bundles with unused modules removed
- Fast loading time
- Easy asset streaming
- Ingame level editor
- Object inspection in extension
- Components
- Make your own tools/editor
- Save/load levels
- Fast rendering ([Rapid](https://github.com/Nightre/Rapid.js))
- Fast hot reload (vite)
- Open source

<br>

<h1>Get Started</h1>
<ol>
    <li><a href="https://github.com/bare-engine/bare-template">Bare Template</a> - Start your Project</li>
    <li><a href="https://chromewebstore.google.com/detail/bare-engine/dbohigkcdpdnchgaffmofeoffnpkmphb">Chrome Extension</a> - Get the extension</li>
    <li><a href="https://github.com/bare-engine/bare-showcase">Bare Showcase</a> - Explore the engine's features</li>
    <li><a href="https://github.com/bare-engine/bare-demos">Bare Demos</a> - Explore game examples</li>
    <li><a href="https://bare-engine.github.io/bare-engine/">Documentation</a> - Learn more</li>
</ol>

<br>

<h1>Going Forward</h1>
Join the Discord if you have any questions or bug reports:<br>
https://discord.gg/zq3Qh45JE
<br><br>
🚧 Note: The engine is still in active development, some features may be unstable 🚧

## Contributing

For engine development, install dependencies in this repository with `npm install`. The documentation checks are tested with Node 24.19.0.

- `npm test`: build and run the browser fixture scenes in headless Chrome.
- `npm run dev:fixture`: open the browser fixtures for interactive debugging.
- `npm run docs:dev`: preview the documentation locally.
- `npm run docs:validate`: check example links, TypeScript, the built documentation, and executable examples.

See [the documentation contributor guide](docs/README.md) for sample checkout setup, individual checks, and how to add tested examples. Game projects use the template's scripts; this repository has its own development and test commands.
