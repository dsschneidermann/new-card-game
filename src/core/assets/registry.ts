import { AssetManifest, type AssetDescriptor, type ManifestEntry, type ValidationReport } from './manifest';
import { AssetKeys } from './keys';
import type { AssetKey } from './keys';
import { aliasedPath } from './aliases';
import { ENEMY_ROSTER } from './enemyRoster';

type SpriteOptions = {
  frameCount: number;
  fps?: number; // animation frame rate; its PRESENCE marks the descriptor as an animation (built as <key>.right)
  forwardPx?: number; // draw-origin nudge: px in the facing direction (off-centre art)
  downPx?: number; // draw-origin nudge: px downward
  frameOffsetY?: number; // Y (source px) of the first animation row in a multi-row sheet; 0 = top
};

const asset = (
  key: string,
  size: [number, number, number?],
  style: string,
  description: string,
  sprite?: SpriteOptions,
): AssetDescriptor => ({
  key,
  // Default convention is the flat dotted filename assets/<key>.png (feature 03 decision); a key
  // listed in ./aliases instead points at an arbitrary file (local experimentation, removable).
  path: aliasedPath(key),
  size,
  ...(sprite ? { sprite } : {}),
  style,
  description,
});

/** Default frame rates for imported roster animations (the source art doesn't specify fps; tunable). */
const ROSTER_FPS = { idle: 6, walk: 10, attack: 12 } as const;

/**
 * Expand the temporary enemy roster (./enemyRoster, imported from assets/pending.local) into
 * idle/walk/attack descriptors: scale 0.5, frame count + row offset from the roster entry, fps from
 * ROSTER_FPS. Each key is aliased to its file in ./aliases and flagged real (below). Seeded ahead of
 * code use — plain keys (not in AssetKeys); they animate but no entity is placed on them yet.
 */
const ROSTER_ASSETS: readonly AssetDescriptor[] = ENEMY_ROSTER.flatMap((enemy) =>
  (['idle', 'walk', 'attack'] as const).map((action) => {
    const anim = enemy[action];
    return asset(
      `${enemy.name}.${action}`,
      [enemy.frameSize, enemy.frameSize, 0.5],
      `imported ${enemy.name} ${action}`,
      `Roster enemy ${enemy.name} ${action} (assets/pending.local)`,
      {
        frameCount: anim.frames,
        fps: ROSTER_FPS[action],
        frameOffsetY: enemy.frameOffsetY,
        // Optional per-anim draw nudges — omit (don't pass undefined) under exactOptionalPropertyTypes.
        ...(anim.downPx !== undefined ? { downPx: anim.downPx } : {}),
        ...(anim.forwardPx !== undefined ? { forwardPx: anim.forwardPx } : {}),
      },
    );
  }),
);

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
  asset(AssetKeys.playerIdle, [128, 128, 0.5], 'anime fox-girl, right-facing', 'Player idle', { frameCount: 6, fps: 6, downPx: -6 }),
  asset(AssetKeys.playerWalk, [128, 128, 0.5], 'same character, right-facing', 'Player walk', { frameCount: 8, fps: 12, downPx: -6 }),
  asset(AssetKeys.playerReady, [128, 128, 0.5], 'same character, card-ready stance, right-facing', 'Player ready/card stance', { frameCount: 2, fps: 6, downPx: -6, forwardPx: 8 }),
  asset(AssetKeys.playerAttack1, [128, 128, 0.5], 'same character, attack A, right-facing', 'Player attack variant 1', { frameCount: 3, fps: 8, downPx: -6, forwardPx: 8 }),
  asset(AssetKeys.playerAttack2, [128, 128, 0.5], 'same character, attack B, right-facing', 'Player attack variant 2', { frameCount: 7, fps: 12, downPx: -6 }),
  // Enemy art (slime1, slime2, slime3, and every other enemy) is expanded from ./enemyRoster.
  ...ROSTER_ASSETS,
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
  AssetKeys.playerIdle,
  AssetKeys.playerWalk,
  AssetKeys.playerReady,
  AssetKeys.playerAttack1,
  AssetKeys.playerAttack2,
  ...ROSTER_ASSETS.map((descriptor) => descriptor.key),
]);

/** The default game manifest: descriptors + which keys currently have real art. */
export const manifest = new AssetManifest(GAME_ASSETS, REAL_ASSET_KEYS);

/** AssetKeys / AssetKey are the single source of truth in ./keys; re-export them here. */
export { AssetKeys };
export type { AssetKey };

/**
 * Keys referenced by code; the validation pass checks they all resolve. The roster keys are
 * included so the manifest doesn't report all of them as 'registered but unused' on every boot
 * (they're used at runtime via createAnims + the Enemy.art spawn, just not by a literal AssetKeys ref).
 */
export const USED_ASSET_KEYS: readonly string[] = [
  ...Object.values(AssetKeys),
  ...ROSTER_ASSETS.map((descriptor) => descriptor.key),
];

/** Resolve a key against the default game manifest. */
export function resolveKey(key: string): ManifestEntry | undefined {
  return manifest.resolve(key);
}

/** Validate the default game manifest against the code's used keys. */
export function validateManifest(usedKeys: readonly string[] = USED_ASSET_KEYS): ValidationReport {
  return manifest.validate(usedKeys);
}
