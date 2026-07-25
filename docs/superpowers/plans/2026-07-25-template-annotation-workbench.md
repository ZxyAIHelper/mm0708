# Template Annotation Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an operator-only browser workbench that uploads a target image, edits mutually exclusive replacement/preserve/reference masks, and restores an unfinished local draft after refresh.

**Architecture:** Add a self-contained static admin feature under `apps/product-swap/admin/template-extraction/`. Keep mask operations, viewport transforms, canvas rendering, and IndexedDB persistence in separate browser/CommonJS-compatible modules. This milestone is deliberately model-independent: it produces a stable annotated draft consumed by the later extraction-service plan.

**Tech Stack:** Static HTML/CSS, vanilla JavaScript, Canvas 2D, typed arrays, IndexedDB, Node.js built-in test runner, Puppeteer.

---

## Scope

This plan delivers:

- Target-image upload and preview.
- Replacement, preserve, and reference mask layers.
- Brush, eraser, rectangle, and lasso operations.
- Mutually exclusive pixels across layers.
- Multiple named replacement layers with merge, enable, and delete.
- Zoom, pan, fit, layer visibility, undo, and redo.
- Local autosave and refresh recovery.
- A stable serialized draft contract.

AI analysis, rule extraction, test generation, cloud persistence, and publishing are excluded. Their plans depend on the draft contract created here.

## File map

- `apps/product-swap/admin/template-extraction/index.html`: workbench structure.
- `apps/product-swap/admin/template-extraction/workbench.css`: desktop-first editor layout.
- `apps/product-swap/admin/template-extraction/mask-model.js`: semantic layers and mutually exclusive pixel writes.
- `apps/product-swap/admin/template-extraction/editor-geometry.js`: viewport/image coordinate transforms and shape rasterization.
- `apps/product-swap/admin/template-extraction/draft-store.js`: IndexedDB draft persistence.
- `apps/product-swap/admin/template-extraction/workbench.js`: DOM events, canvas rendering, tools, and workflow state.
- `apps/product-swap/tests/template-mask-model.test.js`: mask-domain tests.
- `apps/product-swap/tests/template-editor-geometry.test.js`: transform and lasso tests.
- `apps/product-swap/tests/template-draft-store.test.js`: serialization tests.
- `apps/product-swap/tests/template-workbench-contract.test.js`: page contract.
- `apps/product-swap/tests/template-workbench-smoke.js`: real browser interaction and recovery.

### Task 1: Define mutually exclusive semantic mask layers

**Files:**
- Create: `apps/product-swap/admin/template-extraction/mask-model.js`
- Create: `apps/product-swap/tests/template-mask-model.test.js`

- [ ] **Step 1: Write the failing domain tests**

```js
// apps/product-swap/tests/template-mask-model.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createMaskDocument,
    addReplaceLayer,
    writePixels,
    mergeReplaceLayers,
    removeLayer,
    serializeMaskDocument,
    restoreMaskDocument,
} = require('../admin/template-extraction/mask-model');

test('writing one semantic layer clears the same pixels from every other layer', () => {
    const document = createMaskDocument(4, 3);
    const replaceId = addReplaceLayer(document, '产品 1');
    writePixels(document, replaceId, [1, 2], 255);
    writePixels(document, 'preserve', [2], 255);

    assert.deepEqual(Array.from(document.layers[replaceId].pixels), [
        0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    assert.equal(document.layers.preserve.pixels[2], 255);
});

test('supports named replacement regions, merge, disable and delete', () => {
    const document = createMaskDocument(3, 2);
    const first = addReplaceLayer(document, '产品 1');
    const second = addReplaceLayer(document, '产品 2');
    writePixels(document, first, [0, 1], 255);
    writePixels(document, second, [4], 255);
    document.layers[second].enabled = false;

    mergeReplaceLayers(document, first, second);
    assert.deepEqual(Array.from(document.layers[first].pixels), [
        255, 255, 0, 0, 255, 0,
    ]);
    assert.equal(document.layers[second], undefined);

    removeLayer(document, first);
    assert.equal(document.layers[first], undefined);
});

test('round trips compact mask documents without sharing buffers', () => {
    const document = createMaskDocument(2, 2);
    const replaceId = addReplaceLayer(document, '产品');
    writePixels(document, replaceId, [0, 3], 255);
    const restored = restoreMaskDocument(serializeMaskDocument(document));

    assert.deepEqual(
        Array.from(restored.layers[replaceId].pixels),
        [255, 0, 0, 255],
    );
    restored.layers[replaceId].pixels[0] = 0;
    assert.equal(document.layers[replaceId].pixels[0], 255);
});
```

