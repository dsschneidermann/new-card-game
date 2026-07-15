/**
 * The FOREST level's continuous-reinforcement PLANNING (Enemy Onslaught) — pure, Phaser-free (ADR-002) and
 * unit-tested, the sibling of this level's initial enemy placement (generateForestEnemies). It decides, for
 * one enemy phase, WHICH archetypes reinforce and WHERE they enter from — but does NOT spawn or render them:
 * the renderer half (src/render/levels/ForestLevel) calls planForestReinforcements, then spawns + renders each
 * planned enemy together in the same loop.
 *
 * Enemies enter from the ring JUST OUTSIDE the visible viewport around the player, so they walk into view. The
 * wave size RISES with the round then PLATEAUS; the eligible archetype pool WIDENS over the rounds toward a
 * final roster; a global concurrent cap bounds the field. Every count / position / kind is a seeded world.rng
 * draw, so it must be planned EXACTLY ONCE per enemy phase (the renderer gates on TurnStarted{enemy}); given
 * that, Restart Turn / Resume replay identically (the turn checkpoint captures the post-draw rng + the spawned,
 * persisted enemies). The schedule reads the already-persisted TurnState.round, so NOTHING new is persisted.
 */
import type { World } from '../../ecs/world';
import { type Hex, hexKey } from '../../hex/hex';
import { axialToOffset, offsetToAxial } from '../../hex/layout';
import type { HexGrid } from '../../hex/grid';
import { HexPosition } from '../../hex/movement';
import { Enemy, Player } from '../../actors';
import { TurnState } from '../../turn/components';

/** One tier of the roster-unlock schedule: from `fromRound` on, `pool` is the FULL eligible archetype set. */
export interface RosterUnlock {
  fromRound: number;
  pool: readonly string[];
}

/** The tunable reinforcement curve (forest-tier defaults in FOREST_REINFORCEMENTS). All data, surfaced at balance. */
export interface ReinforcementConfig {
  /** No reinforcements before this round (a grace period at the run start). */
  startRound: number;
  /** Wave size at startRound. */
  baseWaveSize: number;
  /** Grow the wave size by one every this many rounds... */
  waveGrowthEvery: number;
  /** ...up to this maximum — the wave-size plateau. */
  maxWaveSize: number;
  /** Never let total living enemies exceed this — the concurrent plateau; bounds entity growth for performance. */
  maxConcurrent: number;
  /** Roster-unlock tiers (ascending fromRound); the eligible pool is the widest tier whose round has been reached. */
  unlocks: readonly RosterUnlock[];
  /** Visible-viewport extent in hexes (mirrors WorldScene VIEW_COLS/VIEW_ROWS); the spawn ring sits just outside it. */
  viewCols: number;
  viewRows: number;
}

/**
 * The forest's reinforcement schedule (tunable, surfaced at balance sign-off). Reinforcements begin at round 3,
 * grow by one every two rounds up to four per wave, and are capped at 18 living enemies. The roster widens over
 * the run — the forest trio first, then heavier archetypes, reaching the full roster (incl. the dragon) at round
 * 13, the plateau. viewCols/viewRows default to the 26x21 visible viewport and are overridden by the renderer
 * with its live VIEW_COLS/VIEW_ROWS so the two never drift.
 */
export const FOREST_REINFORCEMENTS: ReinforcementConfig = {
  startRound: 3,
  baseWaveSize: 1,
  waveGrowthEvery: 2,
  maxWaveSize: 4,
  maxConcurrent: 18,
  unlocks: [
    { fromRound: 1, pool: ['goblin', 'slime', 'orc'] },
    { fromRound: 5, pool: ['goblin', 'slime', 'orc', 'knight', 'gorgon'] },
    { fromRound: 9, pool: ['goblin', 'slime', 'orc', 'knight', 'gorgon', 'demon', 'minotaur'] },
    {
      fromRound: 13,
      pool: ['goblin', 'slime', 'orc', 'knight', 'gorgon', 'demon', 'minotaur', 'lava_golem', 'elf_queen', 'dragon'],
    },
  ],
  viewCols: 26,
  viewRows: 21,
};

/** A single planned reinforcement: which archetype (defId, keyed into ARCHETYPES) enters, and on which hex. */
export interface ReinforcementSpawn {
  readonly defId: string;
  readonly hex: Hex;
}

/**
 * How many enemies the reinforcement wave spawns at `round`: none before startRound, then baseWaveSize plus one
 * per waveGrowthEvery rounds elapsed, clamped to maxWaveSize (the plateau). Pure.
 */
export function reinforcementWaveSize(round: number, cfg: ReinforcementConfig): number {
  if (round < cfg.startRound) return 0;
  const grown = cfg.baseWaveSize + Math.floor((round - cfg.startRound) / cfg.waveGrowthEvery);
  return Math.min(cfg.maxWaveSize, grown);
}

/**
 * The archetype ids eligible at `round`: the pool of the widest unlock tier whose fromRound has been reached
 * (tiers ascending; a later tier lists the whole eligible set — replace semantics). Empty before the first tier.
 * Pure.
 */
