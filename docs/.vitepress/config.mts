import { defineConfig } from "vitepress";

export default defineConfig({
    title: "Bare Engine",
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
                    { text: "Configuration", link: "/reference/configuration" },
                    { text: "package.json Options", link: "/reference/package-json" },
                ],
            },
        ],
        socialLinks: [
            { icon: "github", link: "https://github.com/BareEngine/Engine" },
            { icon: "discord", link: "https://discord.gg/zq3Qh45JE" },
        ],
        search: { provider: "local" },
        outline: "deep",
        footer: { message: "Bare Engine is open source under the MIT license." },
    },
});
