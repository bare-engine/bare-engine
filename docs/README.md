# Docs

Source for the Bare Engine documentation site, built with [VitePress](https://vitepress.dev).

- Preview: `npm run docs:dev` (opens http://localhost:5173/bare-engine/)
- Build: `npm run docs:build` (output in `docs/.vitepress/dist`)
- Check example links: `npm run docs:check` (add `-- --verbose` to see every linked line). Needs the sample projects checked out next to this repo, eg `../BarePlatformer`.
- Add a page: create a `.md` file here and add it to the sidebar in `.vitepress/config.mts`.