export function unlockedPool(round: number, cfg: ReinforcementConfig): readonly string[] {
  let pool: readonly string[] = [];
  for (const tier of cfg.unlocks) {
    if (round >= tier.fromRound) pool = tier.pool;
  }
  return pool;
}

/**
 * The candidate spawn hexes on the ring JUST OUTSIDE the visible viewport centred on the player: the perimeter
 * of the (viewCols x viewRows) viewport box expanded by one hex, computed in offset (col,row) space. Hexes that
 * fall off the (cols x rows) map are DROPPED — so near a world edge the ring collapses onto the in-world tiles
 * along that border (spawns come from the far edge only when the player is close to it). Pure geometry: NO
 * walkability or occupancy filtering (the caller does that). The player's own viewport is never on the ring, so
 * reinforcements always start off-screen.
 */
export function offscreenRingHexes(
  cfg: ReinforcementConfig,
  playerHex: Hex,
  cols: number,
  rows: number,
): Hex[] {
  const { col: playerCol, row: playerRow } = axialToOffset(playerHex);
  const halfCols = Math.floor(cfg.viewCols / 2);
  const halfRows = Math.floor(cfg.viewRows / 2);
  // The visible viewport box in offset space, expanded by one ring so its perimeter sits one hex OFF-screen.
  const left = playerCol - halfCols - 1;
  const right = playerCol + (cfg.viewCols - 1 - halfCols) + 1;
  const top = playerRow - halfRows - 1;
  const bottom = playerRow + (cfg.viewRows - 1 - halfRows) + 1;

  const ring: Hex[] = [];
  for (let col = left; col <= right; col += 1) {
    for (let row = top; row <= bottom; row += 1) {
      const onPerimeter = col === left || col === right || row === top || row === bottom;
      if (!onPerimeter) continue;
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue; // off the map -> dropped
      ring.push(offsetToAxial({ col, row }));
    }
  }
  return ring;
}

/**
 * Plan this enemy phase's reinforcement wave (deterministic via world.rng): the wave size for the current round,
 * clamped by the global concurrent cap and by how many off-screen ring hexes are actually free (walkable + not
 * occupied), then each spawn's hex (drawn WITHOUT replacement so two never share a tile) + archetype. Returns
 * the list the renderer spawns + renders; empty when nothing should reinforce (before startRound, at the cap, no
 * pool yet, no positioned player, or no free ring hex).
 *
 * DRAWS world.rng — the renderer MUST call this EXACTLY ONCE per enemy phase (gated on TurnStarted{enemy}) so
 * the seeded stream stays aligned and replays are identical. spawnEnemy itself draws no rng, so returning the
 * plan and spawning it afterwards consumes the stream in the same order as drawing inline would.
 */
export function planForestReinforcements(world: World, grid: HexGrid, cfg: ReinforcementConfig): ReinforcementSpawn[] {
  const round = currentRound(world);

  const waveSize = reinforcementWaveSize(round, cfg);
  if (waveSize <= 0) return [];

  // Global cap: never push total living enemies past maxConcurrent (bounds entity growth + keeps the field finite).
  const livingEnemies = world.entitiesWith(Enemy).filter((e) => world.isAlive(e)).length;
  const slots = Math.min(waveSize, cfg.maxConcurrent - livingEnemies);
  if (slots <= 0) return [];

  const pool = unlockedPool(round, cfg);
  if (pool.length === 0) return [];

  const playerHex = playerHexOf(world);
  if (playerHex === undefined) return [];

  // Off-screen ring hexes that are actually spawnable: walkable and not already occupied by anything.
  const occupied = occupiedHexes(world);
  const candidates = offscreenRingHexes(cfg, playerHex, grid.cols, grid.rows).filter(
    (h) => grid.isWalkable(h) && !occupied.has(hexKey(h)),
  );
  if (candidates.length === 0) return [];

  const count = Math.min(slots, candidates.length);
  const plan: ReinforcementSpawn[] = [];
  for (let i = 0; i < count; i += 1) {
    // Draw a ring hex WITHOUT replacement (so two reinforcements never share a tile) and an archetype from the pool.
    const hex = candidates.splice(world.rng.int(candidates.length), 1)[0]!;
    const defId = pool[world.rng.int(pool.length)]!;
    plan.push({ defId, hex });
  }
  return plan;
}

/** The current round from the singleton TurnState (0 if absent — defensive for hand-built test worlds). */
function currentRound(world: World): number {
  const actor = world.entitiesWith(TurnState)[0];
  return actor !== undefined ? (world.store(TurnState).get(actor)?.round ?? 0) : 0;
}

/** The player's current hex, or undefined when there is no positioned player. */
function playerHexOf(world: World): Hex | undefined {
  const player = world.entitiesWith(Player)[0];
  return player !== undefined ? world.store(HexPosition).get(player)?.hex : undefined;
}

/** Hex keys occupied by ANY positioned entity (player, enemies, props) — reinforcements never spawn on these. */
function occupiedHexes(world: World): Set<string> {
  const occupied = new Set<string>();
  for (const e of world.entitiesWith(HexPosition)) {
    if (!world.isAlive(e)) continue;
    const pos = world.store(HexPosition).get(e);
    if (pos !== undefined) occupied.add(hexKey(pos.hex));
  }
  return occupied;
}
