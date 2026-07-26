const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const assetRoot = path.join(__dirname, '..', 'assets', 'chat-chrome');
const expected = [
    'status.png',
    'back.png',
    'more.png',
    'voice.png',
    'mic.png',
    'emoji.png',
    'plus.png',
];

test('ships cropped reference chat chrome as transparent PNGs', async () => {
    assert.deepEqual(
        fs.readdirSync(assetRoot).sort(),
        expected.slice().sort(),
    );
    for (const file of expected) {
        const metadata = await sharp(path.join(assetRoot, file)).metadata();
        assert.equal(metadata.format, 'png');
        assert.equal(metadata.hasAlpha, true);
        assert.ok(metadata.width > 20);
        assert.ok(metadata.height > 20);
    }
});
