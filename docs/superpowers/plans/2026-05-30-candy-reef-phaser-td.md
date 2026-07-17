# Candy Reef Phaser TD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Phaser + Vite + TypeScript tower defense prototype under the existing Pages app, using the Candy Reef art-direction assets as the visual baseline.

**Architecture:** Keep the game as an isolated Phaser project at `apps/pages/tools/candy-reef-td`, with runtime game rules in TypeScript systems and Phaser scenes limited to rendering, input, camera, and effects. Use the existing art-direction files directly when practical, starting with the generated map source as the background and copying source/reference files into a local asset folder before introducing cut sprites.

**Tech Stack:** Phaser, TypeScript, Vite, pnpm workspace, Cloudflare Pages static hosting.

---

## File Structure

- Create `apps/pages/tools/candy-reef-td/package.json`: local Phaser game package with `dev`, `build`, and `preview` scripts.
- Create `apps/pages/tools/candy-reef-td/index.html`: Vite HTML entry.
- Create `apps/pages/tools/candy-reef-td/src/main.ts`: Phaser bootstrap.
- Create `apps/pages/tools/candy-reef-td/src/scenes/BootScene.ts`: asset preload.
- Create `apps/pages/tools/candy-reef-td/src/scenes/GameScene.ts`: map, tower pads, enemies, projectiles, and basic HUD bridge.
- Create `apps/pages/tools/candy-reef-td/src/systems/gameState.ts`: deterministic tower defense state and update loop.
- Create `apps/pages/tools/candy-reef-td/src/data/level-001.ts`: path points, tower pads, initial waves, and tower definitions.
- Create `apps/pages/tools/candy-reef-td/src/ui/hud.ts`: DOM HUD setup and updates.
- Create `apps/pages/tools/candy-reef-td/src/styles.css`: page and HUD layout.
- Create `apps/pages/tools/candy-reef-td/public/assets/candy-reef/source/*`: copied art-direction source/reference PNG and notes.
- Create `apps/pages/tools/candy-reef-td/vite.config.ts`: base path for Cloudflare Pages nested deployment.
- Modify `pnpm-workspace.yaml`: include nested tool package if needed.
- Modify `apps/pages/index.html`: add a portal card for the new game after the prototype is buildable.

### Task 1: Scaffold The Phaser Project

**Files:**
- Create: `apps/pages/tools/candy-reef-td/package.json`
- Create: `apps/pages/tools/candy-reef-td/index.html`
- Create: `apps/pages/tools/candy-reef-td/vite.config.ts`
- Create: `apps/pages/tools/candy-reef-td/tsconfig.json`
- Create: `apps/pages/tools/candy-reef-td/src/main.ts`
- Create: `apps/pages/tools/candy-reef-td/src/styles.css`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Create package metadata**

Use `apply_patch` to add `apps/pages/tools/candy-reef-td/package.json`:

```json
{
  "name": "candy-reef-td",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host 0.0.0.0"
  },
  "dependencies": {
    "phaser": "^3.90.0"
  },
  "devDependencies": {
    "@vitejs/plugin-basic-ssl": "^2.1.0",
    "typescript": "^5.9.3",
    "vite": "^7.2.4"
  }
}
```

- [ ] **Step 2: Create Vite config with nested base path**

Use `apply_patch` to add `apps/pages/tools/candy-reef-td/vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5174,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
```

- [ ] **Step 3: Create TypeScript config**

Use `apply_patch` to add `apps/pages/tools/candy-reef-td/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create HTML and bootstrap**

Use `apply_patch` to add `index.html`, `src/main.ts`, and `src/styles.css`.

`index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Candy Reef Defense</title>
  </head>
  <body>
    <div id="app">
      <div id="game-root"></div>
      <div id="hud-root"></div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:

```ts
import Phaser from 'phaser';
import './styles.css';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#6bd8e8',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1024,
    height: 1536,
  },
  render: {
    pixelArt: false,
    antialias: true,
  },
  scene: [],
};

new Phaser.Game(config);
```

