/**
 * Procedural ground terrain (Hex Ground Terrain feature). A pure, deterministic choice of a ground
 * tile per SQUARE terrain cell — terrain is its own square background grid, independent of the hex
 * board (the hexes render on top). Phaser-free (ADR-002): identical (col, row, seed) always yields
 * the identical tile, so the whole background regenerates from the seed and is never stored (no save
 * state). The renderer maps the returned (kind, variant) to a frame in the ground tileset.
 */

export type TerrainKind = 'grass' | 'dirt';

/** A chosen ground tile: its kind and which variant within that kind (0..TERRAIN_VARIANTS[kind)). */
export interface TerrainTile {
  readonly kind: TerrainKind;
  readonly variant: number;
}

/**
 * How many fill-tile variants each kind has. The renderer holds the matching frame-index lists and
 * maps (kind, variant) -> a sheet frame; these counts are the source of truth for the variant range.
 */
export const TERRAIN_VARIANTS: Record<TerrainKind, number> = { grass: 2, dirt: 4 };

// Cell coords are multiplied by this before sampling the noise, so the value-noise lattice spans
// ~1/scale cells — LOWER = larger, smoother patches. This is what gives coherent grass/dirt regions.
const PATCH_SCALE = 0.16;
// Dirt where the patch-noise is below this, grass otherwise. Below 0.5 keeps dirt the minority
// ("mostly grass, occasional dirt"). Tunable at review.
const DIRT_THRESHOLD = 0.34;

/** Stateless hash of an integer lattice point + seed -> a float in [0, 1). */
function hash01(xi: number, yi: number, seed: number): number {
  let h = (Math.imul(xi, 374761393) + Math.imul(yi, 668265263) + Math.imul(seed, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smoothstep, so patch borders interpolate softly rather than linearly. */
const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Seeded value noise in [0, 1): bilinearly interpolates hashed lattice values with a smoothstep, so
 * nearby samples are correlated — this is what makes terrain cluster into coherent patches rather
 * than per-cell white noise.
 */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = smooth(x - xi);
  const fy = smooth(y - yi);
  const v00 = hash01(xi, yi, seed);
  const v10 = hash01(xi + 1, yi, seed);
  const v01 = hash01(xi, yi + 1, seed);
  const v11 = hash01(xi + 1, yi + 1, seed);
  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fy;
}

/**
 * The ground tile for a square terrain cell: low-frequency value-noise splits the map into coherent
 * grass/dirt patches, and a separate per-cell hash (decorrelated from the patch noise) picks a
 * variant within the chosen kind. Pure + deterministic, so the renderer can regenerate the whole
 * background from the seed alone.
 */
export function terrainTile(col: number, row: number, seed: number): TerrainTile {
  const patch = valueNoise(col * PATCH_SCALE, row * PATCH_SCALE, seed);
  const kind: TerrainKind = patch < DIRT_THRESHOLD ? 'dirt' : 'grass';
  const variant = Math.floor(hash01(col, row, seed ^ 0x5bd1e995) * TERRAIN_VARIANTS[kind]);
  return { kind, variant };
}
