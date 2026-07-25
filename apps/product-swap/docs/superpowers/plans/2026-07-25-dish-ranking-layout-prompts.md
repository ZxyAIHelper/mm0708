# Dish Ranking Layout Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four short dish-ranking layout hints with explicit prompt-only composition contracts derived from the approved reference images.

**Architecture:** Keep the request schema, image count, provider call, and UI unchanged. Define the same detailed common and per-layout constraints in the local template prompt and the Cloudflare API prompt, with contract tests preventing the two generation paths from drifting.

**Tech Stack:** CommonJS, TypeScript, Node.js test runner, Vitest, Cloudflare Workers/Wrangler.

---

### Task 1: Lock the local layout contracts with tests

**Files:**
- Modify: `apps/product-swap/tests/dish-ranking-prompt.test.js`
- Modify: `apps/product-swap/template-packs/dish-ranking-guide/prompt.js`

- [ ] **Step 1: Write the failing local prompt assertions**

Replace the broad layout test with assertions for the approved structural rules:

```js
test('describes every ranking guide layout precisely', () => {
    const tier = buildPrompt({ layout: 'tier' });
    assert.match(tier, /纯白或浅米白背景/);
    assert.match(tier, /左侧固定档位栏约占画布宽度 18%/);
    assert.match(tier, /每个档位独占一行/);
    assert.match(tier, /全部自家菜品放入“夯”档/);

    const grid = buildPrompt({ layout: 'grid' });
    assert.match(grid, /固定三列/);
    assert.match(grid, /6 张时使用 3×2/);
    assert.match(grid, /10～12 张时使用 3×4/);
    assert.match(grid, /半透明黑色文字带/);

    const quad = buildPrompt({ layout: 'quad' });
    assert.match(quad, /2×2 四个矩形区域/);
    assert.match(quad, /输入超过四张时/);
    assert.match(quad, /不得覆盖超过任一区域高度的 20%/);

    const collage = buildPrompt({ layout: 'collage' });
    assert.match(collage, /三列隐形网格/);
    assert.match(collage, /大、中、小三级卡片尺寸/);
    assert.match(collage, /不旋转、不相互覆盖/);
});

test('adds common fidelity and platform-chrome exclusions', () => {
    const prompt = buildPrompt({ layout: 'tier' });
    assert.match(prompt, /所有输入菜品必须各出现一次/);
    assert.match(prompt, /不得遗漏、重复或把不同菜品融合/);
    assert.match(prompt, /短视频平台头像、点赞栏、评论栏/);
});
```

- [ ] **Step 2: Run the local test and verify it fails**

Run:

```powershell
node --test apps/product-swap/tests/dish-ranking-prompt.test.js
```

Expected: the new detailed layout assertions fail against the current one-sentence rules.

- [ ] **Step 3: Implement the detailed local prompt constants**

Change `LAYOUT_RULES` so each value is an array of complete constraints and spread the selected array into `buildPrompt`. Add common rules requiring every input once, fidelity, readable 2–6 character labels, no fabricated facts, and no social-platform UI chrome. Preserve the existing untrusted-user-intent delimiters and refinement rules.

The four rule arrays must encode:

```js
const LAYOUT_RULES = {
    tier: [
        '使用紧凑的白底纵向等级榜。',
        '使用纯白或浅米白背景，不使用深色背景、渐变、纹理或大面积装饰。',
        '左侧固定档位栏约占画布宽度 18%，从上到下依次显示“夯 / 顶级 / 人上人 / NPC / 拉完了”。',
        '右侧菜品区约占画布宽度 82%，每个档位独占一行；档位文字左对齐并在对应行垂直居中。',
        '菜品卡片统一为竖版缩略图、等高、无旋转、无重叠；同一行从左到右紧凑排列，卡片之间保留一致窄间距。',
        '每张图片下方放一行 2～6 字短名称或短评，文字水平居中，不能进入相邻卡片。',
        '全部自家菜品放入“夯”档并排在该行最前；其他菜品随机分布在其余四档，数量尽量均衡。',
        '输入数量不足时允许留白，不得复制菜品补位；输入较多时缩小卡片，但仍保持文字可读。',
        '档位之间只用留白区分，不使用粗边框、悬浮卡片、大标题或海报式拼贴。',
    ],
    grid: [
        '使用满版规则点评网格和深灰或黑色背景。',
        '固定三列；6 张时使用 3×2，7～9 张时使用 3×3，10～12 张时使用 3×4。',
        '所有格子等宽、同一行等高，只用 2～4 像素深色细分隔线。',
        '每格顶部或底部使用半透明黑色文字带，放置 2～6 字白色短评。',
        '自家菜优先放在左上、第一行或网格中心，并使用最积极评价。',
        '不使用圆角、投影、旋转、悬浮、独立大标题或大面积空白。',
    ],
    quad: [
        '使用严格的四宫格攻略，主体划分为 2×2 四个矩形区域，并用 2～4 像素浅色线分隔。',
        '自家菜放在左上或右上；多道自家菜优先占据上方两个区域。',
        '每区以一道菜为主；输入超过四张时，在区域内部使用规则的左右双图或上下双图。',
        '允许中央横跨两列放置两至三行白色粗体攻略标题，并使用半透明暗色底。',
        '中央文字带不得覆盖超过任一区域高度的 20%，也不得遮挡菜品焦点。',
        '不使用自由旋转、跨区悬浮或不规则留白。',
    ],
    collage: [
        '使用纯黑或深灰背景的错落拼贴海报，以三列隐形网格组织全部卡片。',
        '采用大、中、小三级卡片尺寸；中间列或画布上半区设置最大主卡，自家菜占据最大卡片并优先出现在首屏。',
        '其他卡片从上到下、从中心向两侧排列，允许高度错落，但边缘必须对齐。',
        '卡片之间保持统一深色间距，不旋转、不相互覆盖，不使用撕纸、贴纸或相框效果。',
        '每张图附近放置 2～6 字白色描边短评，只能位于本卡片安全区域或紧邻卡片下方。',
        '菜品少时扩大主卡并增加留白；菜品多时缩小次要卡片，但每张菜仍须可辨认。',
    ],
};
```

