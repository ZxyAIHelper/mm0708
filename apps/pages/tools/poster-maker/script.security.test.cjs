const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('browser script does not embed image API credentials', () => {
    const source = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');

    assert.equal(/DIRECT_IMAGE_API/.test(source), false, 'direct browser API config must be absent');
    assert.equal(/Authorization\s*:\s*`Bearer/.test(source), false, 'browser bearer header must be absent');
    assert.equal(/\bcr_[a-z0-9]{20,}\b/i.test(source), false, 'embedded credential must be absent');
});

test('local development server reads credentials from the environment', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'dev-server.js'), 'utf8');

    assert.equal(/DOUBAO_API_KEY\s*=\s*process\.env\.DOUBAO_API_KEY/.test(source), true, 'API key must come from process.env');
    assert.equal(/DOUBAO_API_KEY\s*=\s*['"][^'"]+['"]/.test(source), false, 'hardcoded API key must be absent');
});