- [ ] **Step 2: Run the tests and verify the module is missing**

Run:

```powershell
node --test apps/product-swap/tests/template-mask-model.test.js
```

Expected: FAIL with `Cannot find module '../admin/template-extraction/mask-model'`.

- [ ] **Step 3: Implement the mask document**

Use this public contract:

```js
const MASK_DOCUMENT_VERSION = 1;

function createMaskDocument(width, height) {
    const size = width * height;
    return {
        version: MASK_DOCUMENT_VERSION,
        width,
        height,
        selectedLayerId: 'preserve',
        nextReplaceNumber: 1,
        layers: {
            preserve: {
                id: 'preserve',
                kind: 'preserve',
                name: '必须保留',
                enabled: true,
                visible: true,
                pixels: new Uint8Array(size),
            },
            reference: {
                id: 'reference',
                kind: 'reference',
                name: '重点参考',
                enabled: true,
                visible: true,
                pixels: new Uint8Array(size),
            },
        },
    };
}

function addReplaceLayer(document, name) {
    const number = document.nextReplaceNumber++;
    const id = `replace-${number}`;
    document.layers[id] = {
        id,
        kind: 'replace',
        name: String(name || `产品 ${number}`).trim().slice(0, 40),
        enabled: true,
        visible: true,
        pixels: new Uint8Array(document.width * document.height),
    };
    document.selectedLayerId = id;
    return id;
}

function writePixels(document, layerId, indexes, value) {
    const layer = document.layers[layerId];
    if (!layer) throw new Error('MASK_LAYER_NOT_FOUND');
    for (const index of indexes) {
        if (!Number.isInteger(index) || index < 0 || index >= layer.pixels.length) {
            continue;
        }
        if (value) {
            for (const candidate of Object.values(document.layers)) {
                candidate.pixels[index] = 0;
            }
        }
        layer.pixels[index] = value ? 255 : 0;
    }
}
```

Implement:

- `mergeReplaceLayers(document, targetId, sourceId)` by writing every nonzero source pixel into the target and then deleting the source.
- `removeLayer(document, layerId)` only for `kind === 'replace'`.
- `serializeMaskDocument(document)` as JSON-safe metadata plus base64-encoded pixel arrays.
- `restoreMaskDocument(serialized)` with version, dimensions, layer kind, and decoded-length validation.

Expose all functions to `globalThis.TemplateMaskModel` and `module.exports`.

- [ ] **Step 4: Run the domain tests**

Run:

```powershell
node --test apps/product-swap/tests/template-mask-model.test.js
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/product-swap/admin/template-extraction/mask-model.js apps/product-swap/tests/template-mask-model.test.js
git commit -m "feat: define template annotation masks"
```

### Task 2: Add coordinate transforms and rasterized tools

**Files:**
- Create: `apps/product-swap/admin/template-extraction/editor-geometry.js`
- Create: `apps/product-swap/tests/template-editor-geometry.test.js`

- [ ] **Step 1: Write failing geometry tests**

```js
// apps/product-swap/tests/template-editor-geometry.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    fitViewport,
    screenToImage,
    circleIndexes,
    rectangleIndexes,
    polygonIndexes,
} = require('../admin/template-extraction/editor-geometry');

test('fits and reverses screen coordinates into image pixels', () => {
    const viewport = fitViewport(1200, 800, 600, 600);
    assert.deepEqual(viewport, { scale: 0.5, offsetX: 0, offsetY: 100 });
    assert.deepEqual(
        screenToImage({ x: 300, y: 300 }, viewport, 1200, 800),
        { x: 600, y: 400 },
    );
});

test('rasterizes brush and rectangle within image bounds', () => {
    assert.deepEqual(circleIndexes(5, 5, 0, 0, 1).sort((a, b) => a - b), [
        0, 1, 5,
    ]);
    assert.deepEqual(rectangleIndexes(5, 5, 1, 1, 2, 2), [
        6, 7, 11, 12,
    ]);
});

test('fills a lasso polygon without leaking outside it', () => {
    assert.deepEqual(
        polygonIndexes(4, 4, [[0, 0], [3, 0], [0, 3]])
            .sort((a, b) => a - b),
        [0, 1, 2, 4, 5, 8],
    );
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node --test apps/product-swap/tests/template-editor-geometry.test.js
```