`src/styles.css`:

```css
html,
body {
  margin: 0;
  min-height: 100%;
  overflow: hidden;
  background: #6bd8e8;
  font-family: ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

#app,
#game-root {
  width: 100vw;
  height: 100dvh;
}

canvas {
  display: block;
}
```

- [ ] **Step 5: Register nested package in the workspace**

Modify `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "apps/pages/tools/candy-reef-td"
  - "packages/*"
```

- [ ] **Step 6: Install dependencies**

Run:

```bash
pnpm install --registry=https://registry.npmjs.org
```

Expected: dependencies install and `pnpm-lock.yaml` updates without registry timeout.

- [ ] **Step 7: Verify empty scaffold builds**

Run:

```bash
pnpm --filter candy-reef-td build
```

Expected: `tsc --noEmit` and `vite build` complete, producing `apps/pages/tools/candy-reef-td/dist`.

### Task 2: Copy And Catalog Candy Reef Assets

**Files:**
- Create: `apps/pages/tools/candy-reef-td/public/assets/candy-reef/source/candy-reef-map-source.png`
- Create: `apps/pages/tools/candy-reef-td/public/assets/candy-reef/source/candy-reef-tower-source.png`
- Create: `apps/pages/tools/candy-reef-td/public/assets/candy-reef/source/candy-reef-enemy-source.png`
- Create: `apps/pages/tools/candy-reef-td/public/assets/candy-reef/source/candy-reef-deck-source.png`
- Create: `apps/pages/tools/candy-reef-td/public/assets/candy-reef/reference/candy-reef-gameplay-target.png`
- Create: `apps/pages/tools/candy-reef-td/public/assets/candy-reef/reference/candy-reef-asset-board-target.png`
- Create: `apps/pages/tools/candy-reef-td/src/data/assets.ts`

- [ ] **Step 1: Copy source and reference files**

Run these PowerShell commands:

```powershell
New-Item -ItemType Directory -Force apps\pages\tools\candy-reef-td\public\assets\candy-reef\source | Out-Null
New-Item -ItemType Directory -Force apps\pages\tools\candy-reef-td\public\assets\candy-reef\reference | Out-Null
Copy-Item -LiteralPath E:\WorkSpace\JS\mgame-battle-merge\docs\art-direction\generated-source\candy-reef-map-source.png -Destination apps\pages\tools\candy-reef-td\public\assets\candy-reef\source\candy-reef-map-source.png
Copy-Item -LiteralPath E:\WorkSpace\JS\mgame-battle-merge\docs\art-direction\generated-source\candy-reef-tower-source.png -Destination apps\pages\tools\candy-reef-td\public\assets\candy-reef\source\candy-reef-tower-source.png
Copy-Item -LiteralPath E:\WorkSpace\JS\mgame-battle-merge\docs\art-direction\generated-source\candy-reef-enemy-source.png -Destination apps\pages\tools\candy-reef-td\public\assets\candy-reef\source\candy-reef-enemy-source.png
Copy-Item -LiteralPath E:\WorkSpace\JS\mgame-battle-merge\docs\art-direction\generated-source\candy-reef-deck-source.png -Destination apps\pages\tools\candy-reef-td\public\assets\candy-reef\source\candy-reef-deck-source.png
Copy-Item -LiteralPath E:\WorkSpace\JS\mgame-battle-merge\docs\art-direction\candy-reef-gameplay-target.png -Destination apps\pages\tools\candy-reef-td\public\assets\candy-reef\reference\candy-reef-gameplay-target.png
Copy-Item -LiteralPath E:\WorkSpace\JS\mgame-battle-merge\docs\art-direction\candy-reef-asset-board-target.png -Destination apps\pages\tools\candy-reef-td\public\assets\candy-reef\reference\candy-reef-asset-board-target.png
```

- [ ] **Step 2: Add asset manifest keys**

Create `src/data/assets.ts`:

