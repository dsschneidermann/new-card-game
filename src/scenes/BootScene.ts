import Phaser from 'phaser';

/**
 * Boot/entry scene. Shows the title briefly, then hands off to WorldScene.
 * Asset preloading will live here when the Asset Preload feature lands.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, 'new-card-game', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#e0e0e0',
        align: 'center',
      })
      .setOrigin(0.5);
    this.time.delayedCall(400, () => this.scene.start('WorldScene'));
  }
}
