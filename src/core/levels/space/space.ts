/**
 * The SPACE level's pure content generation (Phaser-free, ADR-002): empty void terrain and asteroid
 * obstacles, deterministic from the run seed. No chests, no enemies. This is a TEMPORARY level that
 * demonstrates the level seam — adding a level touches only src/core/levels/space + src/render/levels/
 * SpaceLevel + the asset keys + the registry, never WorldScene or the shared helpers. It is deleted
 * after the code review.
 */
import { offsetToAxial } from '../../hex/layout';
import { hexDistance, type Hex } from '../../hex/hex';
import { hash01 } from '../../terrain/terrain';
import type { ObstacleSpawn } from '../levels';

// Same size as the forest so the camera / world setup is reused unchanged.
export const SPACE_COLS = 52;
export const SPACE_ROWS = 42;

/** The player starts at the grid centre. */
export const spaceStartHex: Hex = offsetToAxial({
  col: Math.floor(SPACE_COLS / 2),
  row: Math.floor(SPACE_ROWS / 2),
});

// Asteroid placement (tunable). Large asteroids are tall (block movement + sight), small are low (fire
// over). Kept clear of a radius around the start. Reuses the shared tall/low obstacle rules — only the
// art (asteroid sprites) and placement are space-specific.
const ASTEROID_DENSITY = 0.05;
const LARGE_FRACTION = 0.4; // of asteroids, the share that are large (tall) vs small (low)
const START_CLEAR_RADIUS = 3;
const ASTEROID_PLACE_SALT = 0x5ace01;
const ASTEROID_KIND_SALT = 0x5ace02;

/**
 * The space level's asteroids, generated deterministically from the run seed: large (tall) and small
 * (low) asteroids scattered across the map, none within START_CLEAR_RADIUS of the start. Pure — the
 * renderer turns each into an Obstacle entity and draws the asteroid art for its kind.
 */
export function generateSpaceObstacles(seed: number): ObstacleSpawn[] {
  const out: ObstacleSpawn[] = [];
  for (let row = 0; row < SPACE_ROWS; row += 1) {
    for (let col = 0; col < SPACE_COLS; col += 1) {
      const hex = offsetToAxial({ col, row });
      if (hexDistance(hex, spaceStartHex) <= START_CLEAR_RADIUS) continue;
      if (hash01(col, row, seed ^ ASTEROID_PLACE_SALT) >= ASTEROID_DENSITY) continue;
      const kind = hash01(col, row, seed ^ ASTEROID_KIND_SALT) < LARGE_FRACTION ? 'tall' : 'low';
      out.push({ kind, hex });
    }
  }
  return out;
}
