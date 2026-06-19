import Phaser from 'phaser';
import { AssetKeys } from '@core/index';
import type { ScreenRouter } from '@scenes/ScreenRouter';
import { makeButton } from '@scenes/MenuButton';

/** v1 settings: audio volume (placeholder until audio exists) + fullscreen toggle. */
export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene');
  }

  create(): void {
    const router = this.registry.get('router') as ScreenRouter;
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0e0e12');

    // Shared menu backdrop from the Asset Preload system (placeholder art for now).
    this.add.image(width / 2, height / 2, AssetKeys.uiMenuBackground).setDisplaySize(width, height);

    this.add
      .text(width / 2, height * 0.18, 'Settings', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#e0e0e0',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.36, 'Audio   master / music / SFX   (placeholder)', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#9aa0aa',
      })
      .setOrigin(0.5);

    makeButton(this, width / 2, height * 0.52, 'Toggle Fullscreen', () => {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        this.scale.startFullscreen();
      }
    });
    makeButton(this, width / 2, height * 0.68, 'Back', () => router.dispatch('Back'));
  }
}
