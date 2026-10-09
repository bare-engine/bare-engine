# Docs

Source for the Bare Engine documentation site, built with [VitePress](https://vitepress.dev).

## Local setup

Use Node 24.19.0 to reproduce the documented checks, run `npm install` in the engine root, then `npm run docs:dev`. Open the URL printed by VitePress (normally `http://localhost:5173/bare-engine/`). On PowerShell installations that block `npm.ps1`, use `npm.cmd`.

## Checks

| Command | Coverage |
| --- | --- |
| `npm run docs:check` | Check sample GitHub links against local checkouts (files and line ranges), then verify marked example blocks match their source files. Add `-- --verbose` to review the linked content. |
| `npm run docs:check-examples` | Type-check engine, fixtures, and the shared documentation examples. |
| `npm run docs:build` | Build VitePress to `docs/.vitepress/dist`. |
| `npm run docs:check-site` | Check local links, heading fragments, and images in the **built** site. Build first to avoid checking stale output. |
| `npm run docs:test` | Run the shared examples in headless Chrome, including movement, inspector state, and cleanup behavior. |
| `npm run docs:validate` | Run all the above in order. Requires the example checkouts and Chrome. |

`npm test` runs all browser fixture scenes. `npm run dev:fixture -- docsExamplesTest` opens the documentation example test fixture for debugging. Selenium may need network access on its first run to obtain a matching browser driver.

The example link check expects these sibling directories. From the directory containing your engine checkout:

```sh
git clone https://github.com/bare-engine/bare-template BareTemplate
git clone https://github.com/bare-engine/bare-platformer BarePlatformer
git clone https://github.com/bare-engine/bare-shmup BareShmup
git clone https://github.com/bare-engine/bare-rpg BareRPG
git clone https://github.com/bare-engine/bare-trust BareTrust
git clone https://github.com/bare-engine/bare-showcase BareDemos
git clone https://github.com/bare-engine/bare-resolution-demo BareResolutionDemo
```

The folder name `BareDemos` intentionally maps to the Showcase repo. This checker uses local files, not live GitHub responses; a passing check does not prove a remote link is reachable or still illustrates the surrounding prose. Review line-linked examples with `--verbose` after updating a sample checkout. Prefer commit permalinks for examples that need stable line references: replace `main` with a full 40-character commit SHA that has been published, and fetch that commit in the local checkout. Pinned links are checked against `git show` at that revision, not the working tree.

## Editing

Create a Markdown file in `guide/` or `reference/`, then add it to `.vitepress/config.mts`. Guides explain a task; references specify parameters, return values, defaults, units, and lifecycle effects. Label incomplete fragments clearly and include imports in complete examples.

Complete checked examples live in `features/fixtures/src/docExamples/`. Copy the source file's full contents into a fenced `ts` code block, with an `<!-- example: ../../features/fixtures/src/docExamples/file.ts -->` comment immediately above the opening fence. The source path is relative to the Markdown file. This keeps examples readable both on the site and as plain Markdown in the npm package; the checker rejects VitePress includes.

After editing an example source file, run `node scripts/checkDocsExamples.cjs --fix` from the engine root to update its marked blocks. `npm run docs:check` verifies that the blocks and source files match. Add behavior assertions to `docsExamplesTest.ts`; do not copy examples into a second implementation. Other inline fragments are not automatically type-checked.

Use relative page links and explicit heading fragments. Link to Discord as `[Discord](discord:)`; the invite URL lives only in `.vitepress/config.mts`. Public images live in `docs/public/images/` and are linked as `/images/name.svg` or `/images/name.png`; VitePress applies the site's base path. Give every image useful alt text. Keep screenshots free of private data and record their provenance in this file.
