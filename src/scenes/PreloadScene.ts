import Phaser from 'phaser';
import { manifest, USED_ASSET_KEYS, validateManifest, frameConfig, frameRowOffsetY, s, type AssetDescriptor } from '@core/index';
import { generatePlaceholder } from '@render/PlaceholderFactory';

/** Looping animations (idle/walk/ready resting + locomotion stances) repeat forever; everything else
 *  (e.g. attacks) plays once. Decided by the asset name's suffix, so a new asset needs no per-anim wiring. */
const LOOPING_ANIM_SUFFIXES = ['idle', 'walk', 'ready'] as const;
function animRepeat(assetKey: string): number {
  return LOOPING_ANIM_SUFFIXES.some((suffix) => assetKey.endsWith(suffix)) ? -1 : 0;
}

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
      .text(width / 2, height / 2 - s(60), 'loading…', {
        fontFamily: 'monospace',
        fontSize: `${s(36)}px`,
        color: '#9aa0aa',
      })
      .setOrigin(0.5);
    this.add.rectangle(width / 2, height / 2, s(644), s(44), 0x1a1c24).setStrokeStyle(s(2), 0x3a3f4b);
    const fill = this.add.rectangle(width / 2 - s(318), height / 2, 1, s(32), 0x4fd1c5).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => {
      fill.width = Math.max(1, s(636) * p);
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
      const { path } = entry.descriptor;
      const { frameWidth, frameHeight, frameCount } = frameConfig(entry.descriptor);
      // Load as a spritesheet for any multi-frame texture (e.g. ui.button states) OR any animated
      // descriptor (sprite.fps) — so even a single-frame animation exposes frame 0 for createAnims.
      if (frameCount > 1 || entry.descriptor.sprite?.fps !== undefined) {
        this.load.spritesheet(key, path, { frameWidth, frameHeight });
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

    this.createAnims();
    this.scene.start('MainMenuScene');
  }

  /**
   * Define a right-facing animation for every animated descriptor in the manifest — one place, no
   * per-character list to grow. A descriptor is an animation iff it declares sprite.fps (so a
   * multi-frame but non-animated key like ui.button is skipped); the anim is keyed `${key}.right`,
   * its frames come from spriteRowFrames (honouring frameOffsetY for multi-row sheets), and it loops
   * or plays once by the asset name's suffix (animRepeat). Adding an animated asset needs no code here.
   */
  private createAnims(): void {
    for (const key of manifest.keys()) {
      const entry = manifest.resolve(key);
      const fps = entry?.descriptor.sprite?.fps;
      if (entry === undefined || fps === undefined) continue; // not an animated descriptor
      const animKey = `${key}.right`;
      if (this.anims.exists(animKey)) continue;
      const { start, end } = this.spriteRowFrames(key, entry.descriptor);
      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(key, { start, end }),
        frameRate: fps,
        repeat: animRepeat(key),
      });
    }
  }

  /**
   * The {start,end} spritesheet frame indices for an animation, honouring the descriptor's
   * frameOffsetY (which picks a row in a multi-row sheet). Phaser numbers sheet frames row-major,
   * so the row at frameOffsetY begins at rowIndex * columns, with columns read from the loaded
   * sheet width. The real-art frame layout is trusted (the aliases fs test guards the file exists).
   */
  private spriteRowFrames(sheetKey: string, descriptor: AssetDescriptor): { start: number; end: number } {
    const { frameWidth, frameHeight, frameCount } = frameConfig(descriptor);
    const source = this.textures.get(sheetKey).getSourceImage();
    const columns = Math.floor(source.width / frameWidth);
    const rows = Math.floor(source.height / frameHeight);
    // Trust the real sheet's layout, but if the wanted row isn't in the LOADED texture — a missing-file
    // placeholder is a single row, or a sheet is shorter than expected — fall back to the top row so the
    // animation stays valid (frames 0..frameCount-1) rather than an empty, out-of-range range that would
    // crash on play.
    let row = Math.floor(frameRowOffsetY(descriptor) / frameHeight);
    if (row >= rows) row = 0;
    const start = row * columns;
    return { start, end: start + frameCount - 1 };
  }
}
