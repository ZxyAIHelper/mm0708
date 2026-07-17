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
