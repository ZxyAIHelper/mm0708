# Dish Ranking Layout Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five deterministic dish-ranking layouts, fixed-size centered tier cards, and CSS schematic previews in the layout picker without adding AI calls.

**Architecture:** Keep the existing normalized ranking as the only content source. Extend the strict manifest DTO with an optional allow-listed `preview`, make the Canvas renderer dispatch to pure layout functions, and pass the selected layout from the existing creator payload. All layout selection, capacity limiting, drawing, and browser verification remain deterministic.

**Tech Stack:** CommonJS JavaScript, Node test runner, browser Canvas, DOM/CSS, Puppeteer, Sharp, Cloudflare Workers.

---

### Task 1: Publish safe layout-preview metadata

**Files:**
- Modify: `apps/product-swap/tests/dish-ranking-manifest.test.js`
- Modify: `apps/product-swap/tests/template-registry.test.js`
- Modify: `apps/product-swap/server/template-registry.js`
- Modify: `apps/product-swap/template-packs/dish-ranking-guide/manifest.js`

- [ ] **Step 1: Write failing manifest and registry tests**

Update the dish layout expectation to:

```js
assert.deepEqual(layout.options, [
    { value: 'tier', label: '从拉到夯', preview: 'tier' },
    { value: 'grid-4', label: '四宫格精选', preview: 'grid-4' },
    { value: 'grid-9', label: '九宫格榜单', preview: 'grid-9' },
    { value: 'hero', label: '主推封面', preview: 'hero' },
    {
        value: 'leaderboard',
        label: 'TOP 榜单',
        preview: 'leaderboard',
    },
]);
```

Add registry assertions that a known preview survives `publicManifest`, while an
unknown preview or unknown option property is rejected.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test tests/dish-ranking-manifest.test.js tests/template-registry.test.js
```

Expected: FAIL because option objects currently allow only `value` and `label`.

- [ ] **Step 3: Add strict preview validation and five options**

In `template-registry.js`, define:

```js
const CHOICE_PREVIEWS = new Set([
    'tier',
    'grid-4',
    'grid-9',
    'hero',
    'leaderboard',
]);
```

Allow `preview` as the only optional third option property, require it to be an
own string property when present, reject values outside `CHOICE_PREVIEWS`, copy
it into canonical options, and publish it from `publicManifest`.

Update the dish-ranking manifest with the five option objects from Step 1.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same two-file test command. Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- apps/product-swap/server/template-registry.js apps/product-swap/template-packs/dish-ranking-guide/manifest.js apps/product-swap/tests/dish-ranking-manifest.test.js apps/product-swap/tests/template-registry.test.js
git commit -m "feat: publish dish layout previews"
```

### Task 2: Render accessible schematic layout cards

**Files:**
- Modify: `apps/product-swap/tests/creator-contract.test.js`
- Modify: `apps/product-swap/tests/dish-list-style.test.js`
- Modify: `apps/product-swap/creator-meta.js`
- Modify: `apps/product-swap/style.css`

- [ ] **Step 1: Write failing creator contract and style tests**

Assert that `renderChoiceField` creates, for preview options:

```html
<span class="choice-preview choice-preview-tier" aria-hidden="true">…</span>
<span class="choice-label">从拉到夯</span>
```

and applies `choice-group-with-previews` only to that choice group. Add style
contract assertions for a responsive preview-card grid, selected state,
miniature tier/grid/hero/leaderboard geometry, and unchanged compact choice
buttons for aspect ratio.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test tests/creator-contract.test.js tests/dish-list-style.test.js
```

Expected: FAIL because creator buttons currently contain text only and the
preview selectors do not exist.

- [ ] **Step 3: Implement preview DOM and CSS**

In `creator-meta.js`, when `option.preview` exists:

```js
group.classList.add('choice-group-with-previews');
const preview = global.document.createElement('span');
preview.className = `choice-preview choice-preview-${option.preview}`;
preview.setAttribute('aria-hidden', 'true');
for (let blockIndex = 0; blockIndex < previewBlockCount(
    option.preview,
); blockIndex += 1) {
    const block = global.document.createElement('i');
    preview.appendChild(block);
}
const text = global.document.createElement('span');
text.className = 'choice-label';
text.textContent = option.label;
button.append(preview, text);
```

Keep `button.textContent = option.label` for ordinary choices. Use CSS grid
areas and colored blocks to draw the five schematic previews without images or
inline style strings.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same two-file test command. Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- apps/product-swap/creator-meta.js apps/product-swap/style.css apps/product-swap/tests/creator-contract.test.js apps/product-swap/tests/dish-list-style.test.js
git commit -m "feat: show dish layout preview cards"
```

