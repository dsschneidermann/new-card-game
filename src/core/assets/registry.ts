import { AssetManifest, type AssetDescriptor, type ManifestEntry, type ValidationReport } from './manifest';
import { AssetKeys } from './keys';
import type { AssetKey } from './keys';

type SpriteOptions = {
  frameCount: number;
  forwardPx?: number; // draw-origin nudge: px in the facing direction (off-centre art)
  downPx?: number; // draw-origin nudge: px downward
};

const asset = (
  key: string,
  size: [number, number, number?],
  style: string,
  description: string,
  sprite?: SpriteOptions,
): AssetDescriptor => ({
  key,
  path: `assets/${key}.png`, // flat dotted filenames (feature 03 decision)
  size,
  ...(sprite ? { sprite } : {}),
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
  asset(AssetKeys.uiButton, [200, 56], 'rounded slab + accent border', 'Generic UI button', { frameCount: 3 }),
  asset(AssetKeys.uiPanel, [64, 64], 'semi-transparent dark parchment', 'Dialog/HUD panel'),
  asset(AssetKeys.world1Floor, [32, 32], 'top-down stone/grass', 'Walkable floor tile'),
  asset(AssetKeys.world1Wall, [32, 32], 'solid rock, dark outline', 'Non-walkable obstacle'),
  asset(AssetKeys.playerIdle, [128, 128, 0.5], 'anime fox-girl, right-facing', 'Player idle', { frameCount: 6, downPx: -6 }),
  asset(AssetKeys.playerWalk, [128, 128, 0.5], 'same character, right-facing', 'Player walk', { frameCount: 8, downPx: -6 }),
  asset(AssetKeys.playerReady, [128, 128, 0.5], 'same character, card-ready stance, right-facing', 'Player ready/card stance', { frameCount: 2, downPx: -6, forwardPx: 8 }),
  asset(AssetKeys.playerAttack1, [128, 128, 0.5], 'same character, attack A, right-facing', 'Player attack variant 1', { frameCount: 3, downPx: -6, forwardPx: 8 }),
  asset(AssetKeys.playerAttack2, [128, 128, 0.5], 'same character, attack B, right-facing', 'Player attack variant 2', { frameCount: 7, downPx: -6 }),
  asset(AssetKeys.slimeIdle, [64, 64, 0.5], 'green blob slime, idle bob', 'Enemy slime idle', { frameCount: 6, downPx: 8 }),
  asset(AssetKeys.slimeWalk, [64, 64, 0.5], 'green blob slime, walking', 'Enemy slime walk', { frameCount: 8, downPx: 8 }),
  asset(AssetKeys.slimeAttack, [64, 64, 0.5], 'green blob slime, attack lunge/burst', 'Enemy slime attack', { frameCount: 10, downPx: 8 }),
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
  AssetKeys.slimeIdle, // 64px 4-row spritesheet; anims use the first row
  AssetKeys.slimeWalk,
  AssetKeys.slimeAttack,
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
