/**
 * The FOREST level's pure content generation (Phaser-free, ADR-002): its size, the player's start hex,
 * and the procedural placement of its obstacles (trees + rocks) and reward chests, all deterministic from
 * the run seed. Unit-tested. The renderer half (src/render/levels/ForestLevel) pairs these with the
 * forest's tileset frames + prop art. Only the generic algorithm helpers (hashing, hex math) are shared.
 */
import { offsetToAxial } from '../../hex/layout';
import { hexKey, hexDistance, type Hex } from '../../hex/hex';
import { hash01 } from '../../terrain/terrain';
import type { ObstacleSpawn, ChestSpawn } from '../levels';

// The forest world is 52x42 (the Larger World feature): the camera follows the player and renders only a
// small visible viewport of this larger map.
export const FOREST_COLS = 52;
export const FOREST_ROWS = 42;

/** The player starts at the grid centre. */
export const forestStartHex: Hex = offsetToAxial({
  col: Math.floor(FOREST_COLS / 2),
  row: Math.floor(FOREST_ROWS / 2),
});

// Obstacle placement (tunable; surfaced at visual-QA). A per-cell roll scatters trees (tall, block sight)
// and rocks (low, fire over) across the map, kept clear of a radius around the start so the player isn't
// boxed in. The fixed salts keep terrain, obstacles and chests on decorrelated streams of the run seed.
const OBSTACLE_DENSITY = 0.05; // fraction of eligible cells that host an obstacle
const TALL_FRACTION = 0.55; // of obstacles, the share that are tall trees (vs low rocks)
const START_CLEAR_RADIUS = 3; // keep this many hexes around the start clear of obstacles
const OBSTACLE_PLACE_SALT = 0x0b57a1;
const OBSTACLE_KIND_SALT = 0x0b57a2;

/**
 * The forest's obstacles, generated deterministically from the run seed: trees (tall) and rocks (low)
 * scattered across the map, none within START_CLEAR_RADIUS of the start hex. Pure — the renderer turns
 * each into an Obstacle entity and draws the forest's tree/rock art for its kind.
 */
export function generateForestObstacles(seed: number): ObstacleSpawn[] {
  const out: ObstacleSpawn[] = [];
  for (let row = 0; row < FOREST_ROWS; row += 1) {
    for (let col = 0; col < FOREST_COLS; col += 1) {
      const hex = offsetToAxial({ col, row });
      if (hexDistance(hex, forestStartHex) <= START_CLEAR_RADIUS) continue; // breathing room around the start
      if (hash01(col, row, seed ^ OBSTACLE_PLACE_SALT) >= OBSTACLE_DENSITY) continue;
      const kind = hash01(col, row, seed ^ OBSTACLE_KIND_SALT) < TALL_FRACTION ? 'tall' : 'low';
      out.push({ kind, hex });
    }
  }
  return out;
}

const CHEST_COUNT = 4; // how many reward chests the forest places
const CHEST_CANDIDATE_RATE = 0.03; // fraction of free cells that become chest candidates (then spread out)
const CHEST_PLACE_SALT = 0x0c4e57;

/**
 * The forest's reward chests, generated deterministically from the run seed: CHEST_COUNT chests on
 * walkable tiles (never on an obstacle or the start hex), spread across the map by sampling candidates
 * over the whole grid and taking evenly-spaced ones. Pure — the renderer turns each into a Chest entity
 * (which rolls its offered cards from world.rng at spawn).
 */
export function generateForestChests(seed: number, obstacles: readonly ObstacleSpawn[]): ChestSpawn[] {
  const blocked = new Set<string>(obstacles.map((o) => hexKey(o.hex)));
  blocked.add(hexKey(forestStartHex));
  const candidates: Hex[] = [];
  for (let row = 0; row < FOREST_ROWS; row += 1) {
    for (let col = 0; col < FOREST_COLS; col += 1) {
      const hex = offsetToAxial({ col, row });
      if (blocked.has(hexKey(hex))) continue;
      if (hash01(col, row, seed ^ CHEST_PLACE_SALT) < CHEST_CANDIDATE_RATE) candidates.push(hex);
    }
  }
  const n = Math.min(CHEST_COUNT, candidates.length);
  const chests: ChestSpawn[] = [];
  for (let i = 0; i < n; i += 1) {
    chests.push({ hex: candidates[Math.floor((i * candidates.length) / n)]! }); // evenly spaced -> spread + distinct
  }
  return chests;
}