Expected: FAIL because `editor-geometry.js` does not exist.

- [ ] **Step 3: Implement pure geometry helpers**

Implement:

```js
function fitViewport(imageWidth, imageHeight, canvasWidth, canvasHeight) {
    const scale = Math.min(
        canvasWidth / imageWidth,
        canvasHeight / imageHeight,
    );
    return {
        scale,
        offsetX: (canvasWidth - imageWidth * scale) / 2,
        offsetY: (canvasHeight - imageHeight * scale) / 2,
    };
}

function screenToImage(point, viewport, width, height) {
    return {
        x: Math.max(0, Math.min(
            width - 1,
            Math.floor((point.x - viewport.offsetX) / viewport.scale),
        )),
        y: Math.max(0, Math.min(
            height - 1,
            Math.floor((point.y - viewport.offsetY) / viewport.scale),
        )),
    };
}
```

Implement `circleIndexes`, `rectangleIndexes`, and `polygonIndexes` with image-space integer coordinates. `polygonIndexes` uses the even-odd point-in-polygon rule on pixel centers. Every function returns unique indexes in `[0, width * height)`.

Expose helpers to `globalThis.TemplateEditorGeometry` and `module.exports`.

- [ ] **Step 4: Run geometry tests**

Run:

```powershell
node --test apps/product-swap/tests/template-editor-geometry.test.js
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/product-swap/admin/template-extraction/editor-geometry.js apps/product-swap/tests/template-editor-geometry.test.js
git commit -m "feat: add annotation editor geometry"
```

### Task 3: Persist an autosaved local draft

**Files:**
- Create: `apps/product-swap/admin/template-extraction/draft-store.js`
- Create: `apps/product-swap/tests/template-draft-store.test.js`

- [ ] **Step 1: Write failing serialization tests**

```js
// apps/product-swap/tests/template-draft-store.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeDraft,
    createMemoryDraftStore,
} = require('../admin/template-extraction/draft-store');

test('normalizes a versioned annotation draft', () => {
    const draft = normalizeDraft({
        id: ' draft-1 ',
        name: ' 夏日模板 ',
        sourceImage: { dataUrl: 'data:image/png;base64,AA==', width: 2, height: 3 },
        masks: { version: 1 },
        updatedAt: 10,
    });
    assert.equal(draft.id, 'draft-1');
    assert.equal(draft.name, '夏日模板');
    assert.equal(draft.stage, 'annotating');
    assert.equal(draft.sourceImage.width, 2);
});

test('saves, reloads and removes drafts through the repository contract', async () => {
    const store = createMemoryDraftStore();
    await store.save({ id: 'draft-1', name: '模板', sourceImage: null });
    assert.equal((await store.load('draft-1')).name, '模板');
    assert.equal((await store.latest()).id, 'draft-1');
    await store.remove('draft-1');
    assert.equal(await store.load('draft-1'), null);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node --test apps/product-swap/tests/template-draft-store.test.js
```

Expected: FAIL because `draft-store.js` does not exist.

- [ ] **Step 3: Implement draft normalization and repository adapters**

The normalized draft is:

```js
{
    version: 1,
    id: string,
    name: string,
    stage: 'annotating' | 'annotated',
    sourceImage: null | {
        dataUrl: string,
        mimeType: string,
        width: number,
        height: number,
    },
    masks: null | SerializedMaskDocument,
    selectedTool: 'brush' | 'eraser' | 'rectangle' | 'lasso' | 'pan',
    brushSize: number,
    updatedAt: number,
}
```

Serialize to this exact shape:

```js
{
    version: 1,
    width: number,
    height: number,
    selectedLayerId: string,
    nextReplaceNumber: number,
    layers: Array<{
        id: string,
        kind: 'replace' | 'preserve' | 'reference',
        name: string,
        enabled: boolean,
        visible: boolean,
        pixelsBase64: string,
    }>,
}
```

Implement:

- `normalizeDraft(value)`.
- `createMemoryDraftStore()` for unit tests.
- `createIndexedDbDraftStore(indexedDB = globalThis.indexedDB)` using database `template_extraction_drafts_v1`, version `1`, and object store `drafts` keyed by `id`.
- Repository methods `save`, `load`, `latest`, and `remove`.

