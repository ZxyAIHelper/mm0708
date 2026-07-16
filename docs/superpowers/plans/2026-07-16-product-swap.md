# Product Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent `apps/product-swap` web app that recreates the supplied one-click product replacement experience, uses Codex CLI as a temporary local image provider, and exposes a stable provider boundary for a later Volcengine implementation.

**Architecture:** The new app is a dependency-light static HTML/CSS/JavaScript frontend served by a small Node development server. The local server owns validation, temporary-file handling, serialization, and Codex CLI execution; the production API contract is mirrored by a Hono route in `apps/my-cloud-hub`, whose provider implementation remains isolated from the frontend.

**Tech Stack:** HTML5, CSS, browser JavaScript, Node.js built-in HTTP/process/test modules, Puppeteer Core for browser smoke tests, Hono, TypeScript, Vitest, Cloudflare Workers.

---

## File Map

Create:

- `apps/product-swap/package.json` — app scripts and local test dependencies.
- `apps/product-swap/index.html` — screenshot-matching page structure.
- `apps/product-swap/style.css` — mobile-first visual implementation.
- `apps/product-swap/script.js` — uploads, validation, API request, result state, download.
- `apps/product-swap/assets/example-template.jpg` — cropped target-template example.
- `apps/product-swap/assets/example-product.jpg` — cropped product example.
- `apps/product-swap/assets/example-result.jpg` — cropped generated-result example.
- `apps/product-swap/server/dev-server.js` — static server, API handler, request validation, temporary files, serial queue.
- `apps/product-swap/server/codex-cli-provider.js` — prompt construction and safe `codex exec` invocation.
- `apps/product-swap/tests/request-validation.test.js` — server input-contract tests.
- `apps/product-swap/tests/codex-cli-provider.test.js` — provider prompt, CLI arguments, and queue tests.
- `apps/product-swap/tests/dev-server.test.js` — HTTP integration tests with an injected fake provider.
- `apps/product-swap/tests/frontend-contract.test.js` — HTML and browser helper contract tests.
- `apps/product-swap/tests/browser-smoke.js` — real Chrome interaction and screenshot smoke test.
- `apps/my-cloud-hub/src/projects/product-swap/provider.ts` — shared production provider types and stable errors.
- `apps/my-cloud-hub/src/projects/product-swap/volcano-provider.ts` — reserved Volcengine provider boundary.
- `apps/my-cloud-hub/src/projects/product-swap/router.ts` — `/generate` route and validation.
- `apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts` — Hono route tests.

Modify:

- `apps/my-cloud-hub/src/index.ts` — mount `/api/product-swap` and extend bindings.
- `pnpm-lock.yaml` — record the new workspace app dependency after `pnpm install`.

Do not modify:

- `apps/pages/**` — the feature is a sibling application, not a Pages tool.
- Existing unrelated dirty-worktree files.

### Task 1: Scaffold the Independent App and Request Contract

**Files:**

- Create: `apps/product-swap/package.json`
- Create: `apps/product-swap/index.html`
- Create: `apps/product-swap/style.css`
- Create: `apps/product-swap/script.js`
- Create: `apps/product-swap/server/dev-server.js`
- Create: `apps/product-swap/tests/request-validation.test.js`

- [ ] **Step 1: Write failing request-validation tests**

Create `apps/product-swap/tests/request-validation.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateGenerateRequest,
  decodeImageDataUrl
} = require('../server/dev-server');

const tinyPng = 'data:image/png;base64,iVBORw0KGgo=';

test('requires targetImage', () => {
  assert.throws(
    () => validateGenerateRequest({ requirements: '' }),
    (error) => error.code === 'INVALID_INPUT'
  );
});

test('accepts supported images and trims requirements', () => {
  const value = validateGenerateRequest({
    targetImage: tinyPng,
    productImage: '',
    sceneImage: '',
    requirements: '  保持三个托盘  '
  });
  assert.equal(value.requirements, '保持三个托盘');
});

test('rejects requirements longer than 200 characters', () => {
  assert.throws(
    () => validateGenerateRequest({
      targetImage: tinyPng,
      requirements: '菜'.repeat(201)
    }),
    (error) => error.code === 'INVALID_INPUT'
  );
});

test('decodes supported Data URLs and rejects unsupported MIME types', () => {
  const decoded = decodeImageDataUrl(tinyPng, 'targetImage');
  assert.equal(decoded.mimeType, 'image/png');
  assert.ok(Buffer.isBuffer(decoded.buffer));

  assert.throws(
    () => decodeImageDataUrl('data:image/gif;base64,R0lGODlh', 'targetImage'),
    (error) => error.code === 'UNSUPPORTED_IMAGE'
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test apps/product-swap/tests/request-validation.test.js
```

Expected: FAIL because `apps/product-swap/server/dev-server.js` does not exist.

- [ ] **Step 3: Create the package and minimal app files**

Create `apps/product-swap/package.json`:

```json
{
  "name": "product-swap",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "node server/dev-server.js",
    "test": "node --test tests/*.test.js",
    "test:browser": "node tests/browser-smoke.js"
  },
  "devDependencies": {
    "puppeteer-core": "^24.0.0"
  }
}
```

Create minimal `index.html`, `style.css`, and `script.js` shells so static serving has a valid entry point:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>一键换产品</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <main id="app"></main>
  <script src="/script.js"></script>
</body>
</html>
```

```css
:root { color-scheme: dark; }
body { margin: 0; background: #080b17; color: #f7f8ff; }
```

```js
'use strict';
```

- [ ] **Step 4: Implement validation and Data URL decoding**

In `apps/product-swap/server/dev-server.js`, define:

```js
'use strict';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp']
]);

class ProductSwapError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ProductSwapError';
    this.code = code;
    this.status = status;
  }
}

