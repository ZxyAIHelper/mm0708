import Phaser from 'phaser';
import { AssetKeys } from '../data/assets';
import { candyReefLevel, type DeckSlot, type Point, type TowerPad } from '../data/level-001';
import { towerArt, towerKinds, type TowerKind } from '../data/towers';
import { createInitialState, placeTower, updateState, type GameState } from '../systems/gameState';
import { createHud } from '../ui/hud';

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private padLayer!: Phaser.GameObjects.Container;
  private towerLayer!: Phaser.GameObjects.Container;
  private deckLayer!: Phaser.GameObjects.Container;
  private calibrationLayer!: Phaser.GameObjects.Container;
  private enemyLayer!: Phaser.GameObjects.Container;
  private projectileLayer!: Phaser.GameObjects.Container;
  private selectedKind: TowerKind = 'strawberry';
  private calibrationVisible = false;
  private updateHud: ((values: { lives: number; coins: number; enemies: number; projectiles: number }) => void) | null = null;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.state = createInitialState();
    this.assertMapAspect();
    this.add.image(0, 0, AssetKeys.map).setOrigin(0, 0);
    this.createTowerTextures();
    this.createChromaTextureFromSource('deck-overlay', AssetKeys.deckSource, new Phaser.Geom.Rectangle(
      candyReefLevel.deckOverlay.source.x,
      candyReefLevel.deckOverlay.source.y,
      candyReefLevel.deckOverlay.source.width,
      candyReefLevel.deckOverlay.source.height,
    ));
    this.padLayer = this.add.container(0, 0);
    this.towerLayer = this.add.container(0, 0);
    this.deckLayer = this.add.container(0, 0);
    this.calibrationLayer = this.add.container(0, 0);
    this.enemyLayer = this.add.container(0, 0);
    this.projectileLayer = this.add.container(0, 0);
    this.input.setDefaultCursor('pointer');

    this.drawDeckOverlay();
    this.drawPadsAndTowers();
    this.drawDeck();
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.handleBuild(pointer));
    this.input.keyboard?.on('keydown-D', () => this.toggleCalibration());

    const hudRoot = document.getElementById('hud-root');
    if (hudRoot) {
      this.updateHud = createHud(hudRoot);
    }
  }

  update(_time: number, delta: number): void {
    updateState(this.state, Math.min(delta / 1000, 0.05));
    this.drawDynamicObjects();
    this.updateHud?.({
      lives: this.state.lives,
      coins: this.state.coins,
      enemies: this.state.enemies.length,
      projectiles: this.state.projectiles.length,
    });
  }

  private handleBuild(pointer: Phaser.Input.Pointer): void {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const deckKind = this.findDeckPick(worldPoint.x, worldPoint.y);
    if (deckKind) {
      this.selectedKind = deckKind;
      this.drawDeck();
      return;
    }

    const pad = this.findPadAt(worldPoint.x, worldPoint.y);
    if (!pad) return;

    if (placeTower(this.state, pad.id, this.selectedKind)) {
      this.drawPadsAndTowers();
    }
  }

  private findPadAt(x: number, y: number): TowerPad | null {
    return candyReefLevel.buildSlots.find((pad) => Phaser.Math.Distance.Between(x, y, pad.x, pad.y) <= pad.radius) ?? null;
  }

  private findDeckPick(x: number, y: number): TowerKind | null {
    const slots = this.getDeckSlots();
    const match = slots.find((slot) => Phaser.Math.Distance.Between(x, y, slot.x, slot.y) <= slot.radius);
    return match?.kind ?? null;
  }

  private getDeckSlots(): Array<DeckSlot & { kind: TowerKind }> {
    return candyReefLevel.deckSlots.map((slot, index) => ({
      ...slot,
      kind: towerKinds[index],
    } satisfies DeckSlot & { kind: TowerKind }));
  }

  private getConfigSnapshot(): string {
    const formatPoint = (point: Point) => `{ x: ${Math.round(point.x)}, y: ${Math.round(point.y)} }`;
    const formatSlot = (slot: TowerPad | DeckSlot) =>
      `{ id: '${slot.id}', x: ${Math.round(slot.x)}, y: ${Math.round(slot.y)}, radius: ${Math.round(slot.radius)} }`;

    return [
      'path: {',
      `  debugColor: 0x${candyReefLevel.path.debugColor.toString(16)},`,
      '  points: [',
      ...candyReefLevel.path.points.map((point) => `    ${formatPoint(point)},`),
      '  ],',
      '},',
      'buildSlots: [',
      ...candyReefLevel.buildSlots.map((slot) => `  ${formatSlot(slot)},`),
      '],',
      'deckSlots: [',
      ...candyReefLevel.deckSlots.map((slot) => `  ${formatSlot(slot)},`),
      '],',
    ].join('\n');
  }

  private toggleCalibration(): void {
    this.calibrationVisible = !this.calibrationVisible;
    this.drawCalibration();
    if (this.calibrationVisible) {
      console.info('Candy Reef calibration enabled. Drag points, then copy this config:', this.getConfigSnapshot());
    } else {
      console.info('Candy Reef calibration disabled. Current config:', this.getConfigSnapshot());
    }
  }

  private drawCalibration(): void {
    this.calibrationLayer.removeAll(true);
    if (!this.calibrationVisible) return;

    const pathGraphics = this.add.graphics();
    pathGraphics.lineStyle(5, candyReefLevel.path.debugColor, 0.72);
    const [first, ...rest] = candyReefLevel.path.points;
    if (first) {
      pathGraphics.beginPath();
      pathGraphics.moveTo(first.x, first.y);
      for (const point of rest) pathGraphics.lineTo(point.x, point.y);
      pathGraphics.strokePath();
    }
    this.calibrationLayer.add(pathGraphics);

    candyReefLevel.path.points.forEach((point, index) => {
      this.calibrationLayer.add(this.createDraggableDebugPoint(point, 0x2f9be9, `path-${index + 1}`));
    });

    for (const slot of candyReefLevel.buildSlots) {
      this.calibrationLayer.add(this.createDraggableDebugPoint(slot, 0xff6f98, slot.id));
    }

    for (const slot of candyReefLevel.deckSlots) {
      this.calibrationLayer.add(this.createDraggableDebugPoint(slot, 0xf5b61e, slot.id));
    }
  }

  private createDraggableDebugPoint(point: Point, color: number, label: string): Phaser.GameObjects.Container {
    const dot = this.add.circle(0, 0, 11, color, 0.95).setStrokeStyle(3, 0xffffff, 0.85);
    const text = this.add.text(16, -18, label, {
      color: '#2d1c11',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: '700',
      backgroundColor: 'rgba(255, 242, 189, 0.82)',
      padding: { x: 4, y: 2 },
    });
    const marker = this.add.container(point.x, point.y, [dot, text]);
    marker.setSize(44, 44);
    marker.setInteractive(new Phaser.Geom.Circle(0, 0, 24), Phaser.Geom.Circle.Contains);
    this.input.setDraggable(marker);
    marker.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      marker.setPosition(dragX, dragY);
      point.x = Math.round(dragX);
      point.y = Math.round(dragY);
      this.drawPadsAndTowers();
    });
    marker.on('dragend', () => {
      this.drawCalibration();
      console.info('Candy Reef calibration config:', this.getConfigSnapshot());
    });
    return marker;
  }

  private drawPadsAndTowers(): void {
    this.padLayer.removeAll(true);
    this.towerLayer.removeAll(true);

    for (const pad of candyReefLevel.buildSlots) {
      const occupied = this.state.towers.some((tower) => tower.id === pad.id);
      const marker = this.add
        .circle(pad.x, pad.y, occupied ? pad.radius * 0.75 : pad.radius * 0.9, occupied ? 0xffffff : 0xf4c06d, occupied ? 0.1 : 0.28)
        .setStrokeStyle(occupied ? 2 : 3, occupied ? 0xffffff : 0x9d6a2a, occupied ? 0.22 : 0.42);
      this.padLayer.add(marker);
    }

    for (const tower of this.state.towers) {
      const target = this.state.enemies.find((enemy) => Phaser.Math.Distance.Between(tower.x, tower.y, enemy.x, enemy.y) <= tower.range);
      const angle = target ? Phaser.Math.Angle.Between(tower.x, tower.y - 22, target.x, target.y) : -0.2;
      const body = this.add.image(tower.x, tower.y + 18, `${tower.kind}-body`).setOrigin(0.5, 0.78).setScale(0.38);
      const barrel = this.add.image(tower.x + Math.cos(angle) * 20, tower.y - 18 + Math.sin(angle) * 20, `${tower.kind}-barrel`).setScale(0.26).setRotation(angle);
      this.towerLayer.add([body, barrel]);
    }
  }

  private drawDeck(): void {
    this.deckLayer.removeAll(true);

    for (const slot of this.getDeckSlots()) {
      const isSelected = slot.kind === this.selectedKind;
      const ring = this.add.circle(slot.x, slot.y, isSelected ? slot.radius : slot.radius * 0.82, 0xfff2bd, isSelected ? 0.36 : 0.04);
      ring.setStrokeStyle(isSelected ? 5 : 2, isSelected ? 0xffffff : 0xffd48a, isSelected ? 0.9 : 0.18);
      this.deckLayer.add(ring);
    }
  }

  private drawDeckOverlay(): void {
    const target = candyReefLevel.deckOverlay.destination;
    this.add.image(target.x, target.y, 'deck-overlay').setOrigin(0, 0).setDisplaySize(target.width, target.height);
  }

  private drawDynamicObjects(): void {
    this.enemyLayer.removeAll(true);
    this.projectileLayer.removeAll(true);

    for (const enemy of this.state.enemies) {
      const shell = this.add.circle(enemy.x, enemy.y, 24, 0x2c82df, 1).setStrokeStyle(4, 0xffffff, 0.78);
      const shield = this.add.circle(enemy.x + 13, enemy.y + 2, 10, 0xd9f3ff, 0.9).setStrokeStyle(2, 0x3b8eff, 0.9);
      const hp = this.add.rectangle(enemy.x, enemy.y - 34, 34 * (enemy.hp / 3), 5, 0x88e063, 1).setOrigin(0.5);
      this.enemyLayer.add([shell, shield, hp]);
    }

    for (const projectile of this.state.projectiles) {
      const target = this.state.enemies.find((enemy) => enemy.id === projectile.targetId);
      const angle = target ? Phaser.Math.Angle.Between(projectile.x, projectile.y, target.x, target.y) : this.time.now / 120;
      const candy = this.add.ellipse(projectile.x, projectile.y, 28, 16, 0xff8a00, 1).setRotation(angle);
      candy.setStrokeStyle(3, 0xfff2bd, 0.9);
      this.projectileLayer.add(candy);
    }

    this.drawPadsAndTowers();
    if (this.calibrationVisible) this.drawCalibration();
  }

  private createTowerTextures(): void {
    for (const kind of towerKinds) {
      this.createChromaTextureFromSource(`${kind}-body`, AssetKeys.towerSource, towerArt[kind].bodyCrop);
      this.createChromaTextureFromSource(`${kind}-barrel`, AssetKeys.towerSource, towerArt[kind].barrelCrop);
    }
  }

  private assertMapAspect(): void {
    const source = this.textures.get(AssetKeys.map).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    if (source.width !== candyReefLevel.background.width || source.height !== candyReefLevel.background.height) {
      console.warn(
        `Candy Reef map size mismatch: loaded ${source.width}x${source.height}, level expects ${candyReefLevel.background.width}x${candyReefLevel.background.height}. Coordinates should be recalibrated before shipping.`,
      );
    }
  }

  private createChromaTextureFromSource(key: string, sourceKey: string, crop: Phaser.Geom.Rectangle): void {
    if (this.textures.exists(key)) return;

    const texture = this.textures.createCanvas(key, crop.width, crop.height);
    if (!texture) return;

    const context = texture.getContext();
    const source = this.textures.get(sourceKey).getSourceImage() as CanvasImageSource;
    context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);

    const pixels = context.getImageData(0, 0, crop.width, crop.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const red = pixels.data[index];
      const green = pixels.data[index + 1];
      const blue = pixels.data[index + 2];
      if (green > 170 && red < 80 && blue < 80) {
        pixels.data[index + 3] = 0;
      }
    }

    context.putImageData(pixels, 0, 0);
    texture.refresh();
  }
}
