/**
 * Procedural ground terrain (Hex Ground Terrain feature). A pure, deterministic choice of a ground
 * tile per SQUARE terrain cell — terrain is its own square background grid, independent of the hex
 * board (the hexes render on top). Phaser-free (ADR-002): identical (col, row, seed) always yields
 * the identical tile, so the whole background regenerates from the seed and is never stored (no save
 * state). The renderer maps the returned (kind, variant) to a frame in the ground tileset.
 */

export type TerrainKind = 'grass' | 'dirt';

/** A chosen ground tile: its kind and which variant within that kind (0-based). */
export interface TerrainTile {
  readonly kind: TerrainKind;
  readonly variant: number;
}

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
// specks. Units are noise-lattice units (1 unit = 1/PATCH_SCALE cells), so a sub-unit WARP_AMP nudges the
// sample by a few terrain cells. Because warping the DOMAIN (not the values) leaves the value distribution
// unchanged, DIRT_THRESHOLD keeps the same dirt fraction it had without the warp.
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
 * index in [0, variantCounts[kind]), decorrelated from the patch noise. The caller passes how many
 * variants each kind has (the renderer derives this from its fill-frame lists), so the core carries no
 * sheet-frame knowledge. Pure + deterministic, so the renderer regenerates the whole background from the
 * seed alone.
 */
export function terrainTile(
  col: number,
  row: number,
  seed: number,
  variantCounts: Record<TerrainKind, number>,
): TerrainTile {
  const kind = terrainKind(col, row, seed);
  const variant = Math.floor(hash01(col, row, seed ^ 0x5bd1e995) * variantCounts[kind]);
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

/** One tile of a leaf decal: its offset from the decal's top-left anchor and the foliage-sheet frame to draw. */
export interface LeafShapeTile {
  readonly dx: number;
  readonly dy: number;
  readonly frame: number;
}

/**
 * A grass-leaf decal: a connected cluster of tiles of ANY shape, anchored at its top-left (min dx = min dy = 0).
 * The frame indices are opaque to the core — the renderer maps them to its foliage sheet.
 */
export type LeafShape = readonly LeafShapeTile[];

// Grass-leaf detail layer: foliage decals scattered on grass. Each decal occupies one square SLOT; the slots tile
// the plane DISJOINTLY, so decals (of any shape up to LEAF_SLOT in size) never overlap, and a decal is jittered
// within its slot for natural scatter. A decal lands only where its WHOLE footprint is grass. Placement is
// CLUSTERED: a noise field modulates the fill into patches (centred so it does NOT lower the mean). All tunable.
const LEAF_SLOT = 3; // slot size in cells = the smallest that fits the largest decal (3x3); SMALLER -> more decals
const LEAF_DENSITY = 0.8; // MEAN fraction of slots that host a decal (0..1) — a clean linear knob (not noise-scaled)
const LEAF_CLUSTER = 0.35; // how strongly the noise field clusters decals into patches (0 = uniform; in fill units)
const LEAF_SCALE = 0.3; // clustering-noise scale over SLOT coords; lower = larger leaf patches

/** A decal's bounding-box size (it is anchored so min dx = min dy = 0). */
function shapeSize(shape: LeafShape): { w: number; h: number } {
  let w = 0;
  let h = 0;
  for (const tile of shape) {
    if (tile.dx + 1 > w) w = tile.dx + 1;
    if (tile.dy + 1 > h) h = tile.dy + 1;
  }
  return { w, h };
}

/**
 * The grass-leaf decal frame to draw at (col, row), or null. Foliage decals are scattered one-per-SLOT
 * (LEAF_SLOT-cell squares that tile the plane disjointly, so decals never overlap). Each slot deterministically
 * rolls — clustered by a noise field — whether to host a decal, picks one of `shapes`, and jitters its anchor
 * within the slot; the decal lands only where its WHOLE footprint is grass (a decal touching dirt is skipped).
 * Returns the foliage-sheet frame for this cell if it falls on a placed decal's tile, else null. `shapes` is the
 * renderer's decal set (its source of truth; the frame indices are opaque here). Pure + deterministic.
 */
export function terrainLeaf(col: number, row: number, seed: number, shapes: readonly LeafShape[]): number | null {
  if (shapes.length === 0) return null;
  const slotCol = Math.floor(col / LEAF_SLOT);
  const slotRow = Math.floor(row / LEAF_SLOT);
  // Clustered roll: this slot hosts a decal iff its random draw falls under the local fill threshold. The noise is
  // CENTRED on zero (valueNoise - 0.5) so it modulates the fill into patches WITHOUT lowering the mean, which stays
  // at LEAF_DENSITY — so LEAF_DENSITY reads directly as "fraction of slots filled" and tunes the count linearly.
  const cluster = valueNoise(slotCol * LEAF_SCALE, slotRow * LEAF_SCALE, seed ^ 0x2f1b9a3d) - 0.5; // ~[-0.5, 0.5)
  if (hash01(slotCol, slotRow, seed ^ 0x6d2b79f5) >= LEAF_DENSITY + LEAF_CLUSTER * cluster) return null;
  // Pick a decal and jitter its anchor so the whole footprint stays INSIDE the slot (hence no cross-slot overlap).
  const shape = shapes[Math.floor(hash01(slotCol, slotRow, seed ^ 0x85ebca77) * shapes.length)]!;
  const { w, h } = shapeSize(shape);
  if (w > LEAF_SLOT || h > LEAF_SLOT) return null; // decal too big for a slot -> never placed
  const anchorCol = slotCol * LEAF_SLOT + Math.floor(hash01(slotCol, slotRow, seed ^ 0x27d4eb2f) * (LEAF_SLOT - w + 1));
  const anchorRow = slotRow * LEAF_SLOT + Math.floor(hash01(slotCol, slotRow, seed ^ 0x165667b1) * (LEAF_SLOT - h + 1));
  // The decal lands only where its WHOLE footprint is grass.
  for (const tile of shape) {
    if (terrainKind(anchorCol + tile.dx, anchorRow + tile.dy, seed) !== 'grass') return null;
  }
  // Is THIS cell one of the decal's tiles? If so, draw its frame.
  const dx = col - anchorCol;
  const dy = row - anchorRow;
  for (const tile of shape) if (tile.dx === dx && tile.dy === dy) return tile.frame;
  return null;
}
