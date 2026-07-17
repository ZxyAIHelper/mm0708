import { describe, expect, it } from 'vitest';
import { createInitialState, placeTower, spawnEnemy, updateState } from './gameState';

describe('Candy Reef tower defense state', () => {
  it('starts with lives and coins without pre-placed towers', () => {
    const state = createInitialState();

    expect(state.lives).toBe(10);
    expect(state.coins).toBe(160);
    expect(state.towers).toHaveLength(0);
    expect(state.enemies).toHaveLength(0);
    expect(state.projectiles).toHaveLength(0);
  });

  it('places a tower on an open pad and spends coins', () => {
    const state = createInitialState();

    const placed = placeTower(state, 'pad-5', 'orange');

    expect(placed).toBe(true);
    expect(state.coins).toBe(120);
    expect(state.towers).toEqual([
      expect.objectContaining({ id: 'pad-5', kind: 'orange', x: 352, y: 716 }),
    ]);
  });

  it('does not place a tower on an occupied pad', () => {
    const state = createInitialState();

    expect(placeTower(state, 'pad-5')).toBe(true);
    expect(placeTower(state, 'pad-5')).toBe(false);

    expect(state.coins).toBe(120);
    expect(state.towers).toHaveLength(1);
  });

  it('spawns enemies at the beginning of the path with unique ids', () => {
    const state = createInitialState();

    spawnEnemy(state);
    spawnEnemy(state);

    expect(state.enemies).toHaveLength(2);
    expect(state.enemies[0]).toMatchObject({ id: 1, x: 666, y: 1100, hp: 3 });
    expect(state.enemies[1]).toMatchObject({ id: 2, x: 666, y: 1100, hp: 3 });
  });

  it('moves spawned enemies upward from the bottom entrance', () => {
    const state = createInitialState();
    spawnEnemy(state);

    updateState(state, 1);

    expect(state.enemies[0].x).toBeGreaterThanOrEqual(666);
    expect(state.enemies[0].y).toBeLessThan(1100);
  });

  it('fires projectiles at enemies inside tower range', () => {
    const state = createInitialState();
    placeTower(state, 'pad-9');
    spawnEnemy(state);

    updateState(state, 1.8);

    expect(state.projectiles.length).toBeGreaterThan(0);
  });

  it('removes enemies and awards coins when projectiles deal lethal damage', () => {
    const state = createInitialState();
    spawnEnemy(state);
    state.enemies[0].hp = 1;
    state.projectiles.push({
      id: 1,
      x: state.enemies[0].x - 4,
      y: state.enemies[0].y,
      targetId: state.enemies[0].id,
      speed: 520,
      damage: 1,
    });

    updateState(state, 0.1);

    expect(state.enemies).toHaveLength(0);
    expect(state.coins).toBe(165);
  });
});
