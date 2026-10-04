#!/usr/bin/env node
// Capture the actual editor UI with a deterministic scene and no external art.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { renderFixtureHtml } = require('../features/fixtures/renderFixtureHtml.cjs');

async function main() {
    const root = path.resolve(__dirname, '..');
    const build = spawnSync(process.execPath, [
        path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config',
        path.join(root, 'features/fixtures/vite.e2e.config.cjs'),
    ], { cwd: path.join(root, 'features/fixtures'), stdio: 'inherit' });
    if (build.status !== 0) throw new Error('Fixture build failed');

    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/') {
            response.setHeader('Content-Type', 'text/html');
            response.end(renderFixtureHtml('<script defer src="/browser-tests.js"></script>'));
        } else if (url.pathname === '/api/list-files') {
            response.setHeader('Content-Type', 'application/json');
            response.end('{"files":[]}');
        } else if (url.pathname === '/images/PIXEL.webp') {
            // The scene uses the engine's built-in white pixel; the HTML sidebar
            // needs an HTTP image too. Serve the same plain white swatch as SVG.
            response.setHeader('Content-Type', 'image/svg+xml');
            response.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="white" d="M0 0h32v32H0z"/></svg>');
        } else {
            const files = {
                '/browser-tests.js': ['features/fixtures/public/browser-tests.js', 'text/javascript'],
                '/editor.html': ['config/editor.html', 'text/html'],
            };
            const entry = files[url.pathname];
            if (!entry) { response.writeHead(404); response.end(); return; }
            response.setHeader('Content-Type', entry[1]);
            response.end(fs.readFileSync(path.join(root, entry[0])));
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let driver;
    try {
        driver = await new Builder().forBrowser('chrome').setChromeOptions(
            new chrome.Options().addArguments('--headless=new', '--remote-debugging-pipe', '--window-size=1280,900')
        ).build();
        await driver.get(`http://localhost:${server.address().port}/`);
        await driver.wait(() => driver.executeScript('return !!window.__bareDocsPreview'), 10000);
        const error = await driver.executeAsyncScript(function (done) {
            window.__bareDocsPreview().then(() => {
                requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
            }, error => done(String(error)));
        });
        if (error) throw new Error(error);
        await driver.wait(() => driver.executeScript(
            'return [...document.images].every(img => img.complete && img.naturalWidth > 0)'
        ), 10000, 'Editor preview images must load before capture');
        const output = path.join(root, 'docs/public/images/level-editor.png');
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, await driver.takeScreenshot(), 'base64');
        console.log(`Saved ${output}`);
    } finally {
        if (driver) await driver.quit();
        await new Promise(resolve => server.close(resolve));
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
