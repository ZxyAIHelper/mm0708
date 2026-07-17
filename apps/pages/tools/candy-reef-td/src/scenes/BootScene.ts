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