```ts
export const AssetKeys = {
  map: 'candy-reef-map',
  towerSource: 'candy-reef-tower-source',
  enemySource: 'candy-reef-enemy-source',
  deckSource: 'candy-reef-deck-source',
} as const;

export const AssetPaths = {
  [AssetKeys.map]: 'assets/candy-reef/source/candy-reef-map-source.png',
  [AssetKeys.towerSource]: 'assets/candy-reef/source/candy-reef-tower-source.png',
  [AssetKeys.enemySource]: 'assets/candy-reef/source/candy-reef-enemy-source.png',
  [AssetKeys.deckSource]: 'assets/candy-reef/source/candy-reef-deck-source.png',
} as const;
```

- [ ] **Step 3: Verify copied assets exist**

Run:

```powershell
Get-ChildItem apps\pages\tools\candy-reef-td\public\assets\candy-reef -Recurse -File | Select-Object Name,Length
```

Expected: six PNG files are listed.

### Task 3: Add Phaser Scenes And Render The Map

**Files:**
- Modify: `apps/pages/tools/candy-reef-td/src/main.ts`
- Create: `apps/pages/tools/candy-reef-td/src/scenes/BootScene.ts`
- Create: `apps/pages/tools/candy-reef-td/src/scenes/GameScene.ts`
- Modify: `apps/pages/tools/candy-reef-td/src/data/assets.ts`

- [ ] **Step 1: Add BootScene preload**

Create `src/scenes/BootScene.ts`:

```ts
import Phaser from 'phaser';
import { AssetPaths } from '../data/assets';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    for (const [key, path] of Object.entries(AssetPaths)) {
      this.load.image(key, path);
    }
  }

  create(): void {
    this.scene.start('GameScene');
  }
}
```

- [ ] **Step 2: Add GameScene map rendering**

Create `src/scenes/GameScene.ts`:

```ts
import Phaser from 'phaser';
import { AssetKeys } from '../data/assets';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create(): void {
    this.add.image(512, 768, AssetKeys.map).setDisplaySize(1024, 1536);
  }
}
```

- [ ] **Step 3: Register scenes**

Modify `src/main.ts`:

```ts
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import './styles.css';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#6bd8e8',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1024,
    height: 1536,
  },
  render: {
    pixelArt: false,
    antialias: true,
  },
  scene: [BootScene, GameScene],
};

new Phaser.Game(config);
```

- [ ] **Step 4: Build and run local dev server**

Run:

```bash
pnpm --filter candy-reef-td build
pnpm --filter candy-reef-td dev
```

Expected: build passes, dev server starts on `http://localhost:5174`.

### Task 4: Implement Minimal Tower Defense State

**Files:**
- Create: `apps/pages/tools/candy-reef-td/src/data/level-001.ts`
- Create: `apps/pages/tools/candy-reef-td/src/systems/gameState.ts`
- Create: `apps/pages/tools/candy-reef-td/src/systems/gameState.test.ts` if a test runner is added, otherwise validate with a browser smoke test.

- [ ] **Step 1: Add level data**

Create `src/data/level-001.ts`:

```ts
export type Point = {
  x: number;
  y: number;
};

export type TowerPad = Point & {
  id: string;
};

export const levelPath: Point[] = [
  { x: 520, y: 250 },
  { x: 760, y: 360 },
  { x: 700, y: 520 },
  { x: 250, y: 615 },
  { x: 245, y: 810 },
  { x: 760, y: 910 },
  { x: 750, y: 1120 },
  { x: 520, y: 1360 },
];

export const towerPads: TowerPad[] = [
  { id: 'pad-1', x: 300, y: 360 },
  { id: 'pad-2', x: 285, y: 520 },
  { id: 'pad-3', x: 500, y: 560 },
  { id: 'pad-4', x: 705, y: 565 },
  { id: 'pad-5', x: 275, y: 900 },
  { id: 'pad-6', x: 505, y: 905 },
  { id: 'pad-7', x: 735, y: 900 },
  { id: 'pad-8', x: 360, y: 1160 },
  { id: 'pad-9', x: 545, y: 1160 },
];
```

