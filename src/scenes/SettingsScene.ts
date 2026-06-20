import Phaser from 'phaser';
import { AssetKeys, DEFAULT_DISPLAY_SETTINGS, type DisplaySettings, type StorageAdapter } from '@core/index';
import type { ScreenRouter } from '@scenes/ScreenRouter';
import { makeButton, type Button } from '@scenes/MenuButton';
import { applyDisplaySettings, saveDisplaySettings } from '@scenes/displaySettings';

const viewportLabel = (s: DisplaySettings): string =>
  `Viewport: ${s.viewport === 'fit' ? 'Fit to window' : '1:1 Actual pixels'}`;
const resolutionLabel = (s: DisplaySettings): string =>
  `Resolution: ${s.resolution === 'ipad' ? 'iPad (960x540)' : 'Desktop (1920x1080)'}`;

/** v1 settings: display (viewport + resolution) + fullscreen. Audio is a placeholder. */
export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene');
  }

  create(): void {
    const router = this.registry.get('router') as ScreenRouter;
    const storage = this.registry.get('storage') as StorageAdapter;
    let display = (this.registry.get('display') as DisplaySettings | undefined) ?? DEFAULT_DISPLAY_SETTINGS;
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0e0e12');

    // Shared menu backdrop from the Asset Preload system (placeholder art for now).
    this.add.image(width / 2, height / 2, AssetKeys.uiMenuBackground).setDisplaySize(width, height);

    this.add
      .text(width / 2, height * 0.14, 'Settings', { fontFamily: 'monospace', fontSize: '32px', color: '#e0e0e0' })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.28, 'Audio   master / music / SFX   (placeholder)', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#9aa0aa',
      })
      .setOrigin(0.5);

    // Display settings apply to the whole-game ScaleManager immediately, and persist.
    const apply = (next: DisplaySettings): void => {
      display = next;
      this.registry.set('display', display);
      applyDisplaySettings(this.scale, display);
      saveDisplaySettings(storage, display);
    };

    const viewportBtn: Button = makeButton(this, width / 2, height * 0.42, viewportLabel(display), () => {
      apply({ ...display, viewport: display.viewport === 'fit' ? 'actual' : 'fit' });
      viewportBtn.setLabel(viewportLabel(display));
    });

    const resolutionBtn: Button = makeButton(this, width / 2, height * 0.54, resolutionLabel(display), () => {
      apply({ ...display, resolution: display.resolution === 'ipad' ? 'desktop' : 'ipad' });
      resolutionBtn.setLabel(resolutionLabel(display));
    });

    makeButton(this, width / 2, height * 0.66, 'Toggle Fullscreen', () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    });
    makeButton(this, width / 2, height * 0.78, 'Back', () => router.dispatch('Back'));
  }
}
