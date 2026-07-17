# Product Swap Domain and Portal Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the product-swap Worker to `product-swap.mm0708.top` and link it from the tools portal.

**Architecture:** Declare a Worker Custom Domain in the existing product-swap Wrangler JSONC. Add one external-link card to the portal’s existing special-app grid, preserving all unrelated dirty changes.

**Tech Stack:** Cloudflare Workers Static Assets, Cloudflare Pages, Wrangler, HTML, Node test runner.

---

### Task 1: Domain and portal contract

**Files:**
- Create: `apps/pages/tests/product-swap-entry.test.js`
- Modify: `apps/product-swap/wrangler.jsonc`
- Modify: `apps/pages/index.html`

- [ ] **Step 1: Write the failing contract test**

```js
assert.match(html, /href="https:\/\/product-swap\.mm0708\.top"/)
assert.deepEqual(config.routes, [{
  pattern: 'product-swap.mm0708.top',
  custom_domain: true,
}])
```

- [ ] **Step 2: Verify the test fails**

Run: `node --test apps/pages/tests/product-swap-entry.test.js`
Expected: FAIL because the portal card and `routes` entry do not exist.

- [ ] **Step 3: Add the Custom Domain and portal card**

Add this Wrangler route:

```json
"routes": [{
  "pattern": "product-swap.mm0708.top",
  "custom_domain": true
}]
```

Add a `tool-card` in `#specialGrid` linking to `https://product-swap.mm0708.top` with `target="_blank"` and `rel="noopener noreferrer"`.

- [ ] **Step 4: Verify the contract passes**

Run: `node --test apps/pages/tests/product-swap-entry.test.js`
Expected: PASS.

### Task 2: Deploy and verify

**Files:**
- Modify only the files above if deployment validation identifies a real defect.

- [ ] **Step 1: Run product-swap build, tests, and Wrangler dry-run**

Run the product-swap Node tests, `node build.mjs`, and `wrangler deploy --dry-run`.
Expected: all feature tests pass and Wrangler accepts the custom domain.

- [ ] **Step 2: Deploy the product-swap Worker and portal**

Deploy `apps/product-swap` with Wrangler, then direct-upload `apps/pages` to the existing `pages` Pages project on branch `main`.
Expected: both deployments succeed.

- [ ] **Step 3: Verify production**

Request `https://product-swap.mm0708.top/` and `https://mm0708.top/`.
Expected: both return 200, and the portal HTML contains the custom-domain link.

- [ ] **Step 4: Commit only scoped changes**

Stage the Wrangler config, new portal test, two docs, and only the new portal-card hunk from the already-dirty `apps/pages/index.html`. Commit with `feat: add product swap portal entry`.
