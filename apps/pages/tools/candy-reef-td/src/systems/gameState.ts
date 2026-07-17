import { levelPath, towerPads, type Point } from '../data/level-001';
import type { TowerKind } from '../data/towers';

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
  kind: TowerKind;
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

export const TOWER_COST = 40;

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
    coins: 160,
    elapsed: 0,
    nextEnemyId: 1,
    nextProjectileId: 1,
    enemies: [],
    towers: [],
    projectiles: [],
  };
}

export function placeTower(state: GameState, padId: string, kind: TowerKind = 'strawberry'): boolean {
  if (state.coins < TOWER_COST) return false;
  if (state.towers.some((tower) => tower.id === padId)) return false;

  const pad = towerPads.find((candidate) => candidate.id === padId);
  if (!pad) return false;

  state.towers.push({
    id: pad.id,
    kind,
    x: pad.x,
    y: pad.y,
    range: 420,
    cooldown: 0.75,
    cooldownLeft: 0,
  });
  state.coins -= TOWER_COST;
  return true;
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
  moveProjectiles(state, deltaSeconds);
  updateTowers(state, deltaSeconds);

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
