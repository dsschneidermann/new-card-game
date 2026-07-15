/**
 * Pure asset manifest, key resolution, and validation (feature 03).
 * Phaser-free (ADR-002): only the PlaceholderFactory and PreloadScene touch
 * Phaser. Assets are referenced by logical key, never raw paths (ADR-004).
 */

export interface AssetDescriptor {
  /** Logical key, e.g. 'enemy.melee.idle' (never a raw path). */
  key: string;
  /** Real-file location: flat dotted filename, assets/<key>.png. */
  path: string;
  /** Source frame size in pixels, with an optional display scale: [sizeX, sizeY, scale?]. */
  size: [number, number, number?];
  origin?: [number, number];
  /**
   * Sprite/render options. frameCount is the spritesheet's frame count (omit, or 1, for a
   * single static frame). forwardPx/downPx optionally nudge the DRAWN figure for a sheet
   * whose character sits off-centre: forward = px in the facing direction (mirrored by
   * flipX), down = px downward; SceneSync applies them as a static draw-origin shift (not
   * the position tween), scaled with resolution. Frame width/height are NOT stored here —
   * they are the descriptor's size[0]/size[1] (a frame is one cell of that size).
   */
  sprite?: {
    frameCount: number;
    /**
     * Animation frame rate (fps). Its PRESENCE marks the descriptor as an animation that
     * PreloadScene builds as `<key>.right`; a multi-frame descriptor WITHOUT fps (e.g. ui.button)
     * is frame-indexed states, not an animation.
     */
    fps?: number;
    forwardPx?: number;
    downPx?: number;
    /**
     * Y of the first animation row within the source sheet, in source px (0 = top row,
     * the default). For a sheet that stacks several animation rows, this selects WHICH
     * row the frames come from. PreloadScene translates it into a starting frame index at
     * anim-creation time, since Phaser's spritesheet config can't offset only the Y axis.
     */
    frameOffsetY?: number;
    /**
     * FILE-PER-FRAME animation: the frames are NOT one spritesheet but `frameCount` separate
     * files named `<key><NN>.png` (NN 1-based, zero-padded to 2 digits) — the shape the effect
     * art ships in (spell_effect_blizzard01.png..17.png). PreloadScene loads each frame as its
     * own texture and builds `<key>.right` from them (frameSequenceUrls / frameSequenceTextureKey).
     * Still an animation (declare fps); size[0..1] is the per-frame size, as for a spritesheet.
     */
    filePerFrame?: boolean;
  };
  style: string;
  description: string;
}

export type ManifestEntry =
  | { kind: 'real'; descriptor: AssetDescriptor }
  | { kind: 'placeholder'; descriptor: AssetDescriptor };

export interface ValidationReport {
  /** Keys used in code but not registered in the manifest. */
  missing: string[];
  /** Keys registered but never referenced by code. */
  unused: string[];
}

/** Frame layout for a descriptor: frame size from size[0..1]; frameCount from the sprite options (1 if none). */
export function frameConfig(d: AssetDescriptor): { frameWidth: number; frameHeight: number; frameCount: number } {
  return { frameWidth: d.size[0], frameHeight: d.size[1], frameCount: d.sprite?.frameCount ?? 1 };
}

/**
 * The per-frame runtime URLs of a FILE-PER-FRAME animation (sprite.filePerFrame): `<key><NN>.png` for
 * NN = 1..frameCount, zero-padded to 2 digits (matching the effect files, e.g. spell_effect_blizzard01.png).
 * Returns [] for a normal (spritesheet or single-image) descriptor. Pure — the single source of the frame
 * file naming, shared by PreloadScene (what to load) and assetFiles.test (what must exist on disk).
 */
export function frameSequenceUrls(d: AssetDescriptor): string[] {
  if (d.sprite?.filePerFrame !== true) return [];
  return Array.from(
    { length: d.sprite.frameCount },
    (_unused, i) => `${d.key}${String(i + 1).padStart(2, '0')}.png`,
  );
}

/**
 * The per-frame TEXTURE KEY for frame index `i` (0-based) of a file-per-frame animation. Each frame file is
 * loaded as its own single-image texture under this key; PreloadScene builds `<key>.right` from these, so
 * they never collide with the base logical key. Pure.
 */
export function frameSequenceTextureKey(key: string, i: number): string {
  return `${key}.f${i}`;
}

/**
 * The asset's chosen display scale (the optional 3rd size element), in the DESKTOP base.
 * The base re-base (Desktop = scale 1.0, iPad = 0.5) is absorbed here as the constant x2,
 * NOT in size[0]/size[1]: size is the texture FRAME size, pinned to the source sheet for
 * slicing (frameConfig) and placeholder generation, so it can't move. Putting the x2 in the
 * display scale keeps every s(frame * assetScale) display size pixel-identical at both tiers
 * (a descriptor that declared 0.5 now renders at native frame size on Desktop). 1 = native.
 */
export function assetScale(d: AssetDescriptor): number {
  return (d.size[2] ?? 1) * 2;
}

/**
 * The sheet's drawn-figure alignment nudge in DESKTOP base px: forward (in the facing direction)
 * and down. Defaults to 0/0 for sheets that don't declare it. SceneSync applies it as a static
 * draw-origin shift whose net on-screen effect is s(forwardPx)/s(downPx) — a plain base-px offset
 * scaled by resolution (the frame size it divides by cancels against the display size it multiplies
 * back, so the nudge is NOT relative to the asset's size). The descriptors author these in the
 * original (iPad) base, so the x2 here re-bases them to the Desktop base — same as doubling any
 * pixel literal in code.
 */
export function spriteOffset(d: AssetDescriptor): { forwardPx: number; downPx: number } {
  return { forwardPx: (d.sprite?.forwardPx ?? 0) * 2, downPx: (d.sprite?.downPx ?? 0) * 2 };
}

/**
 * Y (in source px) of the first animation row to use from a multi-row sheet; 0 (the default)
 * means the top row. Read by PreloadScene when building the sprite's animations.
 */
export function frameRowOffsetY(d: AssetDescriptor): number {
  return d.sprite?.frameOffsetY ?? 0;
}

/**
 * A keyed registry of asset descriptors. Each key resolves to a 'real' entry
 * when a real file is registered for it, otherwise a 'placeholder' entry.
 */
export class AssetManifest {
  private readonly entries = new Map<string, ManifestEntry>();

  constructor(descriptors: readonly AssetDescriptor[], realKeys: ReadonlySet<string> = new Set()) {
    for (const descriptor of descriptors) {
      this.entries.set(descriptor.key, {
        kind: realKeys.has(descriptor.key) ? 'real' : 'placeholder',
        descriptor,
      });
    }
  }

  /** The entry for a key, or undefined if the key is not registered (a gap). */
  resolve(key: string): ManifestEntry | undefined {
    return this.entries.get(key);
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }

  validate(usedKeys: readonly string[]): ValidationReport {
    const registered = new Set(this.entries.keys());
    const used = new Set(usedKeys);
    return {
      missing: [...used].filter((k) => !registered.has(k)),
      unused: [...registered].filter((k) => !used.has(k)),
    };
  }
}