function decodeImageDataUrl(value, fieldName) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(value || ''));
  if (!match) {
    throw new ProductSwapError('INVALID_INPUT', `${fieldName} 不是有效图片`);
  }
  const mimeType = match[1].toLowerCase();
  const extension = SUPPORTED_MIME_TYPES.get(mimeType);
  if (!extension) {
    throw new ProductSwapError('UNSUPPORTED_IMAGE', '仅支持 JPG、PNG、WebP');
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    throw new ProductSwapError('INVALID_INPUT', `${fieldName} 图片为空`);
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ProductSwapError('FILE_TOO_LARGE', '单张图片不能超过 10MB');
  }
  return { buffer, mimeType, extension };
}

function validateGenerateRequest(body = {}) {
  if (!body.targetImage) {
    throw new ProductSwapError('INVALID_INPUT', '请上传目标图');
  }
  const requirements = String(body.requirements || '').trim();
  if (requirements.length > 200) {
    throw new ProductSwapError('INVALID_INPUT', '额外要求不能超过 200 字');
  }
  return {
    targetImage: decodeImageDataUrl(body.targetImage, 'targetImage'),
    productImage: body.productImage
      ? decodeImageDataUrl(body.productImage, 'productImage')
      : null,
    sceneImage: body.sceneImage
      ? decodeImageDataUrl(body.sceneImage, 'sceneImage')
      : null,
    requirements
  };
}