Reject source images that are not JPEG, PNG, or WebP data URLs. Clamp brush size to `1..200`. Store only one serialized mask copy.

- [ ] **Step 4: Run persistence tests**

Run:

```powershell
node --test apps/product-swap/tests/template-draft-store.test.js
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/product-swap/admin/template-extraction/draft-store.js apps/product-swap/tests/template-draft-store.test.js
git commit -m "feat: persist template annotation drafts"
```

### Task 4: Build the operator workbench page

**Files:**
- Create: `apps/product-swap/admin/template-extraction/index.html`
- Create: `apps/product-swap/admin/template-extraction/workbench.css`
- Create: `apps/product-swap/tests/template-workbench-contract.test.js`
- Modify: `apps/product-swap/build.mjs`
- Modify: `apps/product-swap/tests/build.test.js`

- [ ] **Step 1: Write the failing page contract**

```js
// apps/product-swap/tests/template-workbench-contract.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(
    root,
    'admin',
    'template-extraction',
    'index.html',
);

test('operator workbench exposes upload, tools, layers and canvas', () => {
    const html = fs.readFileSync(htmlPath, 'utf8');
    for (const id of [
        'sourceInput',
        'editorCanvas',
        'toolBrush',
        'toolEraser',
        'toolRectangle',
        'toolLasso',
        'toolPan',
        'brushSize',
        'undoButton',
        'redoButton',
        'fitButton',
        'addReplaceLayer',
        'layerList',
        'restoreAiButton',
        'confirmAnnotations',
        'workbenchStatus',
    ]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /mask-model\.js/);
    assert.match(html, /editor-geometry\.js/);
    assert.match(html, /draft-store\.js/);
    assert.match(html, /workbench\.js/);
});
```

- [ ] **Step 2: Run the contract and verify the page is missing**

Run:

```powershell
node --test apps/product-swap/tests/template-workbench-contract.test.js
```

Expected: FAIL with `ENOENT`.

- [ ] **Step 3: Create semantic workbench markup**

Create a desktop layout with:

```html
<header class="workbench-header">
    <a href="/">返回平台</a>
    <input id="draftName" maxlength="80" value="未命名模板">
    <span id="workbenchStatus" role="status">等待上传目标图</span>
    <button id="saveDraftButton" type="button">保存草稿</button>
</header>
<main class="workbench-layout">
    <aside class="tool-panel" aria-label="标注工具">
        <input id="sourceInput" type="file" accept="image/jpeg,image/png,image/webp">
        <button id="toolBrush" type="button" data-tool="brush">画笔</button>
        <button id="toolEraser" type="button" data-tool="eraser">橡皮擦</button>
        <button id="toolRectangle" type="button" data-tool="rectangle">矩形</button>
        <button id="toolLasso" type="button" data-tool="lasso">套索</button>
        <button id="toolPan" type="button" data-tool="pan">移动</button>
        <input id="brushSize" type="range" min="1" max="200" value="30">
        <button id="undoButton" type="button">撤销</button>
        <button id="redoButton" type="button">重做</button>
        <button id="fitButton" type="button">适应窗口</button>
    </aside>
    <section class="canvas-panel">
        <canvas id="editorCanvas" tabindex="0"></canvas>
        <p id="canvasHint">上传目标图后开始标注</p>
    </section>
    <aside class="layer-panel" aria-label="标注层">
        <button id="addReplaceLayer" type="button">添加替换主体</button>
        <div id="layerList"></div>
        <button id="restoreAiButton" type="button" disabled>恢复 AI 标注</button>
        <button id="confirmAnnotations" type="button">确认标注</button>
    </aside>
</main>
```

Load `mask-model.js`, `editor-geometry.js`, `draft-store.js`, and `workbench.js` in that order.

- [ ] **Step 4: Add desktop, tablet, and phone layout CSS**

Use a three-column desktop grid:

```css
.workbench-layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr) 260px;
    min-height: calc(100vh - 64px);
}
.canvas-panel {
    position: relative;
    min-width: 0;
    overflow: hidden;
    background: #151515;
}
#editorCanvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
}
@media (max-width: 900px) {
    .workbench-layout {
        grid-template-columns: 180px minmax(0, 1fr);
    }
    .layer-panel {
        grid-column: 1 / -1;
    }
}
@media (max-width: 620px) {
    .workbench-layout { display: block; }
    .tool-panel, .layer-panel {
        display: flex;
        overflow-x: auto;
    }
    .canvas-panel { height: 62vh; }
}
```