- [ ] **Step 2: Add deterministic game state**

Create `src/systems/gameState.ts`:

```ts
import { levelPath, towerPads, type Point } from '../data/level-001';

export type Enemy = {
  id: number;
  hp: number;
  speed: number;
  pathIndex: number;
  x: number;
  y: number;
  reachedBase: boolean;
};

export type Tower = {
  id: string;
  x: number;
  y: number;
  range: number;
  cooldown: number;
  cooldownLeft: number;
};

export type Projectile = {
  id: number;
  x: number;
  y: number;
  targetId: number;
  speed: number;
  damage: number;
};

export type GameState = {
  lives: number;
  coins: number;
  elapsed: number;
  nextEnemyId: number;
  nextProjectileId: number;
  enemies: Enemy[];
  towers: Tower[];
  projectiles: Projectile[];
};

export function createInitialState(): GameState {
  return {
    lives: 10,
    coins: 120,
    elapsed: 0,
    nextEnemyId: 1,
    nextProjectileId: 1,
    enemies: [],
    towers: towerPads.slice(0, 3).map((pad) => ({
      id: pad.id,
      x: pad.x,
      y: pad.y,
      range: 190,
      cooldown: 0.75,
      cooldownLeft: 0,
    })),
    projectiles: [],
  };
}

export function spawnEnemy(state: GameState): void {
  const start = levelPath[0];
  state.enemies.push({
    id: state.nextEnemyId,
    hp: 3,
    speed: 78,
    pathIndex: 0,
    x: start.x,
    y: start.y,
    reachedBase: false,
  });
  state.nextEnemyId += 1;
}

export function updateState(state: GameState, deltaSeconds: number): void {
  state.elapsed += deltaSeconds;
  if (Math.floor((state.elapsed - deltaSeconds) / 1.6) !== Math.floor(state.elapsed / 1.6)) {
    spawnEnemy(state);
  }

  moveEnemies(state, deltaSeconds);
  updateTowers(state, deltaSeconds);
  moveProjectiles(state, deltaSeconds);

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0 && !enemy.reachedBase);
}

function moveEnemies(state: GameState, deltaSeconds: number): void {
  for (const enemy of state.enemies) {
    const next = levelPath[enemy.pathIndex + 1];
    if (!next) {
      enemy.reachedBase = true;
      state.lives = Math.max(0, state.lives - 1);
      continue;
    }

    moveToward(enemy, next, enemy.speed * deltaSeconds);
    if (distance(enemy, next) < 4) {
      enemy.pathIndex += 1;
    }
  }
}

function updateTowers(state: GameState, deltaSeconds: number): void {
  for (const tower of state.towers) {
    tower.cooldownLeft = Math.max(0, tower.cooldownLeft - deltaSeconds);
    if (tower.cooldownLeft > 0) continue;

    const target = state.enemies.find((enemy) => distance(tower, enemy) <= tower.range);
    if (!target) continue;

    state.projectiles.push({
      id: state.nextProjectileId,
      x: tower.x,
      y: tower.y,
      targetId: target.id,
      speed: 520,
      damage: 1,
    });
    state.nextProjectileId += 1;
    tower.cooldownLeft = tower.cooldown;
  }
}

function moveProjectiles(state: GameState, deltaSeconds: number): void {
  for (const projectile of state.projectiles) {
    const target = state.enemies.find((enemy) => enemy.id === projectile.targetId);
    if (!target) {
      projectile.targetId = -1;
      continue;
    }

    moveToward(projectile, target, projectile.speed * deltaSeconds);
    if (distance(projectile, target) < 18) {
      target.hp -= projectile.damage;
      projectile.targetId = -1;
      if (target.hp <= 0) {
        state.coins += 5;
      }
    }
  }

  state.projectiles = state.projectiles.filter((projectile) => projectile.targetId !== -1);
}

function moveToward(position: Point, target: Point, amount: number): void {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const length = Math.hypot(dx, dy);
  if (length <= amount || length === 0) {
    position.x = target.x;
    position.y = target.y;
    return;
  }

  position.x += (dx / length) * amount;
  position.y += (dy / length) * amount;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
```