### Task 3: Fix and center tier card sizes

**Files:**
- Modify: `apps/product-swap/tests/dish-ranking-renderer.test.js`
- Modify: `apps/product-swap/dish-ranking-renderer.js`

- [ ] **Step 1: Write failing fixed-card tests**

For `1`, `2`, and `3` cards in the same tier, assert:

```js
assert.equal(one.cards[0].width, two.cards[0].width);
assert.equal(two.cards[0].width, three.cards[0].width);
assert.ok(Math.abs(centerOf(one.cards) - centerOfContent(one)) < 1);
assert.ok(Math.abs(centerOf(two.cards) - centerOfContent(two)) < 1);
assert.ok(Math.abs(centerOf(three.cards) - centerOfContent(three)) < 1);
assert.ok(one.cards[0].width <= 240);
```

Retain the dense-tier test and add pairwise rectangle non-overlap assertions
for twelve cards in every supported ratio.

- [ ] **Step 2: Run renderer tests and verify RED**

Run:

```powershell
node --test tests/dish-ranking-renderer.test.js
```

Expected: FAIL because one card currently consumes the full content width.

- [ ] **Step 3: Implement fixed centered tier geometry**

Rename the pure tier layout to `layoutTierRanking`. Use:

```js
const standardCardWidth = 232;
const columns = Math.min(6, Math.max(1, rowItems.length));
const rows = Math.max(1, Math.ceil(rowItems.length / 6));
const availableWidth = contentWidth - gap * (columns - 1);
const cardWidth = Math.min(standardCardWidth, availableWidth / columns);
const groupWidth = cardWidth * columns + gap * (columns - 1);
const groupLeft = contentLeft + (contentWidth - groupWidth) / 2;
```

Compute a bounded `cardHeight`, center the card group vertically, and keep
comment height readable. Export `layoutRanking` as a compatibility alias.

- [ ] **Step 4: Run renderer tests and verify GREEN**

Run the same renderer test command. Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- apps/product-swap/dish-ranking-renderer.js apps/product-swap/tests/dish-ranking-renderer.test.js
git commit -m "fix: bound tier ranking card sizes"
```

### Task 4: Add capacity selection and four new layout strategies

**Files:**
- Modify: `apps/product-swap/tests/dish-ranking-renderer.test.js`
- Modify: `apps/product-swap/dish-ranking-renderer.js`

- [ ] **Step 1: Write failing selection and layout tests**

Create twelve stable ranking items and assert:

```js
assert.equal(selectRankingItems('tier', items).length, 12);
assert.deepEqual(
    selectRankingItems('grid-4', items).map(({ refId }) => refId),
    ['dish-0', 'dish-1', 'dish-2', 'dish-3'],
);
assert.equal(selectRankingItems('grid-9', items).length, 9);
assert.equal(selectRankingItems('hero', items).length, 5);
assert.equal(selectRankingItems('leaderboard', items).length, 9);
```

For each layout and canvas ratio, assert card count, no duplicate `refId`,
positive image/comment geometry, all rectangles inside the canvas, and no
pairwise overlap. Assert unknown layout returns tier geometry. Assert hero has
exactly one `role: 'hero'`; leaderboard has ranks `1`, `2`, `3`.

- [ ] **Step 2: Run renderer tests and verify RED**

Run:

```powershell
node --test tests/dish-ranking-renderer.test.js
```

Expected: FAIL because the selection and new layout functions are absent.

- [ ] **Step 3: Implement pure layout strategies**

Add immutable capacities:

```js
const LAYOUT_CAPACITIES = Object.freeze({
    tier: 12,
    'grid-4': 4,
    'grid-9': 9,
    hero: 5,
    leaderboard: 9,
});
```

Implement `selectRankingItems`, `layoutGridRanking`,
`layoutHeroRanking`, `layoutLeaderboardRanking`, and
`layoutDishRanking`. Each function returns:

```js
{
    kind,
    ratio,
    width,
    height,
    cards: [{
        refId,
        x,
        y,
        width,
        height,
        imageHeight,
        commentHeight,
        role,
        rank,
    }],
}
```

Keep tier rows in the tier result. Unknown layouts resolve to `tier`.

- [ ] **Step 4: Extend common Canvas drawing**

Make `renderDishRanking` accept `layout = 'tier'`, load only selected card
images, draw the tier rails only for `tier`, and otherwise draw layout headers,
cards, rank medals, comments, and owned badges through shared helpers. Preserve
the current PNG export API.

- [ ] **Step 5: Run renderer tests and verify GREEN**

Run the renderer test command. Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add -- apps/product-swap/dish-ranking-renderer.js apps/product-swap/tests/dish-ranking-renderer.test.js
git commit -m "feat: add deterministic dish ranking layouts"
```

