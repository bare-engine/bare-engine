import { defineConfig } from "vitepress";

export default defineConfig({
    title: "Bare Engine",
    description: "Bare Game Engine - Build for Web",
    srcExclude: ["README.md"],
    cleanUrls: true,
    themeConfig: {
        nav: [
            { text: "Getting Started", link: "/getting-started" },
        ],
        sidebar: [
            {
                text: "Guide",
                items: [
                    { text: "Getting Started", link: "/getting-started" },
                    { text: "Core Concepts", link: "/core-concepts" },
                ],
            },
        ],
        socialLinks: [
            { icon: "github", link: "https://github.com/BareEngine/Engine" },
            { icon: "discord", link: "https://discord.gg/zq3Qh45JE" },
        ],
        search: { provider: "local" },
        footer: { message: "Bare Engine is open source under the MIT license." },
    },
});
