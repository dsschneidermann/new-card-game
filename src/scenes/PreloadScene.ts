import Phaser from 'phaser';
import { manifest, USED_ASSET_KEYS, validateManifest } from '@core/index';
import { generatePlaceholder } from '@render/PlaceholderFactory';

/**
 * Boot-time asset pipeline (feature 03): loads any real files registered in the
 * manifest with a progress bar, then generates a placeholder texture for every
 * remaining key, validates the manifest, and proceeds to the main menu.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2 - 30, 'loading…', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#9aa0aa',
      })
      .setOrigin(0.5);
    this.add.rectangle(width / 2, height / 2, 322, 22, 0x1a1c24).setStrokeStyle(1, 0x3a3f4b);
    const fill = this.add.rectangle(width / 2 - 159, height / 2, 1, 16, 0x4fd1c5).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => {
      fill.width = Math.max(1, 318 * p);
    });

    // Queue real files for any 'real' manifest entry (none in v1; all placeholder).
    for (const key of manifest.keys()) {
      const entry = manifest.resolve(key);
      if (entry && entry.kind === 'real') this.load.image(key, entry.descriptor.path);
    }
  }

  create(): void {
    // Fill every key that has no real (loaded) texture with a generated placeholder.
    for (const key of manifest.keys()) {
      if (!this.textures.exists(key)) {
        const entry = manifest.resolve(key);
        if (entry) generatePlaceholder(this, entry.descriptor);
      }
    }

    // Dev validation: surface any key used in code but missing from the manifest.
    const report = validateManifest(USED_ASSET_KEYS);
    if (report.missing.length > 0) {
      console.warn('[assets] keys used in code but not registered:', report.missing);
    }

    this.scene.start('MainMenuScene');
  }
}