Add visible red, green, and yellow swatches, 44px minimum control height, focus states, and a status color that does not rely on color alone.

- [ ] **Step 5: Add the admin directory to the static build**

Add `'admin'` to `publicEntries` in `build.mjs` and the resulting `admin` directory to the exact sorted list in `build.test.js`.

- [ ] **Step 6: Run contract and build tests**

Run:

```powershell
node --test apps/product-swap/tests/template-workbench-contract.test.js apps/product-swap/tests/build.test.js
```

Expected: both tests pass and `dist/admin/template-extraction/index.html` exists.

- [ ] **Step 7: Commit**

```powershell
git add apps/product-swap/admin/template-extraction/index.html apps/product-swap/admin/template-extraction/workbench.css apps/product-swap/tests/template-workbench-contract.test.js apps/product-swap/build.mjs apps/product-swap/tests/build.test.js
git commit -m "feat: add template annotation workbench"
```

### Task 5: Wire canvas interactions, history, and autosave

**Files:**
- Create: `apps/product-swap/admin/template-extraction/workbench.js`
- Create: `apps/product-swap/tests/template-workbench-state.test.js`

- [ ] **Step 1: Write failing state-history tests**

```js
// apps/product-swap/tests/template-workbench-state.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createHistory,
    pushHistory,
    undoHistory,
    redoHistory,
} = require('../admin/template-extraction/workbench');

test('undo and redo restore serialized mask snapshots', () => {
    const history = createHistory('a');
    pushHistory(history, 'b');
    pushHistory(history, 'c');
    assert.equal(undoHistory(history), 'b');
    assert.equal(undoHistory(history), 'a');
    assert.equal(redoHistory(history), 'b');
});

test('new edits clear redo history and cap snapshots', () => {
    const history = createHistory('0', 3);
    pushHistory(history, '1');
    pushHistory(history, '2');
    undoHistory(history);
    pushHistory(history, '3');
    assert.equal(redoHistory(history), null);
    pushHistory(history, '4');
    assert.deepEqual(history.undo, ['1', '3', '4']);
});
```

- [ ] **Step 2: Run the state tests and verify failure**

Run:

```powershell
node --test apps/product-swap/tests/template-workbench-state.test.js
```

Expected: FAIL because `workbench.js` does not exist.

- [ ] **Step 3: Implement exported history helpers**

```js
function createHistory(initialSnapshot, limit = 30) {
    return { undo: [initialSnapshot], redo: [], limit };
}
function pushHistory(history, snapshot) {
    history.undo.push(snapshot);
    history.undo = history.undo.slice(-history.limit);
    history.redo = [];
}
function undoHistory(history) {
    if (history.undo.length <= 1) return null;
    history.redo.push(history.undo.pop());
    return history.undo[history.undo.length - 1];
}
function redoHistory(history) {
    if (!history.redo.length) return null;
    const snapshot = history.redo.pop();
    history.undo.push(snapshot);
    return snapshot;
}
```

Export them through `module.exports` without booting DOM code under Node.

- [ ] **Step 4: Implement image loading and canvas rendering**

Browser boot must:

1. Decode selected JPEG/PNG/WebP with `createImageBitmap`.
2. Reject files over 10MB.
3. Store a data URL, MIME type, natural width, and natural height.
4. Create a mask document and one default replacement layer.
5. Resize the backing canvas for device pixel ratio.
6. Fit the image into the canvas.
7. Draw the source image.
8. Draw visible masks at 45% opacity: replacement `#f04444`, preserve `#35a765`, reference `#e5b52e`.
9. Draw the active rectangle or lasso preview without writing it until pointer release.

- [ ] **Step 5: Implement pointer tools**

Use pointer capture. Convert every pointer position through `screenToImage`.

- Brush: call `circleIndexes` continuously and write `255` to the selected layer.
- Eraser: call `circleIndexes` and write `0` only to the selected layer.
- Rectangle: record start/end, rasterize on pointer release.
- Lasso: collect image points at least 3 pixels apart and rasterize on pointer release.
- Pan: update viewport offsets without modifying masks.
- Wheel/pinch: clamp zoom to `0.1..8`.

Push exactly one undo snapshot at the end of each completed stroke or shape, not for every pointer movement.

- [ ] **Step 6: Implement layer controls**

Each row in `layerList` must provide:

