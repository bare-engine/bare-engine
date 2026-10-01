import { defineConfig } from "vitepress";

export default defineConfig({
    title: "Bare Engine",
    // published on GitHub Pages at https://bare-engine.github.io/bare-engine/
    base: "/bare-engine/",
    description: "Bare Game Engine - Build for Web",
    srcExclude: ["README.md"],
    cleanUrls: true,
    themeConfig: {
        nav: [
            { text: "Guide", link: "/guide/getting-started" },
            { text: "Reference", link: "/reference/bare" },
        ],
        sidebar: [
            {
                text: "Introduction",
                items: [
                    { text: "Getting Started", link: "/guide/getting-started" },
                    { text: "Project Structure", link: "/guide/project-structure" },
                    { text: "Chrome Extension", link: "/guide/chrome-extension" },
                    { text: "Roadmap", link: "/guide/roadmap" },
                ],
            },
            {
                text: "Concepts",
                items: [
                    { text: "Scenes", link: "/guide/scenes" },
                    { text: "GameObjects", link: "/guide/game-objects" },
                    { text: "Prefabs", link: "/guide/prefabs" },
                    { text: "Levels & Layers", link: "/guide/levels-and-layers" },
                    { text: "Components", link: "/guide/components" },
                    { text: "Assets", link: "/guide/assets" },
                ],
            },
            {
                text: "Features",
                items: [
                    { text: "Events", link: "/guide/events" },
                    { text: "Animations", link: "/guide/animations" },
                    { text: "Particles", link: "/guide/particles" },
                    { text: "Text & UI", link: "/guide/text-and-ui" },
                    { text: "Rendering", link: "/guide/rendering" },
                    { text: "Level Editor", link: "/guide/level-editor" },
                    { text: "Custom GameObjects", link: "/guide/custom-game-objects" },
                    { text: "Resolution & Pixel Art", link: "/guide/resolution" },
                    { text: "Mobile & Touch", link: "/guide/mobile" },
                ],
            },
            {
                text: "Workflow",
                items: [
                    { text: "Debugging", link: "/guide/debugging" },
                    { text: "Building & Publishing", link: "/guide/building-and-publishing" },
                    { text: "Troubleshooting", link: "/guide/troubleshooting" },
                ],
            },
            {
                text: "Reference",
                items: [
                    { text: "The bare Object", link: "/reference/bare" },
                    { text: "Input", link: "/reference/input" },
                    { text: "Tweens", link: "/reference/tweens" },
                    { text: "Camera", link: "/reference/camera" },
                    { text: "Sound", link: "/reference/sound" },
                    { text: "Scene Manager", link: "/reference/scene-manager" },
                    { text: "Level", link: "/reference/level" },
                    { text: "Save Data", link: "/reference/save-data" },
                    { text: "Physics", link: "/reference/physics" },
                    { text: "Inspector Decorators", link: "/reference/inspector-decorators" },
                    { text: "Math & Helpers", link: "/reference/math" },
                    { text: "Globals", link: "/reference/globals" },
                    { text: "Configuration", link: "/reference/configuration" },
                    { text: "package.json Options", link: "/reference/package-json" },
                    { text: "Entity Component System", link: "/reference/ecs" },
                    { text: "Advanced", link: "/reference/advanced" },
                ],
            },
        ],
        socialLinks: [
            { icon: "github", link: "https://github.com/bare-engine/bare-engine" },
            { icon: "discord", link: "https://discord.gg/zq3Qh45JE" },
        ],
        search: { provider: "local" },
        outline: "deep",
        footer: { message: "Bare Engine is open source under the MIT license." },
    },
});
