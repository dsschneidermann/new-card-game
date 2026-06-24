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
const PATCH_SCALE = 0.14;
// Dirt where the patch-noise is below this, grass otherwise. Below 0.5 keeps dirt the minority
// ("mostly grass, occasional dirt"). Tunable at review.
const DIRT_THRESHOLD = 0.36;

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

// Domain warp (tunable): before sampling the patch field, the sample point is displaced by a separate
// value-noise field. This bends the dirt/grass boundary into organic curves and breaks up value noise's
// axis-aligned (straight, blocky) edges WITHOUT shrinking the patches — the warp field is large-scale
// (WARP_FREQ near the base frequency), so whole blob edges bend coherently rather than pinching off into
// specks. Units are noise-lattice units (1 unit = 1/PATCH_SCALE cells), so WARP_AMP 0.5 ≈ 3 cells at
// PATCH_SCALE 0.16. Because warping the DOMAIN (not the values) leaves the value distribution unchanged,
// DIRT_THRESHOLD keeps the same dirt fraction it had without the warp.
const WARP_AMP = 0.5;
const WARP_FREQ = 1.5;

/** The patch field at a cell in [0, 1): value noise sampled at a domain-warped point. Thresholded by rawDirt. */
function patchNoise(col: number, row: number, seed: number): number {
  const x = col * PATCH_SCALE;
  const y = row * PATCH_SCALE;
  // Two decorrelated warp fields (distinct seeds) give the x and y displacement; the -0.5 centers each on
  // zero so the point is pushed both ways. Sampled at WARP_FREQ × the base frequency.
  const wx = (valueNoise(x * WARP_FREQ, y * WARP_FREQ, seed ^ 0x1b56c4f1) - 0.5) * WARP_AMP;
  const wy = (valueNoise(x * WARP_FREQ, y * WARP_FREQ, seed ^ 0x7e9a13c5) - 0.5) * WARP_AMP;
  return valueNoise(x + wx, y + wy, seed);
}

/** Raw per-cell dirt (full noise resolution), before the min-thickness opening below. */
function rawDirt(col: number, row: number, seed: number): boolean {
  return patchNoise(col, row, seed) < DIRT_THRESHOLD;
}

/** Whether (col,row) is the top-left of a fully-dirt 2x2 block in the raw field. */
function dirtBlock(col: number, row: number, seed: number): boolean {
  return (
    rawDirt(col, row, seed) &&
    rawDirt(col + 1, row, seed) &&
    rawDirt(col, row + 1, seed) &&
    rawDirt(col + 1, row + 1, seed)
  );
}

/**
 * The ground KIND for a square terrain cell. The raw per-cell value-noise is passed through a
 * morphological OPENING with a 2x2 element: a cell is dirt iff it belongs to SOME fully-dirt 2x2 block
 * (one of the four blocks it is a corner of). This removes 1-thick dirt — so every dirt feature is at
 * least 2x2, which keeps the edge-overlay rule set complete — WITHOUT quantizing the grid: boundaries
 * stay at per-cell (1-tile) resolution and odd-sized dirt patches are allowed. Grass is unconstrained.
 */
export function terrainKind(col: number, row: number, seed: number): TerrainKind {
  const dirt =
    dirtBlock(col, row, seed) ||
    dirtBlock(col - 1, row, seed) ||
    dirtBlock(col, row - 1, seed) ||
    dirtBlock(col - 1, row - 1, seed);
  return dirt ? 'dirt' : 'grass';
}

/**
 * The ground tile for a square terrain cell: its 2x2-block kind (terrainKind) plus a per-cell variant
 * hash (decorrelated from the patch noise). Pure + deterministic, so the renderer regenerates the whole
 * background from the seed alone.
 */
export function terrainTile(col: number, row: number, seed: number): TerrainTile {
  const kind = terrainKind(col, row, seed);
  const variant = Math.floor(hash01(col, row, seed ^ 0x5bd1e995) * TERRAIN_VARIANTS[kind]);
  return { kind, variant };
}

/**
 * A grass-edge OVERLAY drawn ON a dirt cell (auto-tiling): which curated transition tile blends the grass
 * neighbours onto the dirt. pairXY = two ADJACENT cardinals are grass (a convex L-corner); edgeX = one
 * cardinal; cornerXY = one diagonal. The renderer maps the descriptor to a sheet frame.
 */
export type TerrainOverlay =
  | 'pairWN'
  | 'pairNE'
  | 'pairES'
  | 'pairSW'
  | 'edgeN'
  | 'edgeE'
  | 'edgeS'
  | 'edgeW'
  | 'cornerNW'
  | 'cornerNE'
  | 'cornerSE'
  | 'cornerSW';

/** Whether each of a cell's 8 neighbours is grass. */
export interface GrassNeighbours {
  readonly n: boolean;
  readonly e: boolean;
  readonly s: boolean;
  readonly w: boolean;
  readonly nw: boolean;
  readonly ne: boolean;
  readonly se: boolean;
  readonly sw: boolean;
}

/**
 * The overlay for a dirt cell given which neighbours are grass, or null. First match in PRIORITY order:
 * adjacent-cardinal PAIRS (a convex corner) > single cardinal EDGES > single diagonal CORNERS. Under the
 * 2x2-dirt guarantee, opposite cardinals/diagonals never co-occur, so exactly one overlay applies. Pure.
 */
export function overlayFor(g: GrassNeighbours): TerrainOverlay | null {
  if (g.w && g.n) return 'pairWN';
  if (g.n && g.e) return 'pairNE';
  if (g.e && g.s) return 'pairES';
  if (g.s && g.w) return 'pairSW';
  if (g.n) return 'edgeN';
  if (g.e) return 'edgeE';
  if (g.s) return 'edgeS';
  if (g.w) return 'edgeW';
  if (g.nw) return 'cornerNW';
  if (g.ne) return 'cornerNE';
  if (g.se) return 'cornerSE';
  if (g.sw) return 'cornerSW';
  return null;
}

/**
 * The grass-edge overlay to draw on the terrain at (col, row), or null. Overlays apply to DIRT cells only
 * (a grass cell returns null). Reads the 8 neighbours' 2x2-block kinds and resolves via overlayFor. Pure +
 * deterministic, so the renderer regenerates the overlay layer from the seed alone.
 */
export function terrainOverlay(col: number, row: number, seed: number): TerrainOverlay | null {
  if (terrainKind(col, row, seed) !== 'dirt') return null;
  const grass = (c: number, r: number): boolean => terrainKind(c, r, seed) === 'grass';
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