- [ ] **Step 4: Run the local prompt tests**

Run:

```powershell
node --test apps/product-swap/tests/dish-ranking-prompt.test.js
```

Expected: all dish-ranking prompt tests pass.

- [ ] **Step 5: Commit the local prompt change**

```powershell
git add apps/product-swap/tests/dish-ranking-prompt.test.js apps/product-swap/template-packs/dish-ranking-guide/prompt.js
git commit -m "feat: detail dish ranking layout prompts"
```

### Task 2: Keep the production API prompt in sync

**Files:**
- Modify: `apps/my-cloud-hub/src/projects/product-swap/__tests__/template-strategies.test.ts`
- Modify: `apps/my-cloud-hub/src/projects/product-swap/template-strategies.ts`

- [ ] **Step 1: Write failing production prompt assertions**

Add a table-driven test that generates all four layouts and checks the same distinguishing phrases used by the local test:

```ts
it.each([
    ['tier', ['纯白或浅米白背景', '档位栏约占画布宽度 18%', '每个档位独占一行']],
    ['grid', ['固定三列', '6 张时使用 3×2', '半透明黑色文字带']],
    ['quad', ['2×2 四个矩形区域', '输入超过四张时', '区域高度的 20%']],
    ['collage', ['三列隐形网格', '大、中、小三级卡片尺寸', '不旋转、不相互覆盖']],
] as const)('builds the detailed %s layout contract', (layout, phrases) => {
    const generation = buildTemplateGeneration(validateTemplateRequest({
        templateId: 'dish-ranking-guide',
        dishes: [{ image: ownedDishImage, owned: true, source: 'user' }],
        layout,
        aspectRatio: '3:4',
    }));
    for (const phrase of phrases) {
        expect(generation.prompt).toContain(phrase);
    }
});
```

- [ ] **Step 2: Run the production strategy test and verify it fails**

Run:

```powershell
npm test -- --run src/projects/product-swap/__tests__/template-strategies.test.ts
```

Working directory: `apps/my-cloud-hub`.

Expected: the detailed phrase assertions fail.

- [ ] **Step 3: Implement the production layout arrays**

Replace `DISH_RANKING_LAYOUT_RULES` string values with arrays containing the same approved constraints from Task 1. In `buildDishRankingPrompt`, spread `...DISH_RANKING_LAYOUT_RULES[input.layout]` into the prompt array. Add the same common fidelity, one-copy-only, readable-label, and social-platform-chrome exclusions.

- [ ] **Step 4: Run production and frontend regression tests**

Run:

```powershell
npm test -- --run src/projects/product-swap/__tests__
```

Working directory: `apps/my-cloud-hub`.

Expected: 34 product-swap tests pass and the live Volcano test remains skipped.

Run:

```powershell
npm test
```

Working directory: `apps/product-swap`.

Expected: the full frontend/server test suite passes.

- [ ] **Step 5: Commit the production prompt change**

```powershell
git add apps/my-cloud-hub/src/projects/product-swap/__tests__/template-strategies.test.ts apps/my-cloud-hub/src/projects/product-swap/template-strategies.ts
git commit -m "feat: sync detailed ranking prompts to cloud api"
```

### Task 3: Publish and verify the prompt update

**Files:**
- Verify only: `apps/my-cloud-hub/wrangler.toml`

- [ ] **Step 1: Dry-run the Worker bundle**

Run:

```powershell
npm run deploy -- --dry-run
```

Working directory: `apps/my-cloud-hub`.

Expected: Wrangler reports a successful bundle and `--dry-run: exiting now.`

- [ ] **Step 2: Deploy the Worker**

Run:

```powershell
npm run deploy
```

Working directory: `apps/my-cloud-hub`.

Expected: Wrangler reports a new Worker version ID.

- [ ] **Step 3: Verify the live route and refresh the existing page**

Send an invalid empty-dish request to `https://api.mm0708.top/api/product-swap/generate` with template ID `dish-ranking-guide`. Expected: HTTP 400 with `INVALID_INPUT` and `菜品图片无效`, proving the live Worker recognizes the template. Refresh `http://127.0.0.1:8791/create.html?template=dish-ranking-guide` in the existing browser tab and leave it open for the user.

- [ ] **Step 4: Confirm repository state**

Run:

```powershell
git status --short --branch
```

Expected: branch `codex/dish-ranking-guide` with no uncommitted changes.