module.exports = {
  MAX_IMAGE_BYTES,
  ProductSwapError,
  decodeImageDataUrl,
  validateGenerateRequest
};
```

Do not start the server at module import time; the listening entry point is added in Task 3.

- [ ] **Step 5: Run the tests**

Run:

```powershell
node --test apps/product-swap/tests/request-validation.test.js
```

Expected: 4 tests PASS.

- [ ] **Step 6: Install the new workspace dependency**

Run:

```powershell
pnpm install
```

Expected: `product-swap` is detected from the existing `apps/*` workspace pattern and `pnpm-lock.yaml` is updated.

- [ ] **Step 7: Commit the scaffold and contract**

```powershell
git add apps/product-swap/package.json apps/product-swap/index.html apps/product-swap/style.css apps/product-swap/script.js apps/product-swap/server/dev-server.js apps/product-swap/tests/request-validation.test.js pnpm-lock.yaml
git commit -m "feat: scaffold product swap app"
```

### Task 2: Build the Codex CLI Provider

**Files:**

- Create: `apps/product-swap/server/codex-cli-provider.js`
- Create: `apps/product-swap/tests/codex-cli-provider.test.js`

- [ ] **Step 1: Write failing provider tests**

Create `apps/product-swap/tests/codex-cli-provider.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCodexPrompt,
  buildCodexArgs,
  createSerialQueue
} = require('../server/codex-cli-provider');

test('prompt assigns each image a stable role', () => {
  const prompt = buildCodexPrompt({
    hasProductImage: true,
    hasSceneImage: true,
    requirements: '保持三个托盘'
  });
  assert.match(prompt, /第一张图是目标模板/);
  assert.match(prompt, /第二张图是需要换入的产品/);
  assert.match(prompt, /第三张图只作为场景参考/);
  assert.match(prompt, /保持三个托盘/);
  assert.match(prompt, /result\.png/);
});

test('CLI args use repeated image options without a shell', () => {
  const args = buildCodexArgs({
    taskDir: 'C:\\temp\\swap',
    imagePaths: ['C:\\temp\\target.jpg', 'C:\\temp\\product.jpg'],
    prompt: '生成图片'
  });
  assert.equal(args[0], 'exec');
  assert.ok(args.includes('--ephemeral'));
  assert.deepEqual(
    args.filter((value) => value === '-i'),
    ['-i', '-i']
  );
  assert.equal(args.at(-1), '生成图片');
});

test('serial queue does not overlap jobs', async () => {
  const enqueue = createSerialQueue();
  const events = [];
  const first = enqueue(async () => {
    events.push('first:start');
    await new Promise((resolve) => setTimeout(resolve, 20));
    events.push('first:end');
  });
  const second = enqueue(async () => {
    events.push('second:start');
    events.push('second:end');
  });
  await Promise.all([first, second]);
  assert.deepEqual(events, [
    'first:start',
    'first:end',
    'second:start',
    'second:end'
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test apps/product-swap/tests/codex-cli-provider.test.js
```

Expected: FAIL because the provider module does not exist.

- [ ] **Step 3: Implement the prompt, arguments, queue, and process runner**

Create `apps/product-swap/server/codex-cli-provider.js` with:

```js
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

function buildCodexPrompt({ hasProductImage, hasSceneImage, requirements }) {
  const roles = [
    '第一张图是目标模板。保持它的宽高比、镜头、构图、商品数量、排列、背景和光线。',
    hasProductImage
      ? '第二张图是需要换入的产品。保留其形状、颜色、包装、餐具和关键识别特征。'
      : '没有提供产品图，请根据用户额外要求生成需要换入的商品。',
    hasSceneImage
      ? '第三张图只作为场景参考。只吸收环境和氛围，不改变产品本身。'
      : '',
    '只替换目标模板中的菜品或商品，不增加文字、Logo、水印或额外商品。',
    requirements ? `用户额外要求：${requirements}` : '',
    '使用可用的图片编辑能力生成一张结果图，并将最终文件保存为当前工作目录下的 result.png。不要只描述结果。'
  ];
  return roles.filter(Boolean).join('\n');
}

function buildCodexArgs({ taskDir, imagePaths, prompt }) {
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--ephemeral',
    '--sandbox',
    'workspace-write',
    '--ask-for-approval',
    'never',
    '-C',
    taskDir
  ];
  for (const imagePath of imagePaths) {
    args.push('-i', imagePath);
  }
  args.push(prompt);
  return args;
}

function createSerialQueue() {
  let tail = Promise.resolve();
  return function enqueue(task) {
    const current = tail.then(task, task);
    tail = current.catch(() => undefined);
    return current;
  };
}

async function generateWithCodex({
  taskDir,
  imagePaths,
  requirements,
  timeoutMs = 300000,
  spawnImpl = spawn
}) {
  const prompt = buildCodexPrompt({
    hasProductImage: imagePaths.length >= 2,
    hasSceneImage: imagePaths.length >= 3,
    requirements
  });
  const args = buildCodexArgs({ taskDir, imagePaths, prompt });

  await new Promise((resolve, reject) => {
    const child = spawnImpl('codex', args, {
      cwd: taskDir,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    const timer = setTimeout(() => {
      child.kill();
      const error = new Error('Codex generation timed out');
      error.code = 'CODEX_TIMEOUT';
      reject(error);
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      error.code = error.code === 'ENOENT'
        ? 'CODEX_CLI_UNAVAILABLE'
        : 'CODEX_GENERATION_FAILED';
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const error = new Error(stderr || `Codex exited with code ${code}`);
      error.code = 'CODEX_GENERATION_FAILED';
      reject(error);
    });
  });

  const resultPath = path.join(taskDir, 'result.png');
  try {
    const imageBuffer = await fs.readFile(resultPath);
    return { imageBuffer, mimeType: 'image/png', provider: 'codex-cli' };
  } catch {
    const error = new Error('Codex did not create result.png');
    error.code = 'RESULT_IMAGE_NOT_FOUND';
    throw error;
  }
}

module.exports = {
  buildCodexPrompt,
  buildCodexArgs,
  createSerialQueue,
  generateWithCodex
};
```

- [ ] **Step 4: Run provider tests**

Run:

```powershell
node --test apps/product-swap/tests/codex-cli-provider.test.js
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the provider**

```powershell
git add apps/product-swap/server/codex-cli-provider.js apps/product-swap/tests/codex-cli-provider.test.js
git commit -m "feat: add codex product swap provider"
```

### Task 3: Complete the Local HTTP Server

**Files:**

- Modify: `apps/product-swap/server/dev-server.js`
- Create: `apps/product-swap/tests/dev-server.test.js`

- [ ] **Step 1: Write failing HTTP integration tests**

Create `apps/product-swap/tests/dev-server.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createProductSwapServer } = require('../server/dev-server');

const tinyPng = 'data:image/png;base64,iVBORw0KGgo=';

test('serves the app and returns an injected generated image', async (t) => {
  const server = createProductSwapServer({
    provider: async () => ({
      imageBuffer: Buffer.from('result'),
      mimeType: 'image/png',
      provider: 'fake'
    })
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();

  const page = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /一键换产品/);

  const response = await fetch(
    `http://127.0.0.1:${port}/api/product-swap/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetImage: tinyPng })
    }
  );
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.provider, 'fake');
  assert.match(data.imageUrl, /^data:image\/png;base64,/);
});

test('returns stable validation errors', async (t) => {
  const server = createProductSwapServer({ provider: async () => null });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const response = await fetch(
    `http://127.0.0.1:${port}/api/product-swap/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }
  );
  const data = await response.json();
  assert.equal(response.status, 400);
  assert.equal(data.error.code, 'INVALID_INPUT');
});
```

- [ ] **Step 2: Run the integration test to verify it fails**

Run:

```powershell
node --test apps/product-swap/tests/dev-server.test.js
```

Expected: FAIL because `createProductSwapServer` is not implemented.

- [ ] **Step 3: Implement static serving, JSON handling, temp files, and cleanup**

Extend `apps/product-swap/server/dev-server.js` with Node built-ins:

```js
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  createSerialQueue,
  generateWithCodex
} = require('./codex-cli-provider');

const APP_ROOT = path.resolve(__dirname, '..');
const enqueueGeneration = createSerialQueue();
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

async function readJsonBody(request, limit = 42 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      throw new ProductSwapError('FILE_TOO_LARGE', '上传内容过大', 413);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new ProductSwapError('INVALID_INPUT', '请求格式无效');
  }
}

async function writeInputImage(taskDir, name, image) {
  if (!image) return null;
  const filePath = path.join(taskDir, `${name}${image.extension}`);
  await fsp.writeFile(filePath, image.buffer);
  return filePath;
}
```

Implement the server helpers and request handler:

```js
function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(value));
}

function mapServerError(error) {
  if (error instanceof ProductSwapError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  const known = new Set([
    'CODEX_CLI_UNAVAILABLE',
    'CODEX_GENERATION_FAILED',
    'CODEX_TIMEOUT',
    'RESULT_IMAGE_NOT_FOUND'
  ]);
  const code = known.has(error?.code)
    ? error.code
    : 'CODEX_GENERATION_FAILED';
  const messages = {
    CODEX_CLI_UNAVAILABLE: '本机没有可用的 Codex CLI',
    CODEX_GENERATION_FAILED: '本地生成失败，请稍后重试',
    CODEX_TIMEOUT: '生成超时，请稍后重试',
    RESULT_IMAGE_NOT_FOUND: 'Codex 没有生成结果图片'
  };
  return { status: 500, code, message: messages[code] };
}

async function handleGenerate(request, response, provider) {
  const requestId = `swap_${crypto.randomUUID()}`;
  let taskDir = '';
  try {
    const body = await readJsonBody(request);
    const input = validateGenerateRequest(body);
    taskDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'product-swap-'));
    const imagePaths = [];
    imagePaths.push(await writeInputImage(taskDir, 'target', input.targetImage));
    const productPath = await writeInputImage(
      taskDir,
      'product',
      input.productImage
    );
    const scenePath = await writeInputImage(taskDir, 'scene', input.sceneImage);
    if (productPath) imagePaths.push(productPath);
    if (scenePath) imagePaths.push(scenePath);

    const result = await enqueueGeneration(() => provider({
      taskDir,
      imagePaths,
      requirements: input.requirements,
      requestId
    }));
    sendJson(response, 200, {
      success: true,
      imageUrl: `data:${result.mimeType};base64,${result.imageBuffer.toString('base64')}`,
      provider: result.provider,
      requestId
    });
  } catch (error) {
    const mapped = mapServerError(error);
    sendJson(response, mapped.status, {
      success: false,
      error: { code: mapped.code, message: mapped.message },
      requestId
    });
  } finally {
    if (taskDir) {
      await fsp.rm(taskDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function resolveStaticPath(urlPath) {
  const pathname = decodeURIComponent(new URL(urlPath, 'http://local').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const resolved = path.resolve(APP_ROOT, relative);
  if (resolved !== APP_ROOT && !resolved.startsWith(`${APP_ROOT}${path.sep}`)) {
    return null;
  }
  return resolved;
}

async function serveStatic(request, response) {
  const filePath = resolveStaticPath(request.url || '/');
  if (!filePath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw new Error('Not a file');
    const body = await fsp.readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()]
        || 'application/octet-stream'
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}

function createProductSwapServer({ provider = generateWithCodex } = {}) {
  return http.createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    const pathname = new URL(request.url || '/', 'http://local').pathname;
    if (
      pathname.replace(/\/+$/, '') === '/api/product-swap/generate'
      && request.method === 'POST'
    ) {
      await handleGenerate(request, response, provider);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405);
      response.end('Method not allowed');
      return;
    }
    await serveStatic(request, response);
  });
}
```

Finish with:

```js
if (require.main === module) {
  const port = Number(process.env.PORT || 8791);
  const server = createProductSwapServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Product Swap running at http://127.0.0.1:${port}`);
  });
}

module.exports = {
  MAX_IMAGE_BYTES,
  ProductSwapError,
  decodeImageDataUrl,
  validateGenerateRequest,
  createProductSwapServer
};
```

- [ ] **Step 4: Run all server tests**

Run:

```powershell
pnpm --filter product-swap test
```

Expected: request, provider, and HTTP tests PASS.

- [ ] **Step 5: Commit the local server**

```powershell
git add apps/product-swap/server/dev-server.js apps/product-swap/tests/dev-server.test.js
git commit -m "feat: add local product swap api"
```

### Task 4: Extract Reference Assets and Recreate the Page

**Files:**

- Modify: `apps/product-swap/index.html`
- Modify: `apps/product-swap/style.css`
- Create: `apps/product-swap/assets/example-template.jpg`
- Create: `apps/product-swap/assets/example-product.jpg`
- Create: `apps/product-swap/assets/example-result.jpg`
- Create: `apps/product-swap/tests/frontend-contract.test.js`

- [ ] **Step 1: Write a failing HTML contract test**

Create the first portion of `apps/product-swap/tests/frontend-contract.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('page exposes the screenshot-matching controls', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const id of [
    'targetInput',
    'productInput',
    'sceneInput',
    'requirementsInput',
    'generateButton',
    'resultImage'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /生成（消耗 3 豆额度）/);
  assert.match(html, /最多200字/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test apps/product-swap/tests/frontend-contract.test.js
```

Expected: FAIL because the final controls are absent.

- [ ] **Step 3: Extract the three reference assets**

Use the `imagegen` skill with the user-provided screenshot as the source image and request exact crop-only extraction with no regeneration:

- Target/template: the three green trays shown in the required target upload.
- Product: the mushroom dish shown in the product upload.
- Result: the large three-tray mushroom result.

Save the outputs using the exact asset paths above. Inspect each asset once with the image viewer and reject any output that changes product details rather than cropping.

- [ ] **Step 4: Implement the complete page markup**

Replace `apps/product-swap/index.html` with semantic sections containing:

```html
<body>
  <main class="product-swap-shell">
    <button class="back-button" id="backButton" type="button">← 返回</button>
    <header class="intro">
      <h1>一键换产品</h1>
      <p>上传一张满意的样图（目标图），再传你的产品图或场景图，自动换成你的产品。</p>
      <p class="tip">提示：样图尽量避免含文字、品牌或水印，可能被 AI 安全系统拒绝。</p>
    </header>

    <section class="example-card" aria-labelledby="exampleTitle">
      <p id="exampleTitle">效果示例 · 样图换成你的产品</p>
      <div class="example-equation">
        <figure><img src="assets/example-template.jpg" alt="样图模板"><figcaption>① 样图模板</figcaption></figure>
        <span>+</span>
        <figure><img src="assets/example-product.jpg" alt="你的产品"><figcaption>② 你的产品</figcaption></figure>
        <span>=</span>
        <figure><img src="assets/example-result.jpg" alt="换好的效果"><figcaption>③ 换好的效果</figcaption></figure>
      </div>
    </section>

    <form id="swapForm" novalidate>
      <section class="upload-field" data-slot="target">
        <label>目标图（样图模板） <span>*</span></label>
        <input id="targetInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>
        <button class="upload-box" data-input="targetInput" type="button"><span>点击上传</span></button>
        <button class="remove-image" data-remove="target" type="button" hidden>删除</button>
      </section>
      <section class="upload-field" data-slot="product">
        <label>产品图 <small>（选填）</small></label>
        <input id="productInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>
        <button class="upload-box" data-input="productInput" type="button"><span>点击上传</span></button>
        <button class="remove-image" data-remove="product" type="button" hidden>删除</button>
      </section>
      <section class="upload-field" data-slot="scene">
        <label>场景图 <small>（选填）</small></label>
        <input id="sceneInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>
        <button class="upload-box dashed" data-input="sceneInput" type="button"><span>点击上传</span></button>
        <button class="remove-image" data-remove="scene" type="button" hidden>删除</button>
      </section>
      <textarea id="requirementsInput" maxlength="200" placeholder="额外要求（选填，仅微调风格/细节，最多200字）"></textarea>
      <p id="formError" class="form-error" role="alert" hidden></p>
      <button id="generateButton" class="generate-button" type="submit">生成（消耗 3 豆额度）</button>
    </form>

    <section id="resultSection" class="result-card" hidden>
      <img id="resultImage" alt="换品结果">
      <div class="result-actions">
        <button id="regenerateButton" type="button">再次生成</button>
        <button id="downloadButton" type="button">下载图片</button>
      </div>
    </section>
  </main>
  <script src="/script.js"></script>
</body>
```

- [ ] **Step 5: Implement screenshot-matching CSS**

Use these exact base tokens and component boundaries in `style.css`:

```css
:root {
  color-scheme: dark;
  --page: #070a15;
  --panel: #0a0e1b;
  --panel-soft: #101422;
  --line: #31384c;
  --line-strong: #d6d8e4;
  --text: #f5f6fb;
  --muted: #9aa1b2;
  --accent: #15b9d4;
  --danger: #ff7c86;
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; background: var(--page); color: var(--text); }
button, textarea, input { font: inherit; }
.product-swap-shell { width: min(100%, 460px); margin: 0 auto; padding: 20px 21px 40px; }
.back-button { border: 0; padding: 0; color: var(--muted); background: none; cursor: pointer; }
.intro h1 { margin: 22px 0 18px; font-size: 18px; }
.intro p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.65; }
.example-card { margin-top: 16px; padding: 14px 12px 10px; border: 1px solid var(--line-strong); border-radius: 12px; }
.example-card > p { margin: 0 0 10px; text-align: center; font-size: 12px; }
.example-equation { display: grid; grid-template-columns: 1fr 18px 1fr 18px 1fr; align-items: center; gap: 4px; }
.example-equation figure { margin: 0; min-width: 0; text-align: center; }
.example-equation img { width: 100%; aspect-ratio: 0.74; object-fit: cover; border-radius: 7px; border: 1px solid #677083; }
.example-equation figcaption { margin-top: 6px; color: var(--muted); font-size: 10px; }
.example-equation > span { color: var(--muted); text-align: center; }
.upload-field { position: relative; margin-top: 18px; }
.upload-field label { display: block; margin-bottom: 7px; font-size: 13px; }
.upload-field label > span { color: var(--danger); }
.upload-field small { color: var(--muted); font-weight: 400; }
.upload-box { width: 100%; min-height: 194px; overflow: hidden; border: 1px solid var(--line); border-radius: 8px; background: #080b15; color: var(--muted); cursor: pointer; }
.upload-box.dashed { min-height: 98px; border-style: dashed; }
.upload-box img { display: block; width: 100%; height: 100%; max-height: 260px; object-fit: contain; }
.remove-image { position: absolute; top: 38px; right: 14px; border: 0; background: transparent; color: var(--text); cursor: pointer; z-index: 2; }
#requirementsInput { width: 100%; min-height: 60px; margin-top: 16px; padding: 13px; resize: vertical; border: 1px solid var(--line); border-radius: 7px; background: var(--panel-soft); color: var(--text); }
.generate-button { width: 100%; min-height: 43px; margin-top: 14px; border: 0; border-radius: 7px; background: var(--accent); color: white; font-weight: 700; cursor: pointer; }
.generate-button:disabled { cursor: wait; opacity: .65; }
.form-error { color: var(--danger); font-size: 12px; }
.result-card { margin-top: 16px; overflow: hidden; border: 1px solid var(--line); border-radius: 7px; background: #020403; }
.result-card > img { display: block; width: 100%; min-height: 300px; object-fit: contain; }
.result-actions { display: flex; gap: 10px; padding: 12px; }
.result-actions button { flex: 1; min-height: 38px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel-soft); color: var(--text); }
```

Add the remaining interaction rules:

```css
.upload-box:focus-visible,
.generate-button:focus-visible,
.result-actions button:focus-visible,
.back-button:focus-visible {
  outline: 2px solid #7ee7f5;
  outline-offset: 2px;
}
.upload-box.dragover {
  border-color: var(--accent);
  background: rgba(21, 185, 212, .08);
}
.upload-field.has-preview .upload-box {
  padding: 0;
}
.upload-field.has-preview .upload-box > span {
  display: none;
}
.upload-field.is-disabled {
  pointer-events: none;
  opacity: .7;
}
.generate-button.is-loading::before {
  content: "";
  display: inline-block;
  width: 13px;
  height: 13px;
  margin-right: 8px;
  border: 2px solid rgba(255,255,255,.45);
  border-top-color: #fff;
  border-radius: 50%;
  vertical-align: -2px;
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 360px) {
  .product-swap-shell { padding-inline: 14px; }
  .example-card { padding-inline: 8px; }
  .example-equation { grid-template-columns: 1fr 14px 1fr 14px 1fr; gap: 2px; }
  .example-equation figcaption { font-size: 9px; }
}
```

- [ ] **Step 6: Run the HTML contract test**

Run:

```powershell
node --test apps/product-swap/tests/frontend-contract.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit markup, styling, and assets**

```powershell
git add apps/product-swap/index.html apps/product-swap/style.css apps/product-swap/assets apps/product-swap/tests/frontend-contract.test.js
git commit -m "feat: recreate product swap interface"
```

### Task 5: Implement Browser Upload and Generation Behavior

**Files:**

- Modify: `apps/product-swap/script.js`
- Modify: `apps/product-swap/tests/frontend-contract.test.js`
- Create: `apps/product-swap/tests/browser-smoke.js`

- [ ] **Step 1: Add failing client-helper tests**

Append to `frontend-contract.test.js`:

```js
const {
  resolveApiBase,
  validateClientFileMeta,
  buildGeneratePayload,
  mapErrorCode
} = require('../script');

test('uses same-origin locally and the shared API in production', () => {
  assert.equal(resolveApiBase('', 'localhost'), '');
  assert.equal(resolveApiBase('', '127.0.0.1'), '');
  assert.equal(resolveApiBase('', 'swap.mm0708.top'), 'https://api.mm0708.top');
  assert.equal(resolveApiBase('https://custom.example', 'localhost'), 'https://custom.example');
});

test('validates upload metadata', () => {
  assert.equal(
    validateClientFileMeta({ type: 'image/png', size: 1024 }),
    null
  );
  assert.equal(
    validateClientFileMeta({ type: 'image/gif', size: 1024 }).code,
    'UNSUPPORTED_IMAGE'
  );
});

test('builds the stable request and maps provider errors', () => {
  assert.deepEqual(
    buildGeneratePayload({
      target: 'target',
      product: '',
      scene: '',
      requirements: ' 保持排列 '
    }),
    {
      targetImage: 'target',
      productImage: '',
      sceneImage: '',
      requirements: '保持排列'
    }
  );
  assert.equal(mapErrorCode('CODEX_TIMEOUT'), '生成超时，请稍后重试');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test apps/product-swap/tests/frontend-contract.test.js
```

Expected: FAIL because the helper exports do not exist.

- [ ] **Step 3: Implement pure helpers and DOM initialization**

Implement in `apps/product-swap/script.js`:

```js
'use strict';

const CLIENT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const CLIENT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function resolveApiBase(explicitBase, hostname) {
  if (explicitBase) return String(explicitBase).replace(/\/+$/, '');
  if (hostname === 'localhost' || hostname === '127.0.0.1') return '';
  return 'https://api.mm0708.top';
}

function validateClientFileMeta(file) {
  if (!CLIENT_IMAGE_TYPES.has(file.type)) {
    return { code: 'UNSUPPORTED_IMAGE', message: '仅支持 JPG、PNG、WebP' };
  }
  if (file.size > CLIENT_MAX_IMAGE_BYTES) {
    return { code: 'FILE_TOO_LARGE', message: '单张图片不能超过 10MB' };
  }
  return null;
}

function buildGeneratePayload(state) {
  return {
    targetImage: state.target || '',
    productImage: state.product || '',
    sceneImage: state.scene || '',
    requirements: String(state.requirements || '').trim()
  };
}

const ERROR_MESSAGES = {
  INVALID_INPUT: '请检查上传图片和额外要求',
  FILE_TOO_LARGE: '单张图片不能超过 10MB',
  UNSUPPORTED_IMAGE: '仅支持 JPG、PNG、WebP',
  CODEX_CLI_UNAVAILABLE: '本机没有可用的 Codex CLI',
  CODEX_GENERATION_FAILED: '本地生成失败，请稍后重试',
  CODEX_TIMEOUT: '生成超时，请稍后重试',
  RESULT_IMAGE_NOT_FOUND: 'Codex 没有生成结果图片',
  VOLCANO_PROVIDER_NOT_CONFIGURED: '火山换品服务尚未配置',
  PROVIDER_REQUEST_FAILED: '图片服务请求失败'
};

function mapErrorCode(code) {
  return ERROR_MESSAGES[code] || '生成失败，请稍后重试';
}
```

Implement the browser behavior in a `boot()` function:

```js
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function boot() {
  const state = {
    target: '',
    product: '',
    scene: '',
    requirements: '',
    result: '',
    isGenerating: false
  };
  const apiBase = resolveApiBase(
    window.API_BASE_URL || '',
    window.location.hostname
  );
  const form = document.getElementById('swapForm');
  const generateButton = document.getElementById('generateButton');
  const formError = document.getElementById('formError');
  const resultSection = document.getElementById('resultSection');
  const resultImage = document.getElementById('resultImage');
  const requirementsInput = document.getElementById('requirementsInput');
  const slots = {
    target: document.querySelector('[data-slot="target"]'),
    product: document.querySelector('[data-slot="product"]'),
    scene: document.querySelector('[data-slot="scene"]')
  };
  const inputs = {
    target: document.getElementById('targetInput'),
    product: document.getElementById('productInput'),
    scene: document.getElementById('sceneInput')
  };

  function showError(message) {
    formError.textContent = message;
    formError.hidden = !message;
  }

  function setGenerating(value) {
    state.isGenerating = value;
    generateButton.disabled = value;
    generateButton.classList.toggle('is-loading', value);
    generateButton.textContent = value
      ? '生成中…'
      : '生成（消耗 3 豆额度）';
    for (const input of Object.values(inputs)) input.disabled = value;
    for (const slot of Object.values(slots)) {
      slot.classList.toggle('is-disabled', value);
    }
  }

  function renderSlot(name) {
    const slot = slots[name];
    const box = slot.querySelector('.upload-box');
    const removeButton = slot.querySelector('.remove-image');
    const value = state[name];
    slot.classList.toggle('has-preview', Boolean(value));
    removeButton.hidden = !value;
    box.innerHTML = value
      ? `<img src="${value}" alt="${name} 图片预览">`
      : '<span>点击上传</span>';
  }

  async function acceptFile(name, file) {
    if (!file || state.isGenerating) return;
    const validation = validateClientFileMeta(file);
    if (validation) {
      showError(validation.message);
      return;
    }
    try {
      state[name] = await readFileAsDataUrl(file);
      inputs[name].value = '';
      renderSlot(name);
      showError('');
    } catch (error) {
      showError(error.message || '图片读取失败');
    }
  }

  for (const [name, input] of Object.entries(inputs)) {
    input.addEventListener('change', () => acceptFile(name, input.files[0]));
    const slot = slots[name];
    const box = slot.querySelector('.upload-box');
    box.addEventListener('click', () => input.click());
    box.addEventListener('dragover', (event) => {
      event.preventDefault();
      box.classList.add('dragover');
    });
    box.addEventListener('dragleave', () => {
      box.classList.remove('dragover');
    });
    box.addEventListener('drop', (event) => {
      event.preventDefault();
      box.classList.remove('dragover');
      acceptFile(name, event.dataTransfer.files[0]);
    });
    slot.querySelector('.remove-image').addEventListener('click', () => {
      state[name] = '';
      input.value = '';
      renderSlot(name);
    });
    renderSlot(name);
  }

  async function submitGeneration() {
    if (state.isGenerating) return;
    state.requirements = requirementsInput.value;
    if (!state.target) {
      showError('请上传目标图');
      slots.target.querySelector('.upload-box').focus();
      return;
    }
    if (state.requirements.trim().length > 200) {
      showError('额外要求不能超过 200 字');
      requirementsInput.focus();
      return;
    }

    showError('');
    setGenerating(true);
    try {
      const response = await fetch(
        `${apiBase}/api/product-swap/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildGeneratePayload(state))
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.imageUrl) {
        const code = data?.error?.code || 'PROVIDER_REQUEST_FAILED';
        throw Object.assign(new Error(mapErrorCode(code)), { code });
      }
      state.result = data.imageUrl;
      resultImage.src = state.result;
      resultSection.hidden = false;
      resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      showError(error.message || mapErrorCode(error.code));
    } finally {
      setGenerating(false);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitGeneration();
  });
  document.getElementById('regenerateButton').addEventListener(
    'click',
    submitGeneration
  );
  document.getElementById('downloadButton').addEventListener('click', () => {
    if (!state.result) return;
    const link = document.createElement('a');
    link.href = state.result;
    link.download = `product-swap-${Date.now()}.png`;
    link.click();
  });
  document.getElementById('backButton').addEventListener('click', () => {
    window.history.back();
  });
}
```

Only call `boot()` when `document` exists:

```js
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', boot);
}

if (typeof module !== 'undefined') {
  module.exports = {
    resolveApiBase,
    validateClientFileMeta,
    buildGeneratePayload,
    mapErrorCode
  };
}
```

- [ ] **Step 4: Run frontend helper tests**

Run:

```powershell
node --test apps/product-swap/tests/frontend-contract.test.js
```

Expected: all frontend tests PASS.

- [ ] **Step 5: Create a real Chrome smoke test**

Create `apps/product-swap/tests/browser-smoke.js`:

```js
const path = require('node:path');
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 456, height: 980, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('http://127.0.0.1:8791/', {
    waitUntil: 'networkidle0',
    timeout: 60000
  });
  await page.waitForSelector('#generateButton');
  const state = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent,
    targetRequired: document.querySelector('[data-slot="target"] label')?.textContent,
    button: document.querySelector('#generateButton')?.textContent,
    width: document.querySelector('.product-swap-shell')?.getBoundingClientRect().width
  }));
  await page.screenshot({
    path: path.resolve(__dirname, '../product-swap-preview.png'),
    fullPage: true
  });
  console.log(JSON.stringify({ state, errors }, null, 2));
  await browser.close();
  if (errors.length) process.exitCode = 1;
})();
```

- [ ] **Step 6: Commit browser behavior**

```powershell
git add apps/product-swap/script.js apps/product-swap/tests/frontend-contract.test.js apps/product-swap/tests/browser-smoke.js
git commit -m "feat: add product swap interactions"
```

### Task 6: Add the Production API Boundary to my-cloud-hub

**Files:**

- Create: `apps/my-cloud-hub/src/projects/product-swap/provider.ts`
- Create: `apps/my-cloud-hub/src/projects/product-swap/volcano-provider.ts`
- Create: `apps/my-cloud-hub/src/projects/product-swap/router.ts`
- Create: `apps/my-cloud-hub/src/projects/product-swap/__tests__/router.test.ts`
- Modify: `apps/my-cloud-hub/src/index.ts`

- [ ] **Step 1: Write failing Hono route tests**

Create `router.test.ts`:

```ts
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createProductSwapRouter } from '../router'
import type { ProductSwapProvider } from '../provider'

const targetImage = 'data:image/png;base64,iVBORw0KGgo='

function createApp(provider: ProductSwapProvider) {
  const app = new Hono()
  app.route('/api/product-swap', createProductSwapRouter(() => provider))
  return app
}

describe('product swap router', () => {
  it('requires a target image', async () => {
    const provider: ProductSwapProvider = {
      name: 'fake',
      generate: async () => ({ imageUrl: targetImage })
    }
    const response = await createApp(provider).request(
      '/api/product-swap/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      }
    )
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('INVALID_INPUT')
  })

  it('returns the stable provider result', async () => {
    const provider: ProductSwapProvider = {
      name: 'fake',
      generate: async (input) => {
        expect(input.requirements).toBe('保持排列')
        return { imageUrl: targetImage }
      }
    }
    const response = await createApp(provider).request(
      '/api/product-swap/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetImage,
          requirements: ' 保持排列 '
        })
      }
    )
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.provider).toBe('fake')
    expect(data.imageUrl).toBe(targetImage)
  })
})
```

- [ ] **Step 2: Run the route test to verify it fails**

Run:

```powershell
pnpm --filter my-cloud-hub test -- src/projects/product-swap/__tests__/router.test.ts
```

Expected: FAIL because the route and provider types do not exist.

- [ ] **Step 3: Implement provider types and stable errors**

Create `provider.ts`:

```ts
export type ProductSwapInput = {
  targetImage: string
  productImage?: string
  sceneImage?: string
  requirements: string
  requestId: string
}

export type ProductSwapResult = {
  imageUrl: string
  metadata?: Record<string, unknown>
}

export type ProductSwapEnv = {
  DOUBAO_API_KEY?: string
  DOUBAO_IMAGE_ENDPOINT_ID?: string
  DOUBAO_PRODUCT_SWAP_ENDPOINT_ID?: string
}

export type ProductSwapProvider = {
  name: string
  generate(
    input: ProductSwapInput,
    env?: ProductSwapEnv
  ): Promise<ProductSwapResult>
}

export class ProductSwapProviderError extends Error {
  constructor(
    public readonly code:
      | 'VOLCANO_PROVIDER_NOT_CONFIGURED'
      | 'PROVIDER_REQUEST_FAILED',
    message: string
  ) {
    super(message)
    this.name = 'ProductSwapProviderError'
  }
}
```

- [ ] **Step 4: Implement the reserved Volcano provider**

Create `volcano-provider.ts`:

```ts
import {
  ProductSwapProviderError,
  type ProductSwapProvider
} from './provider'

export const volcanoProductSwapProvider: ProductSwapProvider = {
  name: 'volcano',
  async generate(_input, env) {
    const endpointId =
      env?.DOUBAO_PRODUCT_SWAP_ENDPOINT_ID ||
      env?.DOUBAO_IMAGE_ENDPOINT_ID

    if (!env?.DOUBAO_API_KEY || !endpointId) {
      throw new ProductSwapProviderError(
        'VOLCANO_PROVIDER_NOT_CONFIGURED',
        '火山换品服务尚未配置'
      )
    }

    throw new ProductSwapProviderError(
      'VOLCANO_PROVIDER_NOT_CONFIGURED',
      '火山换品模型请求格式尚未启用'
    )
  }
}
```

This is an intentional unavailable provider, not a fake success path. The later Volcengine integration replaces only this method body.

- [ ] **Step 5: Implement the Hono router**

Create `router.ts`:

```ts
import { Hono } from 'hono'
import {
  ProductSwapProviderError,
  type ProductSwapEnv,
  type ProductSwapProvider
} from './provider'
import { volcanoProductSwapProvider } from './volcano-provider'

type Bindings = ProductSwapEnv

export function createProductSwapRouter(
  resolveProvider: () => ProductSwapProvider =
    () => volcanoProductSwapProvider
) {
  const router = new Hono<{ Bindings: Bindings }>()

  router.post('/generate', async (c) => {
    const requestId = `swap_${crypto.randomUUID()}`
    const body = await c.req.json().catch(() => null)
    if (!body?.targetImage || typeof body.targetImage !== 'string') {
      return c.json({
        success: false,
        error: { code: 'INVALID_INPUT', message: '请上传目标图' },
        requestId
      }, 400)
    }
    const requirements = String(body.requirements || '').trim()
    if (requirements.length > 200) {
      return c.json({
        success: false,
        error: { code: 'INVALID_INPUT', message: '额外要求不能超过 200 字' },
        requestId
      }, 400)
    }

    const provider = resolveProvider()
    try {
      const result = await provider.generate({
        targetImage: body.targetImage,
        productImage: body.productImage || undefined,
        sceneImage: body.sceneImage || undefined,
        requirements,
        requestId
      }, c.env)
      return c.json({
        success: true,
        imageUrl: result.imageUrl,
        provider: provider.name,
        requestId
      })
    } catch (error) {
      if (error instanceof ProductSwapProviderError) {
        return c.json({
          success: false,
          error: { code: error.code, message: error.message },
          requestId
        }, error.code === 'VOLCANO_PROVIDER_NOT_CONFIGURED' ? 503 : 502)
      }
      throw error
    }
  })

  return router
}

export default createProductSwapRouter()
```

- [ ] **Step 6: Mount the route and bindings**

In `apps/my-cloud-hub/src/index.ts`:

```ts
import productSwapRouter from './projects/product-swap/router'
```

Add to `Bindings`:

```ts
DOUBAO_PRODUCT_SWAP_ENDPOINT_ID?: string
```

Mount:

```ts
app.route('/api/product-swap', productSwapRouter)
```

- [ ] **Step 7: Run the focused and full backend tests**

Run:

```powershell
pnpm --filter my-cloud-hub test -- src/projects/product-swap/__tests__/router.test.ts
pnpm --filter my-cloud-hub test
```

Expected: focused tests PASS and existing backend tests remain PASS.

- [ ] **Step 8: Commit the production boundary**

```powershell
git add apps/my-cloud-hub/src/projects/product-swap apps/my-cloud-hub/src/index.ts
git commit -m "feat: reserve volcano product swap api"
```

### Task 7: Visual and Real-Provider Verification

**Files:**

- Generate: `apps/product-swap/product-swap-preview.png`
- Modify only if verification finds defects: `apps/product-swap/index.html`
- Modify only if verification finds defects: `apps/product-swap/style.css`
- Modify only if verification finds defects: `apps/product-swap/script.js`
- Modify only if verification finds defects: `apps/product-swap/server/*.js`

- [ ] **Step 1: Run all automated tests**

Run:

```powershell
pnpm --filter product-swap test
pnpm --filter my-cloud-hub test
```

Expected: all tests PASS.

- [ ] **Step 2: Start the local app in a hidden process**

Run from PowerShell:

```powershell
Start-Process -FilePath node -ArgumentList 'server/dev-server.js' -WorkingDirectory 'E:\WorkSpace\ai\pages\apps\product-swap' -WindowStyle Hidden
```

Confirm:

```powershell
Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8791/' | Select-Object StatusCode
```

Expected: `StatusCode` is 200.

- [ ] **Step 3: Run browser smoke verification**

Run:

```powershell
pnpm --filter product-swap test:browser
```

Expected:

- `title` is `一键换产品`.
- Button text is `生成（消耗 3 豆额度）`.
- Shell width is no greater than 460 pixels.
- `errors` is empty.
- `apps/product-swap/product-swap-preview.png` is created.

Inspect the preview once with the image viewer. Compare spacing, border radii, upload heights, accent color, and result section against the supplied screenshot.

- [ ] **Step 4: Exercise the real Codex CLI path**

Submit a real request using the extracted target and product assets through the browser or a small PowerShell request. The expected valid outcomes are:

1. Success: a real `result.png` is returned and displayed.
2. Explicit temporary-provider limitation: the API returns one of `CODEX_CLI_UNAVAILABLE`, `CODEX_GENERATION_FAILED`, `CODEX_TIMEOUT`, or `RESULT_IMAGE_NOT_FOUND`.

Static example images must never be returned as the generated result.

- [ ] **Step 5: Fix verification defects with focused tests first**

For each defect:

1. Add or strengthen the narrowest automated assertion.
2. Run it to reproduce the failure.
3. Make the smallest implementation change.
4. Re-run the focused test.
5. Re-run the relevant full suite.

- [ ] **Step 6: Run final verification**

Run:

```powershell
pnpm --filter product-swap test
pnpm --filter my-cloud-hub test
git diff --check
git status --short
```

Expected:

- Tests PASS.
- `git diff --check` emits no whitespace errors.
- Status lists only intentional product-swap work plus the user's pre-existing unrelated changes.

- [ ] **Step 7: Commit verification fixes**

```powershell
git add apps/product-swap apps/my-cloud-hub/src/projects/product-swap apps/my-cloud-hub/src/index.ts pnpm-lock.yaml
git commit -m "test: verify product swap workflow"
```

Do not stage unrelated existing changes.
