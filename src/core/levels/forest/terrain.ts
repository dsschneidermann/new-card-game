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
import { BASE_HEX_LAYOUT, axialToOffset } from '../../hex/layout';
import type { Hex } from '../../hex/hex';

/** The forest ground kinds. */
export type ForestTerrainKind = 'grass' | 'dirt';

/** A chosen ground tile: its kind and which variant within that kind (0-based). */
export interface ForestTerrainTile {
  readonly kind: ForestTerrainKind;
  readonly variant: number;
}

/** The forest's grass-edge overlay descriptor (the generic auto-tile transition, under a forest name). */
export type ForestTerrainOverlay = OverlayTile;

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
export function forestTerrainKind(col: number, row: number, seed: number): ForestTerrainKind {
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
  variantCounts: Record<ForestTerrainKind, number>,
): ForestTerrainTile {
  const kind = forestTerrainKind(col, row, seed);
  const variant = Math.floor(hash01(col, row, seed ^ 0x5bd1e995) * variantCounts[kind]);
  return { kind, variant };
}

/**
 * The grass-edge overlay to draw on the forest terrain at (col, row), or null. Overlays apply to DIRT
 * cells only (a grass cell returns null). Reads the 8 neighbours' kinds and resolves via the generic
 * overlayFor (grass = the "other" kind around a dirt cell).
 */
export function forestOverlay(col: number, row: number, seed: number): ForestTerrainOverlay | null {
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

// The forest's ground-terrain display tile size (BASE / unscaled px). WorldScene draws the terrain layers at
// s()-scaled multiples of these (tileW = s(24), tileH = s(16)); the classifier below reads them unscaled.
// The source art is a natural 16x16 square — the 24x16 display footprint is the forest's horizontal stretch.
export const FOREST_TILE_W = 24;
export const FOREST_TILE_H = 16;

/**
 * The terrain CLASS of a hex — 'grass' / 'dirt' (cleanly one kind) or 'mixed' — used by procedural object
 * placement to keep grass-only / dirt-only props on matching ground. A hex covers several square terrain
 * tiles, so this maps the hex (via BASE_HEX_LAYOUT) to its base-px footprint, then samples forestTerrainKind
 * over every FOREST_TILE-sized tile under that footprint: all grass -> 'grass', all dirt -> 'dirt', any
 * mix -> 'mixed'. EXACT (matches the drawn terrain) because the layout and tile size are both s()-scaled
 * multiples of these base constants, so the scale cancels in the floor()/div. Pure + deterministic; a
 * boundary hex reads 'mixed' (conservative — the safe reading of "cleanly grass/dirt").
 */
export function forestHexTerrainClass(hex: Hex, seed: number): ForestTerrainKind | 'mixed' {
  const { col, row } = axialToOffset(hex);
  const centerX = BASE_HEX_LAYOUT.originX + col * BASE_HEX_LAYOUT.width + (row & 1) * (BASE_HEX_LAYOUT.width / 2);
  const centerY = BASE_HEX_LAYOUT.originY + row * BASE_HEX_LAYOUT.rowPitch;
  const tx0 = Math.floor((centerX - BASE_HEX_LAYOUT.width / 2) / FOREST_TILE_W);
  const tx1 = Math.floor((centerX + BASE_HEX_LAYOUT.width / 2 - 1) / FOREST_TILE_W);
  const ty0 = Math.floor((centerY - BASE_HEX_LAYOUT.height / 2) / FOREST_TILE_H);
  const ty1 = Math.floor((centerY + BASE_HEX_LAYOUT.height / 2 - 1) / FOREST_TILE_H);
  let sawGrass = false;
  let sawDirt = false;
  for (let ty = ty0; ty <= ty1; ty += 1) {
    for (let tx = tx0; tx <= tx1; tx += 1) {
      if (forestTerrainKind(tx, ty, seed) === 'dirt') sawDirt = true;
      else sawGrass = true;
      if (sawGrass && sawDirt) return 'mixed'; // a mix of kinds under the footprint
    }
  }
  return sawDirt ? 'dirt' : 'grass';
}
