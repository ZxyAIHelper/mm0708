import Phaser from 'phaser';

export type TowerKind = 'strawberry' | 'orange' | 'blueberry' | 'grape' | 'honey';

export type TowerArt = {
  kind: TowerKind;
  bodyCrop: Phaser.Geom.Rectangle;
  barrelCrop: Phaser.Geom.Rectangle;
  tint: number;
};

export const towerKinds: TowerKind[] = ['strawberry', 'orange', 'blueberry', 'grape', 'honey'];

export const towerArt: Record<TowerKind, TowerArt> = {
  strawberry: {
    kind: 'strawberry',
    bodyCrop: new Phaser.Geom.Rectangle(35, 130, 270, 350),
    barrelCrop: new Phaser.Geom.Rectangle(45, 545, 250, 220),
    tint: 0xff6f98,
  },
  orange: {
    kind: 'orange',
    bodyCrop: new Phaser.Geom.Rectangle(360, 130, 280, 350),
    barrelCrop: new Phaser.Geom.Rectangle(360, 545, 275, 220),
    tint: 0xff9b25,
  },
  blueberry: {
    kind: 'blueberry',
    bodyCrop: new Phaser.Geom.Rectangle(680, 130, 285, 350),
    barrelCrop: new Phaser.Geom.Rectangle(690, 545, 280, 220),
    tint: 0x2f9be9,
  },
  grape: {
    kind: 'grape',
    bodyCrop: new Phaser.Geom.Rectangle(1010, 130, 285, 350),
    barrelCrop: new Phaser.Geom.Rectangle(1030, 545, 280, 220),
    tint: 0xb650d8,
  },
  honey: {
    kind: 'honey',
    bodyCrop: new Phaser.Geom.Rectangle(1345, 130, 285, 350),
    barrelCrop: new Phaser.Geom.Rectangle(1365, 545, 280, 220),
    tint: 0xf5b61e,
  },
};
