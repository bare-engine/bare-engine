import { defineConfig } from "vitepress";

// the only copy of the discord invite in the docs; pages link to it as [Discord](discord:)
const discord = "https://discord.gg/zq3Qh45JE";

export default defineConfig({
    title: "Bare Engine",
    // published on GitHub Pages at https://bare-engine.github.io/bare-engine/
    base: "/bare-engine/",
    description: "A small, fast game engine for the web.",
    lastUpdated: true,
    srcExclude: ["README.md"],
    cleanUrls: true,
    markdown: {
        config(md) {
            md.core.ruler.push("discord_link", state => {
                for (const block of state.tokens)
                    for (const token of block.children ?? [])
                        if (token.type == "link_open" && token.attrGet("href") == "discord:")
                            token.attrSet("href", discord);
            });
        },
    },
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
                    { text: "Build Your First Game", link: "/guide/first-game" },
                    { text: "Project Structure", link: "/guide/project-structure" },
                    { text: "Examples", link: "/guide/examples" },
                    { text: "Chrome Extension", link: "/guide/chrome-extension" },
                ],
            },
            {
                text: "Concepts",
                items: [
                    { text: "Scenes", link: "/guide/scenes" },
                    { text: "Lifecycle & Cleanup", link: "/guide/lifecycle" },
                    { text: "GameObjects", link: "/guide/game-objects" },
                    { text: "Custom GameObjects", link: "/guide/custom-game-objects" },
                    { text: "Prefabs", link: "/guide/prefabs" },
                    { text: "settingsData.json", link: "/guide/settings-data" },
                    { text: "Components", link: "/guide/components" },
                    { text: "Levels & Layers", link: "/guide/levels-and-layers" },
                    { text: "Level Editor", link: "/guide/level-editor" },
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
                    { text: "Roadmap", link: "/guide/roadmap" },
                ],
            },
            {
                text: "Reference",
                items: [
                    { text: "The bare Object", link: "/reference/bare" },
                    { text: "Objects", link: "/reference/objects" },
                    { text: "Input", link: "/reference/input" },
                    { text: "Tweens", link: "/reference/tweens" },
                    { text: "Camera", link: "/reference/camera" },
                    { text: "Sound", link: "/reference/sound" },
                    { text: "Assets", link: "/reference/assets" },
                    { text: "Scene Manager", link: "/reference/scene-manager" },
                    { text: "Level", link: "/reference/level" },
                    { text: "Save Data", link: "/reference/save-data" },
                    { text: "Physics", link: "/reference/physics" },
                    { text: "Inspector Decorators", link: "/reference/inspector-decorators" },
                    { text: "Math & Utilities", link: "/reference/math" },
                    { text: "Globals", link: "/reference/globals" },
                    { text: "Configuration", link: "/reference/configuration" },
                    { text: "package.json Options", link: "/reference/package-json" },
                    { text: "Entity Component System", link: "/reference/ecs" },
                ],
            },
        ],
        editLink: {
            pattern: "https://github.com/bare-engine/bare-engine/edit/main/docs/:path",
            text: "Edit this page on GitHub",
        },
        socialLinks: [
            { icon: "github", link: "https://github.com/bare-engine/bare-engine" },
            { icon: "discord", link: discord },
        ],
        search: { provider: "local" },
        outline: "deep",
        footer: { message: "Bare Engine is open source under the MIT license." },
    },
});