- Select layer.
- Rename replacement layer.
- Show/hide layer.
- Enable/disable replacement layer.
- Merge a replacement layer into another replacement layer.
- Delete replacement layer after confirmation.
- Clear current layer.

Preserve and reference layers cannot be renamed, merged, disabled, or deleted.

- [ ] **Step 7: Implement autosave and recovery**

Use `createIndexedDbDraftStore()`.

- Debounce autosave by 500ms after image, mask, tool, brush-size, or name changes.
- Save the active draft ID in `sessionStorage` as `template_extraction_active_draft_id`.
- On load, restore that draft; otherwise restore `latest()`.
- Update `workbenchStatus` to “已自动保存” only after IndexedDB resolves.
- On persistence failure, keep editing enabled and show “无法保存到浏览器，请导出或稍后重试”.
- `confirmAnnotations` validates that at least one enabled replacement layer contains a nonzero pixel, then saves `stage: 'annotated'` for the next plan.

- [ ] **Step 8: Run workbench unit tests**

Run:

```powershell
node --test apps/product-swap/tests/template-mask-model.test.js apps/product-swap/tests/template-editor-geometry.test.js apps/product-swap/tests/template-draft-store.test.js apps/product-swap/tests/template-workbench-state.test.js apps/product-swap/tests/template-workbench-contract.test.js
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```powershell
git add apps/product-swap/admin/template-extraction/workbench.js apps/product-swap/tests/template-workbench-state.test.js
git commit -m "feat: edit and autosave template masks"
```

### Task 6: Verify browser annotation and refresh recovery

**Files:**
- Create: `apps/product-swap/tests/template-workbench-smoke.js`
- Modify: `apps/product-swap/package.json`
- Modify: `apps/product-swap/README.md`

- [ ] **Step 1: Add a Puppeteer workbench journey**

The script must:

1. Start `createProductSwapServer()`.
2. Open `/admin/template-extraction/` at 1280×800.
3. Upload `assets/example-template.jpg`.
4. Wait for the default replacement layer.
5. Draw one brush stroke on the canvas.
6. Select preserve and draw over part of the same location.
7. Read exported debug state from `window.TemplateWorkbenchDebug.snapshot()`.
8. Assert the preserve pixel is nonzero and the replacement pixel at that index is zero.
9. Reload the page.
10. Assert the source image and mask counts recover.
11. Click `confirmAnnotations`.
12. Assert status becomes `annotated`.
13. Assert no `pageerror` events occurred.

Expose only these debug methods in development:

```js
window.TemplateWorkbenchDebug = {
    snapshot: () => ({
        draftId: state.draft.id,
        stage: state.draft.stage,
        sourceLoaded: Boolean(state.sourceBitmap),
        masks: TemplateMaskModel.serializeMaskDocument(state.masks),
    }),
};
```

- [ ] **Step 2: Add a package script**

```json
"test:template-workbench": "node tests/template-workbench-smoke.js"
```

- [ ] **Step 3: Run browser verification**

Run:

```powershell
pnpm --filter product-swap test:template-workbench
```

Expected: exit code 0 with a JSON summary containing `stage: "annotated"` and no browser errors.

- [ ] **Step 4: Update README**

Document:

```markdown
### Template annotation workbench

Open `/admin/template-extraction/` to create a browser-local annotated draft.
This first milestone does not call AI services or publish templates.
```

- [ ] **Step 5: Run all product app tests and build**

Run:

```powershell
pnpm --filter product-swap test
pnpm --filter product-swap test:template-workbench
pnpm --filter product-swap build
```

Expected: all tests pass and the admin directory is emitted to `dist/admin`.

- [ ] **Step 6: Commit**

```powershell
git add apps/product-swap/tests/template-workbench-smoke.js apps/product-swap/package.json apps/product-swap/README.md
git commit -m "test: cover template annotation recovery"
```

## Acceptance checklist

- [ ] Target JPEG, PNG, and WebP images up to 10MB load.
- [ ] Brush, eraser, rectangle, and lasso write image-space masks.
- [ ] Replacement, preserve, and reference pixels are mutually exclusive.
- [ ] Multiple replacement layers can be named, merged, disabled, and deleted.
- [ ] Zoom and pan do not alter mask coordinates.
- [ ] Undo and redo operate per completed edit.
- [ ] Draft autosaves and restores after refresh.
- [ ] Confirming annotations requires at least one enabled replacement pixel.
- [ ] No AI, cloud storage, or publishing dependency is introduced.