- [ ] **Step 3: Add visual adapter in GameScene**

Modify `src/scenes/GameScene.ts` to create simple circles and cannon placeholders before sprite slicing:

```ts
import Phaser from 'phaser';
import { AssetKeys } from '../data/assets';
import { towerPads } from '../data/level-001';
import { createInitialState, updateState, type GameState } from '../systems/gameState';

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private enemyLayer!: Phaser.GameObjects.Container;
  private projectileLayer!: Phaser.GameObjects.Container;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.state = createInitialState();
    this.add.image(512, 768, AssetKeys.map).setDisplaySize(1024, 1536);
    this.enemyLayer = this.add.container(0, 0);
    this.projectileLayer = this.add.container(0, 0);

    for (const pad of towerPads) {
      this.add.circle(pad.x, pad.y, 48, 0xf4c06d, 0.3).setStrokeStyle(3, 0x9d6a2a, 0.45);
    }

    for (const tower of this.state.towers) {
      this.add.circle(tower.x, tower.y, 36, 0xff7aa8, 0.9).setStrokeStyle(4, 0xffffff, 0.7);
      this.add.rectangle(tower.x + 26, tower.y - 8, 54, 18, 0xf1517e, 1).setRotation(-0.2);
    }
  }

  update(_time: number, delta: number): void {
    updateState(this.state, delta / 1000);
    this.drawDynamicObjects();
  }

  private drawDynamicObjects(): void {
    this.enemyLayer.removeAll(true);
    this.projectileLayer.removeAll(true);

    for (const enemy of this.state.enemies) {
      const body = this.add.circle(enemy.x, enemy.y, 22, 0x3b8eff, 1).setStrokeStyle(4, 0xffffff, 0.75);
      this.enemyLayer.add(body);
    }

    for (const projectile of this.state.projectiles) {
      const candy = this.add.ellipse(projectile.x, projectile.y, 28, 16, 0xff8a00, 1).setRotation(this.time.now / 120);
      this.projectileLayer.add(candy);
    }
  }
}
```

- [ ] **Step 4: Verify gameplay loop**

Run:

```bash
pnpm --filter candy-reef-td build
```

Expected: build passes. In browser, enemies move along the candy path, towers fire projectile placeholders, enemies lose health, and lives decrease if enemies reach the base.

### Task 5: Add DOM HUD And Portal Entry

**Files:**
- Create: `apps/pages/tools/candy-reef-td/src/ui/hud.ts`
- Modify: `apps/pages/tools/candy-reef-td/src/scenes/GameScene.ts`
- Modify: `apps/pages/tools/candy-reef-td/src/styles.css`
- Modify: `apps/pages/index.html`

- [ ] **Step 1: Create HUD module**

Create `src/ui/hud.ts`:

```ts
export type HudValues = {
  lives: number;
  coins: number;
  enemies: number;
};

export function createHud(root: HTMLElement): (values: HudValues) => void {
  root.innerHTML = `
    <div class="hud-top">
      <button class="hud-icon" type="button" aria-label="Pause">II</button>
      <div class="hud-pill"><span>Coins</span><strong data-hud="coins">0</strong></div>
      <div class="hud-pill"><span>Lives</span><strong data-hud="lives">0</strong></div>
      <div class="hud-pill"><span>Wave</span><strong data-hud="enemies">0</strong></div>
      <button class="hud-icon" type="button" aria-label="Home">H</button>
    </div>
  `;

  const coins = root.querySelector<HTMLElement>('[data-hud="coins"]');
  const lives = root.querySelector<HTMLElement>('[data-hud="lives"]');
  const enemies = root.querySelector<HTMLElement>('[data-hud="enemies"]');

  return (values) => {
    if (coins) coins.textContent = String(values.coins);
    if (lives) lives.textContent = String(values.lives);
    if (enemies) enemies.textContent = String(values.enemies);
  };
}
```