### Task 5: Pass the selected layout through the creator

**Files:**
- Modify: `apps/product-swap/tests/frontend-contract.test.js`
- Modify: `apps/product-swap/script.js`

- [ ] **Step 1: Write failing integration contract**

Assert the dedicated renderer call includes:

```js
layout: payload.layout,
ratio: payload.aspectRatio,
```

and that the ranking draft request remains `payload.dishes` only.

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
node --test tests/frontend-contract.test.js
```

Expected: FAIL because `script.js` currently passes only `ratio`, `dishes`, and
`ranking`.

- [ ] **Step 3: Add the layout argument**

Pass `payload.layout` to `renderDishRankingDataUrl`; do not change the draft
request body or fallback behavior.

- [ ] **Step 4: Run test and verify GREEN**

Run the same test command. Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- apps/product-swap/script.js apps/product-swap/tests/frontend-contract.test.js
git commit -m "feat: render the selected dish layout"
```

### Task 6: Browser smoke and visual iteration

**Files:**
- Modify: `apps/product-swap/tests/dish-ranking-browser-smoke.js`
- Create or update: `apps/product-swap/art_reviews/dish-ranking-layout-gallery/layout-picker.jpg`
- Create or update: `apps/product-swap/art_reviews/dish-ranking-layout-gallery/tier.jpg`
- Create or update: `apps/product-swap/art_reviews/dish-ranking-layout-gallery/grid-4.jpg`
- Create or update: `apps/product-swap/art_reviews/dish-ranking-layout-gallery/grid-9.jpg`
- Create or update: `apps/product-swap/art_reviews/dish-ranking-layout-gallery/hero.jpg`
- Create or update: `apps/product-swap/art_reviews/dish-ranking-layout-gallery/leaderboard.jpg`
- Create: `apps/product-swap/art_reviews/dish-ranking-layout-gallery/report.md`

- [ ] **Step 1: Extend the browser smoke to select five layout cards**

Generate once per layout with the same intercepted mock endpoint. Assert five
preview buttons exist, each has a schematic child, each output decodes to
1080×1440 PNG, `rankingRequests === 5`, and
`imageGenerationRequests === 0`. Save a compressed page screenshot and
540-pixel JPEG previews only when `DISH_RANKING_REVIEW_DIR` is set.

- [ ] **Step 2: Run browser smoke**

Run:

```powershell
$env:DISH_RANKING_REVIEW_DIR='art_reviews/dish-ranking-layout-gallery'
node tests/dish-ranking-browser-smoke.js
Remove-Item Env:DISH_RANKING_REVIEW_DIR
```

Expected: exit 0, five ranking-only requests, zero image-generation requests.

- [ ] **Step 3: Inspect screenshots and write the review**

Score at least these criteria against a 7/10 target: fixed tier card size,
template picker clarity, grid spacing, hero focus, TOP-three hierarchy,
short-comment readability, and mobile overflow. If a critical criterion scores
below 7, adjust CSS or renderer geometry, rerun affected tests and smoke, and
capture one revised pass.

- [ ] **Step 4: Commit**

```powershell
git add -- apps/product-swap/tests/dish-ranking-browser-smoke.js apps/product-swap/art_reviews/dish-ranking-layout-gallery
git commit -m "test: verify dish ranking layout gallery"
```

### Task 7: Full verification and deployment

**Files:**
- Verify all modified files

- [ ] **Step 1: Run the full frontend suite**

```powershell
npm test
npm run build
node tests/dish-ranking-browser-smoke.js
```

Expected: all tests pass, build exits 0, browser smoke exits 0.

- [ ] **Step 2: Inspect final diff and repository status**

```powershell
git diff --check HEAD~6..HEAD
git status --short --branch
```

Expected: no whitespace errors; only the pre-existing untracked user document
may remain.

- [ ] **Step 3: Deploy the frontend**

```powershell
npm run deploy
```

Expected: Wrangler reports a new successful version for
`product-swap.mm0708.top`.

- [ ] **Step 4: Verify the production assets**

Check the production creator page and new renderer script return HTTP 200 and
contain the five layout values. Do not submit the production form, because a
live generation would consume an external AI request.

- [ ] **Step 5: Record final verification evidence**

Report test counts, build result, browser request counts, deployment version,
production URL, screenshot/report paths, and the fact that no live AI request
was made during automated verification.
