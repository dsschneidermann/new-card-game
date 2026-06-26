/**
 * The FOREST level's terrain: grass/dirt ground with grass-edge overlays and grass-leaf foliage. These
 * functions are forest-specific CONTENT — they choose the kinds (grass/dirt), the thresholds, and feed
 * the generic algorithm helpers in src/core/terrain. Pure + Phaser-free (ADR-002): identical
 * (col, row, seed) always yields the identical tile, so the renderer regenerates the whole forest ground
 * from the run seed and never stores it. (Moved out of the shared core/terrain by the level-ownership
 * refactor — grass/dirt are the forest's, not every level's.)
 */
import {
  hash01,
  warpedNoise,
  opened2x2,
  overlayFor,
  scatterDecal,
  type WarpOptions,
  type ScatterOptions,
  type OverlayTile,
  type DecalShape,
} from '../../terrain/terrain';

/** The forest ground kinds. */
export type TerrainKind = 'grass' | 'dirt';

/** A chosen ground tile: its kind and which variant within that kind (0-based). */
export interface TerrainTile {
  readonly kind: TerrainKind;
  readonly variant: number;
}

/** The forest's grass-edge overlay descriptor (the generic auto-tile transition, under a forest name). */
export type TerrainOverlay = OverlayTile;

// Patch shaping (tunable). LOWER PATCH_SCALE = larger, smoother dirt/grass regions. DIRT_THRESHOLD below
// 0.5 keeps dirt the minority. The domain warp bends the boundaries into organic curves.
const FOREST_WARP: WarpOptions = { scale: 0.14, warpAmp: 0.5, warpFreq: 1.5 };
const DIRT_THRESHOLD = 0.36;

/** Raw per-cell dirt (full noise resolution), before the min-thickness opening. */
const isRawDirt = (col: number, row: number, seed: number): boolean =>
  warpedNoise(col, row, seed, FOREST_WARP) < DIRT_THRESHOLD;

/**
 * The ground KIND for a square terrain cell. The raw per-cell dirt is passed through a 2x2 morphological
 * OPENING so every dirt feature is at least 2x2 (which keeps the edge-overlay rule set complete) without
 * quantizing the grid. Grass is unconstrained.
 */
export function forestTerrainKind(col: number, row: number, seed: number): TerrainKind {
  return opened2x2((c, r) => isRawDirt(c, r, seed), col, row) ? 'dirt' : 'grass';
}

/**
 * The ground tile for a square terrain cell: its 2x2-block kind plus a per-cell variant index in
 * [0, variantCounts[kind]), decorrelated from the patch noise. The caller passes how many variants each
 * kind has (the renderer derives this from its fill-frame lists), so this carries no sheet-frame knowledge.
 */
export function forestTerrainTile(
  col: number,
  row: number,
  seed: number,
  variantCounts: Record<TerrainKind, number>,
): TerrainTile {
  const kind = forestTerrainKind(col, row, seed);
  const variant = Math.floor(hash01(col, row, seed ^ 0x5bd1e995) * variantCounts[kind]);
  return { kind, variant };
}

/**
 * The grass-edge overlay to draw on the forest terrain at (col, row), or null. Overlays apply to DIRT
 * cells only (a grass cell returns null). Reads the 8 neighbours' kinds and resolves via the generic
 * overlayFor (grass = the "other" kind around a dirt cell).
 */
export function forestOverlay(col: number, row: number, seed: number): TerrainOverlay | null {
  if (forestTerrainKind(col, row, seed) !== 'dirt') return null;
  const grass = (c: number, r: number): boolean => forestTerrainKind(c, r, seed) === 'grass';
  return overlayFor({
    n: grass(col, row - 1),
    e: grass(col + 1, row),
    s: grass(col, row + 1),
    w: grass(col - 1, row),
    nw: grass(col - 1, row - 1),
    ne: grass(col + 1, row - 1),
    se: grass(col + 1, row + 1),
    sw: grass(col - 1, row + 1),
  });
}

// Grass-leaf foliage tuning: decals scattered one-per-3x3-slot on grass, clustered into patches.
const FOREST_LEAF: ScatterOptions = { slot: 3, density: 0.8, cluster: 0.35, scale: 0.3 };

/**
 * The grass-leaf decal frame to draw at (col, row), or null. Decals land only where the whole footprint is
 * grass. `shapes` is the renderer's foliage decal set (frame indices opaque here). Pure + deterministic.
 */
export function forestLeaf(col: number, row: number, seed: number, shapes: readonly DecalShape[]): number | null {
  return scatterDecal(col, row, seed, shapes, (c, r) => forestTerrainKind(c, r, seed) === 'grass', FOREST_LEAF);
}