- [ ] **Step 2: Style HUD**

Append to `src/styles.css`:

```css
#hud-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.hud-top {
  position: absolute;
  top: max(12px, env(safe-area-inset-top));
  left: max(12px, env(safe-area-inset-left));
  right: max(12px, env(safe-area-inset-right));
  display: grid;
  grid-template-columns: 52px 1fr 1fr 1fr 52px;
  gap: 8px;
  align-items: center;
}

.hud-icon,
.hud-pill {
  min-height: 44px;
  border: 2px solid rgba(126, 72, 31, 0.36);
  border-radius: 8px;
  background: linear-gradient(#ffe8b7, #f8bf72);
  box-shadow: 0 5px 0 rgba(117, 62, 21, 0.32);
  color: #7b3b1e;
}

.hud-icon {
  pointer-events: auto;
  font-weight: 900;
}

.hud-pill {
  display: grid;
  place-items: center;
  line-height: 1;
  padding: 4px 8px;
}

.hud-pill span {
  font-size: 11px;
  font-weight: 800;
}

.hud-pill strong {
  font-size: 18px;
}
```

- [ ] **Step 3: Connect HUD in GameScene**

Modify `src/scenes/GameScene.ts` to call `createHud` in `create()` and update it after state updates.

- [ ] **Step 4: Add portal card**

Modify `apps/pages/index.html` by adding a card in `specialGrid`:

```html
<a href="tools/candy-reef-td/dist/index.html" class="tool-card" data-category="special"
    style="text-decoration: none; color: inherit;">
    <div class="tool-icon">&#x1F36C;</div>
    <h3 class="tool-title">Candy Reef Defense</h3>
    <p class="tool-description">糖果海岛塔防原型，使用 Phaser 驱动的竖屏防守玩法。</p>
</a>
```

- [ ] **Step 5: Verify portal path**

Run:

```bash
pnpm --filter candy-reef-td build
```

Then open:

```text
apps/pages/tools/candy-reef-td/dist/index.html
```

Expected: game loads from the built static output and map assets resolve with relative paths.

### Task 6: Local Browser Verification

**Files:**
- No source edits unless verification finds a bug.

- [ ] **Step 1: Start the dev server**

Run:

```bash
pnpm --filter candy-reef-td dev
```

Expected: Vite serves on `http://localhost:5174`.

- [ ] **Step 2: Use Browser to inspect desktop**

Open `http://localhost:5174`, take a screenshot, and verify:

- The map is visible and fills the canvas.
- HUD text does not overlap the playfield center.
- Enemies and projectiles are visible within 10 seconds.
- No console errors mention missing assets.

- [ ] **Step 3: Use Browser to inspect mobile viewport**

Set a mobile viewport such as `390x844`, reload, and verify:

- The full vertical game is visible with expected letterboxing or fit scaling.
- HUD remains inside safe areas.
- Canvas is not blank.

- [ ] **Step 4: Run production build**

Run:

```bash
pnpm --filter candy-reef-td build
```

Expected: production build succeeds and `dist/assets` contains bundled JS/CSS.

## Self-Review

- Spec coverage: The plan creates a Phaser/Vite project, copies available Candy Reef assets, uses the map source directly, adds a minimal tower defense loop, renders placeholders until sprites are cut, adds a DOM HUD, and verifies Cloudflare Pages-compatible static output.
- Placeholder scan: The plan avoids deferred implementation placeholders. The only intentionally temporary visual choice is explicit: simple circles and rectangles stand in until cut runtime sprites are prepared from the approved art board.
- Type consistency: `Point`, `TowerPad`, `GameState`, `Enemy`, `Tower`, and `Projectile` types are defined before use. Scene imports match the planned module paths.
