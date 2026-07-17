export type Point = {
  x: number;
  y: number;
};

export type Rect = Point & {
  width: number;
  height: number;
};

export type TowerPad = Point & {
  id: string;
  radius: number;
};

export type DeckSlot = Point & {
  id: string;
  radius: number;
};

export type LevelConfig = {
  id: string;
  background: {
    key: string;
    width: number;
    height: number;
  };
  world: {
    width: number;
    height: number;
  };
  path: {
    points: Point[];
    debugColor: number;
  };
  deckOverlay: {
    source: Rect;
    destination: Rect;
  };
  buildSlots: TowerPad[];
  deckSlots: DeckSlot[];
};

export const candyReefLevel: LevelConfig = {
  id: 'candy-reef-001',
  background: {
    key: 'candy-reef-map',
    width: 1024,
    height: 1536,
  },
  world: {
    width: 1024,
    height: 1536,
  },
  path: {
    debugColor: 0xfff2bd,
    points: [
      { x: 666, y: 1100 },
      { x: 682, y: 1034 },
      { x: 668, y: 972 },
      { x: 625, y: 918 },
      { x: 545, y: 880 },
      { x: 430, y: 858 },
      { x: 298, y: 840 },
      { x: 198, y: 802 },
      { x: 170, y: 724 },
      { x: 220, y: 655 },
      { x: 340, y: 615 },
      { x: 496, y: 595 },
      { x: 660, y: 584 },
      { x: 760, y: 535 },
      { x: 805, y: 455 },
      { x: 772, y: 390 },
      { x: 660, y: 352 },
      { x: 545, y: 322 },
      { x: 505, y: 258 },
    ],
  },
  deckOverlay: {
    source: { x: 0, y: 105, width: 1717, height: 720 },
    destination: { x: 0, y: 1107, width: 1024, height: 429 },
  },
  buildSlots: [
    { id: 'pad-1', x: 258, y: 323, radius: 56 },
    { id: 'pad-2', x: 232, y: 480, radius: 56 },
    { id: 'pad-3', x: 510, y: 488, radius: 56 },
    { id: 'pad-4', x: 680, y: 486, radius: 56 },
    { id: 'pad-5', x: 352, y: 716, radius: 56 },
    { id: 'pad-6', x: 530, y: 716, radius: 56 },
    { id: 'pad-7', x: 746, y: 716, radius: 56 },
    { id: 'pad-8', x: 250, y: 966, radius: 56 },
    { id: 'pad-9', x: 482, y: 966, radius: 56 },
  ],
  deckSlots: [
    { id: 'deck-strawberry', x: 234, y: 1228, radius: 58 },
    { id: 'deck-orange', x: 365, y: 1228, radius: 58 },
    { id: 'deck-blueberry', x: 507, y: 1228, radius: 58 },
    { id: 'deck-grape', x: 647, y: 1228, radius: 58 },
    { id: 'deck-honey', x: 775, y: 1228, radius: 58 },
  ],
};

export const levelPath = candyReefLevel.path.points;
export const towerPads = candyReefLevel.buildSlots;
