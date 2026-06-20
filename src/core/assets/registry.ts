import { AssetManifest, type AssetDescriptor, type ManifestEntry, type ValidationReport } from './manifest';
import { AssetKeys } from './keys';
import type { AssetKey } from './keys';

type Frames = {
  frameWidth: number;
  frameHeight: number;
  count: number;
  forwardPx?: number; // draw-origin nudge: px in the facing direction (off-centre art)
  downPx?: number; // draw-origin nudge: px downward
};

const asset = (
  key: string,
  size: [number, number, number?],
  style: string,
  description: string,
  frames?: Frames,
): AssetDescriptor => ({
  key,
  path: `assets/${key}.png`, // flat dotted filenames (feature 03 decision)
  size,
  ...(frames ? { frames } : {}),
  style,
  description,
});

/**
 * The asset descriptors known to the build, mirroring the Asset Placeholders
 * plan (ADR-004). Real art drops in per key as it is produced (flag it in
 * REAL_ASSET_KEYS); any key not yet supplied renders as a generated placeholder.
 * Each feature adds its own descriptors here as it introduces visual elements.
 */
export const GAME_ASSETS: readonly AssetDescriptor[] = [
  asset(AssetKeys.brandLogo, [256, 128], 'bold high-contrast wordmark', 'Game logo for boot/menu'),
  asset(AssetKeys.uiMenuBackground, [1280, 720], 'moody low-detail worldmap vista', 'Main menu backdrop'),
  asset(AssetKeys.uiButton, [200, 56], 'rounded slab + accent border', 'Generic UI button', { frameWidth: 200, frameHeight: 56, count: 3 }),
  asset(AssetKeys.uiPanel, [64, 64], 'semi-transparent dark parchment', 'Dialog/HUD panel'),
  asset(AssetKeys.worldFloor, [32, 32], 'top-down stone/grass', 'Walkable floor tile'),
  asset(AssetKeys.worldWall, [32, 32], 'solid rock, dark outline', 'Non-walkable obstacle'),
  asset(AssetKeys.worldExit, [32, 32], 'glowing portal/stairs', 'Level exit', { frameWidth: 32, frameHeight: 32, count: 2 }),
  asset(AssetKeys.playerIdle, [128, 128, 0.5], 'anime fox-girl, right-facing', 'Player idle (128px art shown at 0.5 on a 32px hex, single right-facing row, 6 frames; mirror for left)', { frameWidth: 128, frameHeight: 128, count: 6 }),
  asset(AssetKeys.playerWalk, [128, 128, 0.5], 'same character, right-facing', 'Player walk (128px art shown at 0.5 on a 32px hex, single right-facing row, 8 frames; mirror for left)', { frameWidth: 128, frameHeight: 128, count: 8 }),
  asset(AssetKeys.playerReady, [128, 128, 0.5], 'same character, card-ready stance, right-facing', 'Player ready/card stance (128px art at 0.5 on a 32px hex, single right-facing row, 2 frames, looping; mirror for left)', { frameWidth: 128, frameHeight: 128, count: 2, forwardPx: 8 }),
  asset(AssetKeys.playerAttack1, [128, 128, 0.5], 'same character, attack A, right-facing', 'Player attack variant 1 (128px art at 0.5 on a 32px hex, single right-facing row, 3 frames, one-shot; mirror for left)', { frameWidth: 128, frameHeight: 128, count: 3, forwardPx: 8 }),
  asset(AssetKeys.playerAttack2, [128, 128, 0.5], 'same character, attack B, right-facing', 'Player attack variant 2 (128px art at 0.5 on a 32px hex, single right-facing row, 7 frames, one-shot; mirror for left)', { frameWidth: 128, frameHeight: 128, count: 7 }),
  // Seeded ahead of code use (no AssetKeys constant until referenced):
  asset('enemy.melee.idle', [32, 32], 'brutish red with a club', 'Melee enemy idle', { frameWidth: 32, frameHeight: 32, count: 4 }),
  asset('resource.icon.energy', [24, 24], 'yellow lightning bolt', 'Energy icon'),
  asset('resource.icon.mana', [24, 24], 'blue droplet', 'Mana icon'),
  asset('status.icon.poisoned', [24, 24], 'green skull bubble', 'Poisoned status icon'),
];

/**
 * The 'real' flag: keys whose real art file (assets/<key>.png) exists and should
 * be loaded instead of a generated placeholder. Promote a key by adding it here
 * once you drop the file — that one line is the only code change needed. A key
 * flagged real whose file is missing logs a warning at boot and falls back to
 * its placeholder, so typos and missing art are easy to spot in the 404 list.
 * Add keys here as real art is produced — empty until then. Kept out of
 * AssetDescriptor on purpose so a descriptor stays a pure art spec mirroring
 * the Asset Placeholders plan.
 */
export const REAL_ASSET_KEYS: ReadonlySet<string> = new Set<string>([
  AssetKeys.playerIdle, // 128px right-facing spritesheet
  AssetKeys.playerWalk,
  AssetKeys.playerReady,
  AssetKeys.playerAttack1,
  AssetKeys.playerAttack2,
]);

/** The default game manifest: descriptors + which keys currently have real art. */
export const manifest = new AssetManifest(GAME_ASSETS, REAL_ASSET_KEYS);

/** AssetKeys / AssetKey are the single source of truth in ./keys; re-export them here. */
export { AssetKeys };
export type { AssetKey };

/** Keys referenced by code; the validation pass checks they all resolve. */
export const USED_ASSET_KEYS: readonly AssetKey[] = Object.values(AssetKeys);

/** Resolve a key against the default game manifest. */
export function resolveKey(key: string): ManifestEntry | undefined {
  return manifest.resolve(key);
}

/** Validate the default game manifest against the code's used keys. */
export function validateManifest(usedKeys: readonly string[] = USED_ASSET_KEYS): ValidationReport {
  return manifest.validate(usedKeys);
}
