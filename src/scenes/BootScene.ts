import Phaser from 'phaser';

/**
 * Minimal scene proving the engine boots in dev. The real boot/preload flow
 * arrives with the "Asset Preload" and "Main Screen & UI Flow" features.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, 'new-card-game\nscaffolding OK', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#e0e0e0',
        align: 'center',
      })
      .setOrigin(0.5);
  }
}
