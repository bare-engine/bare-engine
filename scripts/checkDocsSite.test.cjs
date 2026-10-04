const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('rendered-site checker validates clean URLs, encoded anchors, and images', () => {
    const site = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-docs-links-'));
    try {
        fs.mkdirSync(path.join(site, 'guide'));
        fs.mkdirSync(path.join(site, 'images'));
        fs.writeFileSync(path.join(site, 'images', 'test image.svg'), '<svg/>');
        fs.writeFileSync(path.join(site, 'index.html'),
            '<a href="/bare-engine/guide/example#save%40field">Example</a>');
        fs.writeFileSync(path.join(site, 'guide', 'example.html'), [
            '<h2 id="save@field">Save</h2>',
            '<a href="../index.html">Home</a>',
            '<a href="#save%40field">Here</a>',
            '<img src="/bare-engine/images/test%20image.svg">',
            '<a href="https://example.com/remote">External</a>',
        ].join('\n'));
        const run = () => spawnSync(process.execPath, [path.join(__dirname, 'checkDocsSite.cjs'), site], { encoding: 'utf8' });
        const valid = run();
        assert.equal(valid.status, 0, valid.stderr);
        assert.match(valid.stdout, /checked 4 rendered links\/images, 0 problems/);

        fs.appendFileSync(path.join(site, 'index.html'), [
            '<a href="/bare-engine/guide/example#missing">Broken heading</a>',
            '<a href="/bare-engine/guide/missing">Broken page</a>',
            '<img src="/bare-engine/images/missing.png">',
            '<a href="/guide/example">Missing base path</a>',
        ].join('\n'));
        const invalid = run();
        assert.equal(invalid.status, 1);
        assert.match(invalid.stderr, /missing anchor/);
        assert.match(invalid.stderr, /missing target.*guide\/missing/);
        assert.match(invalid.stderr, /missing target.*missing\.png/);
        assert.match(invalid.stderr, /outside site base/);
        assert.match(invalid.stdout, /4 problems/);
    } finally {
        // Only remove the unique temporary directory created above.
        fs.rmSync(site, { recursive: true, force: true });
    }
});
