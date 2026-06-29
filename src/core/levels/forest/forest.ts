/**
 * The FOREST level's pure content generation (Phaser-free, ADR-002): its size, the player's start hex,
 * and the procedural placement of its obstacles (trees + rocks) and reward chests, all deterministic from
 * the run seed. Unit-tested. The renderer half (src/render/levels/ForestLevel) pairs these with the
 * forest's tileset frames + prop art. Only the generic algorithm helpers (hashing, hex math) are shared.
 */
import { offsetToAxial, axialToOffset } from '../../hex/layout';
import { hexKey, hexDistance, type Hex } from '../../hex/hex';
import { hash01 } from '../../terrain/terrain';
import type { ObstacleSpawn, ChestSpawn, EnemySpawn } from '../levels';

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

// Reward-prop placement (tunable; surfaced at visual-QA). The forest places a RANDOMIZED number of reward
// props in [FOREST_CHEST_MIN, FOREST_CHEST_MAX], and zero or one of those positions is instead a disguised
// mimic (MIMIC_CHANCE). Both counts are derived deterministically from the run seed, so Restart Level
// reproduces the same LAYOUT (only a chest's reward CONTENT differs, since that is rolled at open time).
export const FOREST_CHEST_MIN = 4; // fewest reward props placed
export const FOREST_CHEST_MAX = 6; // most reward props placed
const MIMIC_CHANCE = 0.5; // chance the forest contains a mimic (otherwise zero)
const CHEST_CANDIDATE_RATE = 0.03; // fraction of free cells that become chest candidates (then spread out)
const CHEST_PLACE_SALT = 0x0c4e57;
const CHEST_COUNT_SALT = 0x0c4e58; // decorrelated stream for the prop COUNT
const MIMIC_PRESENT_SALT = 0x0c4e59; // decorrelated stream for whether a mimic exists
const MIMIC_INDEX_SALT = 0x0c4e5a; // decorrelated stream for WHICH position is the mimic
const FACING_SALT = 0x0c4e5b; // decorrelated stream for a prop's left/right facing

/**
 * The forest's reward-prop positions, generated deterministically from the run seed: a RANDOMIZED count in
 * [FOREST_CHEST_MIN, FOREST_CHEST_MAX] on walkable tiles (never on an obstacle or the start hex), spread
 * across the map by sampling candidates over the whole grid and taking evenly-spaced ones. Pure — the
 * renderer turns each into a Chest entity, except the one chosen by forestMimicIndex which becomes a mimic.
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
  const span = FOREST_CHEST_MAX - FOREST_CHEST_MIN + 1;
  const wanted = FOREST_CHEST_MIN + Math.floor(hash01(0, 0, seed ^ CHEST_COUNT_SALT) * span);
  const n = Math.min(wanted, candidates.length);
  const chests: ChestSpawn[] = [];
  for (let i = 0; i < n; i += 1) {
    chests.push({ hex: candidates[Math.floor((i * candidates.length) / n)]! }); // evenly spaced -> spread + distinct
  }
  return chests;
}

/**
 * Which of the `count` reward-prop positions is a disguised mimic, or null for none — derived
 * deterministically from the run seed. With probability MIMIC_CHANCE the forest contains exactly ONE mimic
 * at a seed-chosen index; otherwise none. The renderer spawns a mimic at that index instead of a chest.
 */
export function forestMimicIndex(seed: number, count: number): number | null {
  if (count <= 0) return null;
  if (hash01(1, 0, seed ^ MIMIC_PRESENT_SALT) >= MIMIC_CHANCE) return null;
  return Math.min(count - 1, Math.floor(hash01(2, 0, seed ^ MIMIC_INDEX_SALT) * count));
}

/**
 * A reward prop's facing (left/right), derived deterministically from its hex + the run seed. Purely
 * cosmetic — it does NOT touch world.rng (uses the terrain hash), so chests and mimics spawn facing a
 * stable random direction that reproduces on Restart Level and is stable on Resume.
 */
export function forestPropFacing(hex: Hex, seed: number): 'left' | 'right' {
  const { col, row } = axialToOffset(hex);
  return hash01(col, row, seed ^ FACING_SALT) < 0.5 ? 'left' : 'right';
}

// Enemy placement (tunable; surfaced at balance sign-off). A seed-deterministic count of archetype enemies
// in [FOREST_ENEMY_MIN, FOREST_ENEMY_MAX] scattered on walkable tiles, never on a blocked hex (obstacle /
// chest / start) and kept outside ENEMY_CLEAR_RADIUS of the start so the player isn't swarmed at spawn. Each
// draws an archetype from the forest pool; all counts/positions/kinds come from decorrelated seed streams.
export const FOREST_ENEMY_MIN = 3; // fewest enemies placed
export const FOREST_ENEMY_MAX = 5; // most enemies placed
const FOREST_ENEMY_POOL = ['goblin', 'slime', 'orc'] as const; // forest-tier archetype ids (orc self-shields)
const ENEMY_CLEAR_RADIUS = 6; // keep enemies at least this many hexes from the start hex
const ENEMY_CANDIDATE_RATE = 0.04; // fraction of free cells that become enemy candidates (then spread out)
const ENEMY_PLACE_SALT = 0x0e5a01;
const ENEMY_COUNT_SALT = 0x0e5a02; // decorrelated stream for the enemy COUNT
const ENEMY_KIND_SALT = 0x0e5a03; // decorrelated stream for WHICH archetype each is

/**
 * The forest's enemies, generated deterministically from the run seed: a RANDOMIZED count in
 * [FOREST_ENEMY_MIN, FOREST_ENEMY_MAX] of archetype enemies on walkable tiles, never on a `blocked` hex
 * (the caller passes obstacle + chest + start hex keys) and never within ENEMY_CLEAR_RADIUS of the start.
 * Candidates are sampled across the whole grid then taken evenly-spaced (spread out + distinct), mirroring
 * the chest generator. Pure — the renderer turns each into an Enemy entity via spawnEnemy(ARCHETYPES[defId]).
 */
export function generateForestEnemies(seed: number, blocked: ReadonlySet<string>): EnemySpawn[] {
  const candidates: Hex[] = [];
  for (let row = 0; row < FOREST_ROWS; row += 1) {
    for (let col = 0; col < FOREST_COLS; col += 1) {
      const hex = offsetToAxial({ col, row });
      if (blocked.has(hexKey(hex))) continue;
      if (hexDistance(hex, forestStartHex) <= ENEMY_CLEAR_RADIUS) continue; // breathing room around the start
      if (hash01(col, row, seed ^ ENEMY_PLACE_SALT) < ENEMY_CANDIDATE_RATE) candidates.push(hex);
    }
  }
  const span = FOREST_ENEMY_MAX - FOREST_ENEMY_MIN + 1;
  const wanted = FOREST_ENEMY_MIN + Math.floor(hash01(0, 0, seed ^ ENEMY_COUNT_SALT) * span);
  const n = Math.min(wanted, candidates.length);
  const enemies: EnemySpawn[] = [];
  for (let i = 0; i < n; i += 1) {
    const hex = candidates[Math.floor((i * candidates.length) / n)]!; // evenly spaced -> spread + distinct
    const { col, row } = axialToOffset(hex);
    const pick = Math.floor(hash01(col, row, seed ^ ENEMY_KIND_SALT) * FOREST_ENEMY_POOL.length);
    enemies.push({ defId: FOREST_ENEMY_POOL[Math.min(pick, FOREST_ENEMY_POOL.length - 1)]!, hex });
  }
  return enemies;
}
