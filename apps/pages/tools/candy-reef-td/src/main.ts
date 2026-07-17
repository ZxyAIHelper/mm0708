import Phaser from 'phaser';
import { candyReefLevel } from './data/level-001';
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
    width: candyReefLevel.world.width,
    height: candyReefLevel.world.height,
  },
  render: {
    pixelArt: false,
    antialias: true,
  },
  scene: [BootScene, GameScene],
};

new Phaser.Game(config);
