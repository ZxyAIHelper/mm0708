const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const avatarRoot = path.join(__dirname, '..', 'assets', 'chat-avatars');

test('chat avatar SVGs have square intrinsic dimensions for canvas drawing', () => {
    const files = fs.readdirSync(avatarRoot)
        .filter((file) => file.endsWith('.svg'));

    assert.equal(files.length, 8);
    for (const file of files) {
        const source = fs.readFileSync(
            path.join(avatarRoot, file),
            'utf8',
        );
        assert.match(
            source,
            /^<svg [^>]*width="88"[^>]*height="88"[^>]*viewBox="0 0 88 88"/,
            file,
        );
    }
});
