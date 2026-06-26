/**
 * Generic procedural-terrain ALGORITHM helpers (Phaser-free, ADR-002). These are the level-agnostic
 * building blocks every level composes — a stateless hash, seeded value noise, a domain-warp sampler, a
 * 2x2 morphological opening, an auto-tile edge resolver, and a decal scatterer. They carry NO
 * level-specific content: which kinds exist (grass/dirt/void), the thresholds, and the sheet frames all
 * live in the level (e.g. src/core/levels/forest). Identical inputs always yield identical outputs, so a
 * level regenerates its whole background from a seed and never stores it (no save state).
 *
 * (Before the level-ownership refactor this file also held the forest's grass/dirt terrain functions;
 * those moved into src/core/levels/forest/terrain.ts, leaving only the shared helpers here.)
 */

/** Stateless hash of an integer lattice point + seed -> a float in [0, 1). */
export function hash01(xi: number, yi: number, seed: number): number {
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

/** Tuning for the domain-warped patch sampler (a level supplies its own values). */
export interface WarpOptions {
  /** Cell coords are multiplied by this before sampling — LOWER = larger, smoother patches. */
  readonly scale: number;
  /** How far the sample point is displaced, in noise-lattice units (a sub-unit nudges a few cells). */
  readonly warpAmp: number;
  /** Frequency of the warp field, as a multiple of the base frequency (near 1 = whole-blob bends). */
  readonly warpFreq: number;
}

/**
 * Value noise sampled at a domain-WARPED point: before sampling the patch field, the sample point is
 * displaced by two decorrelated value-noise fields. This bends boundaries into organic curves and
 * breaks up value noise's axis-aligned edges WITHOUT shrinking the patches. Because warping the DOMAIN
 * (not the values) leaves the value distribution unchanged, a threshold keeps the same fraction it had
 * without the warp. Returns a value in [0, 1).
 */
export function warpedNoise(col: number, row: number, seed: number, o: WarpOptions): number {
  const x = col * o.scale;
  const y = row * o.scale;
  // Two decorrelated warp fields (distinct seeds); the -0.5 centers each so the point is pushed both ways.
  const wx = (valueNoise(x * o.warpFreq, y * o.warpFreq, seed ^ 0x1b56c4f1) - 0.5) * o.warpAmp;
  const wy = (valueNoise(x * o.warpFreq, y * o.warpFreq, seed ^ 0x7e9a13c5) - 0.5) * o.warpAmp;
  return valueNoise(x + wx, y + wy, seed);
}

/**
 * Morphological 2x2 OPENING of a boolean field: returns true iff (col, row) belongs to SOME fully-on
 * 2x2 block (one of the four blocks it is a corner of). This removes 1-thick features — so every
 * surviving feature is at least 2x2 — WITHOUT quantizing the grid: boundaries stay at per-cell (1-tile)
 * resolution and odd-sized features are allowed. `isOn` is the raw per-cell predicate.
 */
export function opened2x2(isOn: (c: number, r: number) => boolean, col: number, row: number): boolean {
  const block = (c: number, r: number): boolean =>
    isOn(c, r) && isOn(c + 1, r) && isOn(c, r + 1) && isOn(c + 1, r + 1);
  return block(col, row) || block(col - 1, row) || block(col, row - 1) || block(col - 1, row - 1);
}

/**
 * An auto-tile edge transition (kind-agnostic): which curated transition tile blends a cell's "other-kind"
 * neighbours onto it. pairXY = two ADJACENT cardinals are the other kind (a convex L-corner); edgeX = one
 * cardinal; cornerXY = one diagonal. A level maps the descriptor to a sheet frame.
 */
export type OverlayTile =
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

/** Whether each of a cell's 8 neighbours is the "other"/background kind (e.g. grass around a dirt cell). */
export interface EdgeNeighbours {
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
 * The overlay for a cell given which neighbours are the other kind, or null. First match in PRIORITY
 * order: adjacent-cardinal PAIRS (a convex corner) > single cardinal EDGES > single diagonal CORNERS.
 * Under a 2x2 min-thickness guarantee, opposite cardinals/diagonals never co-occur, so exactly one
 * overlay applies. Pure + kind-agnostic.
 */
export function overlayFor(g: EdgeNeighbours): OverlayTile | null {
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

/** One tile of a decal: its offset from the decal's top-left anchor and the sheet frame to draw. */
export interface LeafShapeTile {
  readonly dx: number;
  readonly dy: number;
  readonly frame: number;
}

/**
 * A decal: a connected cluster of tiles of ANY shape, anchored at its top-left (min dx = min dy = 0).
 * The frame indices are opaque to the helper — a level maps them to its foliage sheet.
 */
export type LeafShape = readonly LeafShapeTile[];

/** Tuning for scatterDecal (a level supplies its own values). */
export interface ScatterOptions {
  /** Slot size in cells = the smallest that fits the largest decal; SMALLER -> more decals. */
  readonly slot: number;
  /** MEAN fraction of slots that host a decal (0..1) — a clean linear knob (not noise-scaled). */
  readonly density: number;
  /** How strongly the noise field clusters decals into patches (0 = uniform; in fill units). */
  readonly cluster: number;
  /** Clustering-noise scale over SLOT coords; lower = larger patches. */
  readonly scale: number;
}

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
 * The decal frame to draw at (col, row), or null. Decals are scattered one-per-SLOT (slot-cell squares
 * that tile the plane disjointly, so decals never overlap). Each slot deterministically rolls — clustered
 * by a noise field — whether to host a decal, picks one of `shapes`, and jitters its anchor within the
 * slot; the decal lands only where `allow` holds for its WHOLE footprint. Returns the sheet frame for this
 * cell if it falls on a placed decal's tile, else null. `shapes` is the level's decal set (its source of
 * truth; the frame indices are opaque here). Pure + deterministic.
 */
export function scatterDecal(
  col: number,
  row: number,
  seed: number,
  shapes: readonly LeafShape[],
  allow: (c: number, r: number) => boolean,
  o: ScatterOptions,
): number | null {
  if (shapes.length === 0) return null;
  const slotCol = Math.floor(col / o.slot);
  const slotRow = Math.floor(row / o.slot);
  // Clustered roll: this slot hosts a decal iff its draw falls under the local fill threshold. The noise is
  // CENTRED on zero (valueNoise - 0.5) so it modulates the fill into patches WITHOUT lowering the mean,
  // which stays at `density` — so density reads directly as "fraction of slots filled".
  const cluster = valueNoise(slotCol * o.scale, slotRow * o.scale, seed ^ 0x2f1b9a3d) - 0.5; // ~[-0.5, 0.5)
  if (hash01(slotCol, slotRow, seed ^ 0x6d2b79f5) >= o.density + o.cluster * cluster) return null;
  // Pick a decal and jitter its anchor so the whole footprint stays INSIDE the slot (hence no cross-slot overlap).
  const shape = shapes[Math.floor(hash01(slotCol, slotRow, seed ^ 0x85ebca77) * shapes.length)]!;
  const { w, h } = shapeSize(shape);
  if (w > o.slot || h > o.slot) return null; // decal too big for a slot -> never placed
  const anchorCol = slotCol * o.slot + Math.floor(hash01(slotCol, slotRow, seed ^ 0x27d4eb2f) * (o.slot - w + 1));
  const anchorRow = slotRow * o.slot + Math.floor(hash01(slotCol, slotRow, seed ^ 0x165667b1) * (o.slot - h + 1));
  // The decal lands only where its WHOLE footprint is allowed.
  for (const tile of shape) {
    if (!allow(anchorCol + tile.dx, anchorRow + tile.dy)) return null;
  }
  // Is THIS cell one of the decal's tiles? If so, draw its frame.
  const dx = col - anchorCol;
  const dy = row - anchorRow;
  for (const tile of shape) if (tile.dx === dx && tile.dy === dy) return tile.frame;
  return null;
}
