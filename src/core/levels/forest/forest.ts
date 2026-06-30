/**
 * The FOREST level's pure content generation (Phaser-free, ADR-002): its size, the player's start hex,
 * and the procedural placement of its obstacles (trees + rocks) and reward chests, all deterministic from
 * the run seed. Unit-tested. The renderer half (src/render/levels/ForestLevel) pairs these with the
 * forest's tileset frames + prop art. Only the generic algorithm helpers (hashing, hex math) are shared.
 */
import { offsetToAxial, axialToOffset } from '../../hex/layout';
import { hexKey, hexDistance, type Hex } from '../../hex/hex';
import { hash01 } from '../../terrain/terrain';
import { forestHexTerrainClass } from './terrain';
import { FOREST_OBJECTS, type ForestObjectDef } from './objects';
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

// Obstacle placement (tunable; surfaced at visual-QA). Each placeable object is declared in FOREST_OBJECTS
// (objects.ts) with its own kind, terrain constraint, mirroring, art-variant count, and placement amount;
// generateForestObstacles walks that registry. Placement is deterministic from the run seed via pure
// hashing (NEVER world.rng, so the gameplay RNG / deck shuffle is untouched), and a radius around the start
// is always kept clear so the player isn't boxed in. The fixed base salts keep each object's placement
// stream decorrelated from terrain, chests and enemies; per-object salts are mixed in from the object id.
const START_CLEAR_RADIUS = 3; // keep this many hexes around the start clear of obstacles
const OBSTACLE_PLACE_SALT = 0x0b57a1; // base salt for a density object's per-cell roll
const OBSTACLE_COUNT_SALT = 0x0b57a3; // base salt for a count object's quantity
const OBSTACLE_COUNT_POS_SALT = 0x0b57a4; // base salt for a count object's spread start index
const OBJECT_FLIP_SALT = 0x0b57a5; // cosmetic: a mirrored object's left/right flip
const OBJECT_VARIANT_SALT = 0x0b57a6; // cosmetic: which art variant of a multi-variant object

/** A stable per-object salt mixed from the object id, so adding an object needs no hand-picked salt. */
function objectSalt(id: string, base: number): number {
  let h = base | 0;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return h | 0;
}

/**
 * The forest's obstacles, generated deterministically from the run seed by walking FOREST_OBJECTS. COUNT
 * objects are placed first (a rare landmark gets primo eligible hexes before dense scatter fills them), then
 * DENSITY objects. A hex is eligible for an object when it is outside START_CLEAR_RADIUS, not already taken,
 * and its terrain class matches the object's constraint (or the object is 'any'). Each spawn carries the
 * object's `variant` id; no hex hosts two objects. Pure — the renderer turns each into an Obstacle entity
 * and draws the art for its variant.
 */
export function generateForestObstacles(seed: number): ObstacleSpawn[] {
  const out: ObstacleSpawn[] = [];
  const occupied = new Set<string>();

  const eligible = (hex: Hex, def: ForestObjectDef): boolean => {
    if (hexDistance(hex, forestStartHex) <= START_CLEAR_RADIUS) return false; // breathing room around the start
    if (occupied.has(hexKey(hex))) return false; // one object per hex
    if (def.terrain === 'any') return true;
    return forestHexTerrainClass(hex, seed) === def.terrain; // grass-only / dirt-only honoured here
  };
  const place = (hex: Hex, def: ForestObjectDef): void => {
    occupied.add(hexKey(hex));
    out.push({ kind: def.kind, variant: def.id, hex });
  };

  // Pass 1: count objects — gather eligible hexes, seed-pick a quantity, take them at a seed-offset spread.
  for (const def of FOREST_OBJECTS) {
    if (def.placement.kind !== 'count') continue;
    const candidates: Hex[] = [];
    for (let row = 0; row < FOREST_ROWS; row += 1)
      for (let col = 0; col < FOREST_COLS; col += 1) {
        const hex = offsetToAxial({ col, row });
        if (eligible(hex, def)) candidates.push(hex);
      }
    if (candidates.length === 0) continue;
    const span = def.placement.max - def.placement.min + 1;
    const wanted = def.placement.min + Math.floor(hash01(0, 0, seed ^ objectSalt(def.id, OBSTACLE_COUNT_SALT)) * span);
    const n = Math.min(wanted, candidates.length);
    if (n <= 0) continue;
    const start = Math.floor(hash01(1, 0, seed ^ objectSalt(def.id, OBSTACLE_COUNT_POS_SALT)) * candidates.length);
    const step = Math.max(1, Math.floor(candidates.length / n));
    for (let i = 0; i < n; i += 1) place(candidates[(start + i * step) % candidates.length]!, def);
  }

  // Pass 2: density objects — roll a per-cell hash against the density on each remaining eligible hex.
  for (const def of FOREST_OBJECTS) {
    if (def.placement.kind !== 'density') continue;
    const salt = objectSalt(def.id, OBSTACLE_PLACE_SALT);
    for (let row = 0; row < FOREST_ROWS; row += 1)
      for (let col = 0; col < FOREST_COLS; col += 1) {
        const hex = offsetToAxial({ col, row });
        if (!eligible(hex, def)) continue;
        if (hash01(col, row, seed ^ salt) >= def.placement.density) continue;
        place(hex, def);
      }
  }
  return out;
}

/**
 * Which art variant (0-based, < variants) a multi-variant object shows at this hex — derived deterministically
 * from the hex + run seed (cosmetic; like forestPropFacing it uses the terrain hash, never world.rng). Stable
 * across Resume / Restart Level, so an object's art reproduces without being persisted.
 */
export function forestObjectVariantIndex(hex: Hex, seed: number, variants: number): number {
  if (variants <= 1) return 0;
  const { col, row } = axialToOffset(hex);
  return Math.min(variants - 1, Math.floor(hash01(col, row, seed ^ OBJECT_VARIANT_SALT) * variants));
}

/**
 * Whether an object is horizontally mirrored at this hex — derived deterministically from the hex + run seed
 * (cosmetic; the caller only consults it for objects whose def allows mirroring). Stable across Resume /
 * Restart Level, so flips reproduce without being persisted.
 */
export function forestObjectFlipped(hex: Hex, seed: number): boolean {
  const { col, row } = axialToOffset(hex);
  return hash01(col, row, seed ^ OBJECT_FLIP_SALT) < 0.5;
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
