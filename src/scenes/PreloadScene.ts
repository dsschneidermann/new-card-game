import Phaser from 'phaser';
import { manifest, USED_ASSET_KEYS, validateManifest, AssetKeys, s } from '@core/index';
import { generatePlaceholder } from '@render/PlaceholderFactory';

/**
 * Boot-time asset pipeline (feature 03): loads any real files flagged in the
 * manifest with a progress bar, then generates a placeholder texture for every
 * remaining key (including any flagged-real file that failed to load), validates
 * the manifest, and proceeds to the main menu.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2 - s(30), 'loading…', {
        fontFamily: 'monospace',
        fontSize: `${s(18)}px`,
        color: '#9aa0aa',
      })
      .setOrigin(0.5);
    this.add.rectangle(width / 2, height / 2, s(322), s(22), 0x1a1c24).setStrokeStyle(s(1), 0x3a3f4b);
    const fill = this.add.rectangle(width / 2 - s(159), height / 2, 1, s(16), 0x4fd1c5).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => {
      fill.width = Math.max(1, s(318) * p);
    });

    // A key flagged 'real' whose file is missing: warn (visible in the 404 list)
    // and let create() fall back to its placeholder — never a hard failure.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(
        `[assets] real file failed to load, falling back to placeholder: ${file.key} (${file.src})`,
      );
    });

    // Queue real files for any key flagged real (REAL_ASSET_KEYS); the rest get
    // a generated placeholder in create(). Multi-frame descriptors load as
    // spritesheets so frame-based consumers (animations, ui.button states) keep
    // working when real art drops in.
    for (const key of manifest.keys()) {
      const entry = manifest.resolve(key);
      if (!entry || entry.kind !== 'real') continue;
      const { path, frames } = entry.descriptor;
      if (frames) {
        this.load.spritesheet(key, path, {
          frameWidth: frames.frameWidth,
          frameHeight: frames.frameHeight,
        });
      } else {
        this.load.image(key, path);
      }
    }
  }

  create(): void {
    // Fill every key lacking a texture with a generated placeholder. This also
    // covers any flagged-real file that 404'd, so a missing real asset degrades
    // to its placeholder rather than a broken texture.
    for (const key of manifest.keys()) {
      if (!this.textures.exists(key)) {
        const entry = manifest.resolve(key);
        if (entry) generatePlaceholder(this, entry.descriptor);
      }
    }

    // Dev validation: surface gaps (used-but-unregistered) and seeded-ahead keys
    // (registered-but-unused) so both are visible rather than silent.
    const report = validateManifest(USED_ASSET_KEYS);
    if (report.missing.length > 0) {
      console.warn('[assets] keys used in code but not registered:', report.missing);
    }
    if (report.unused.length > 0) {
      console.info('[assets] registered but unused (seeded ahead of use):', report.unused);
    }

    this.createPlayerAnims();
    this.scene.start('MainMenuScene');
  }

  /** Define the player's looping idle/walk animations from the right-facing sheets (feature 14). */
  private createPlayerAnims(): void {
    const defs = [
      { key: 'player.idle.right', sheet: AssetKeys.playerIdle, fps: 6 },
      { key: 'player.walk.right', sheet: AssetKeys.playerWalk, fps: 12 },
    ];
    for (const d of defs) {
      if (this.anims.exists(d.key)) continue;
      this.anims.create({
        key: d.key,
        frames: this.anims.generateFrameNumbers(d.sheet),
        frameRate: d.fps,
        repeat: -1,
      });
    }
  }
}
