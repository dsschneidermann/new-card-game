import Phaser from 'phaser';
import { AssetKeys, DEFAULT_DISPLAY_SETTINGS, s, type DisplaySettings, type StorageAdapter } from '@core/index';
import type { ScreenRouter } from '@scenes/ScreenRouter';
import { makeButton, type Button } from '@scenes/MenuButton';
import { applyDisplaySettings, saveDisplaySettings } from '@scenes/displaySettings';

const viewportLabel = (d: DisplaySettings): string =>
  d.viewport === 'fit' ? 'Fit to window' : '1:1 Actual pixels';
const resolutionLabel = (d: DisplaySettings): string =>
  d.resolution === 'ipad' ? 'iPad (960x540)' : 'Desktop (1920x1080)';

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
      .text(width / 2, height * 0.14, 'Settings', { fontFamily: 'monospace', fontSize: `${s(64)}px`, color: '#e0e0e0' })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.28, 'Audio   master / music / SFX   (placeholder)', {
        fontFamily: 'monospace',
        fontSize: `${s(32)}px`,
        color: '#9aa0aa',
      })
      .setOrigin(0.5);

    const persist = (next: DisplaySettings): void => {
      display = next;
      this.registry.set('display', display);
      saveDisplaySettings(storage, display);
    };

    // Both toggles run the same full ScaleManager configuration (applyDisplaySettings).
    // Viewport only changes how the canvas is presented, so no re-layout is needed.
    const viewportBtn: Button = makeButton(this, width / 2, height * 0.42, viewportLabel(display), () => {
      persist({ ...display, viewport: display.viewport === 'fit' ? 'actual' : 'fit' });
      applyDisplaySettings(this.scale, display);
      viewportBtn.setLabel(viewportLabel(display));
    });

    // Resolution changes the manual scale factor + canvas size, so every scene must
    // re-run its s()-based layout — restart this scene after applying the settings.
    makeButton(this, width / 2, height * 0.54, resolutionLabel(display), () => {
      persist({ ...display, resolution: display.resolution === 'ipad' ? 'desktop' : 'ipad' });
      applyDisplaySettings(this.scale, display);
      this.scene.restart();
    });

    makeButton(this, width / 2, height * 0.66, 'Toggle Fullscreen', () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    });
    makeButton(this, width / 2, height * 0.78, 'Back', () => router.dispatch('Back'));
  }
}
