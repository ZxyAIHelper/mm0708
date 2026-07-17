import { describe, expect, it } from 'vitest';
import { candyReefLevel, levelPath, towerPads } from './level-001';

describe('Candy Reef level data', () => {
  it('keeps path, build slots, and deck slots in one level config', () => {
    expect(candyReefLevel.id).toBe('candy-reef-001');
    expect(candyReefLevel.world).toEqual({
      width: candyReefLevel.background.width,
      height: candyReefLevel.background.height,
    });
    expect(candyReefLevel.path.points).toHaveLength(19);
    expect(candyReefLevel.buildSlots).toHaveLength(9);
    expect(candyReefLevel.deckSlots).toHaveLength(5);
    expect(candyReefLevel.deckOverlay.destination.width).toBe(candyReefLevel.world.width);
  });

  it('keeps legacy path and pad exports backed by the level config', () => {
    expect(levelPath).toBe(candyReefLevel.path.points);
    expect(towerPads).toBe(candyReefLevel.buildSlots);
  });

  it('defines clickable radii for build slots and deck slots', () => {
    expect(candyReefLevel.buildSlots.every((slot) => slot.radius > 0)).toBe(true);
    expect(candyReefLevel.deckSlots.every((slot) => slot.radius > 0)).toBe(true);
  });
});
