import { AssetManifest, type AssetDescriptor, type ManifestEntry, type ValidationReport } from './manifest';

type Frames = { frameWidth: number; frameHeight: number; count: number };

const asset = (
  key: string,
  size: [number, number],
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
  asset('brand.logo', [256, 128], 'bold high-contrast wordmark', 'Game logo for boot/menu'),
  asset('ui.menuBackground', [1280, 720], 'moody low-detail worldmap vista', 'Main menu backdrop'),
  asset('ui.button', [200, 56], 'rounded slab + accent border', 'Generic UI button', { frameWidth: 200, frameHeight: 56, count: 3 }),
  asset('ui.panel', [64, 64], 'semi-transparent dark parchment', 'Dialog/HUD panel'),
  asset('world.tile.floor', [32, 32], 'top-down stone/grass', 'Walkable floor tile'),
  asset('world.tile.wall', [32, 32], 'solid rock, dark outline', 'Non-walkable obstacle'),
  asset('world.tile.exit', [32, 32], 'glowing portal/stairs', 'Level exit', { frameWidth: 32, frameHeight: 32, count: 2 }),
  asset('player.idle', [32, 32], 'heroic adventurer, bright palette', 'Player idle', { frameWidth: 32, frameHeight: 32, count: 4 }),
  asset('player.walk', [32, 32], 'same character', 'Player walk cycle', { frameWidth: 32, frameHeight: 32, count: 6 }),
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
  // 'brand.logo',  ← example: add once assets/brand.logo.png exists
]);

/** The default game manifest: descriptors + which keys currently have real art. */
export const manifest = new AssetManifest(GAME_ASSETS, REAL_ASSET_KEYS);

/** Single source of truth for the logical keys code references. */
export const AssetKeys = {
  brandLogo: 'brand.logo',
  uiMenuBackground: 'ui.menuBackground',
  uiButton: 'ui.button',
  uiPanel: 'ui.panel',
  worldFloor: 'world.tile.floor',
  worldWall: 'world.tile.wall',
  worldExit: 'world.tile.exit',
  playerIdle: 'player.idle',
} as const;
export type AssetKey = (typeof AssetKeys)[keyof typeof AssetKeys];

/** Keys referenced by code; the validation pass checks they all resolve. */
export const USED_ASSET_KEYS: readonly string[] = Object.values(AssetKeys);

/** Resolve a key against the default game manifest. */
export function resolveKey(key: string): ManifestEntry | undefined {
  return manifest.resolve(key);
}

/** Validate the default game manifest against the code's used keys. */
export function validateManifest(usedKeys: readonly string[] = USED_ASSET_KEYS): ValidationReport {
  return manifest.validate(usedKeys);
}
