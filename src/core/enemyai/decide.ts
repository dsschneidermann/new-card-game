import type { World } from '../ecs/world';
import type { EntityId } from '../ecs/entity';
import { type Hex, hexKey, hexEquals, hexDistance } from '../hex/hex';
import type { HexGrid } from '../hex/grid';
import { hexesReachable } from '../hex/path';
import { HexPosition } from '../hex/movement';
import { Player } from '../actors';
import { Attack, Archetype } from '../combat/components';
import { inAttackRange, hasAttackLineOfSight } from '../combat/targeting';

/**
 * Enemy AI decision (Movement & Telegraphed Attacks). PURE and DETERMINISTIC — a read-only function of the
 * World, the grid and the enemy; it reads no RNG and mutates nothing, so the enemy turn never perturbs the
 * save's rng stream and is fully unit-testable. The system (system.ts) is the only mutator: it applies the
 * returned decision by submitting the move and writing the telegraph.
 *
 * Realizes the "greedy per-enemy utility scoring" decision: each enemy independently scores the hexes it
 * can reach this turn against the player and picks the best move + telegraph. Coordination is emergent —
 * ranged enemies prefer to hold range with LOS, melee converge, and occupied/reserved hexes are avoided —
 * rather than a shared formation planner. Buffs/heals are out of scope (deferred to Status Effects).
 */

/** What one enemy decided to do this turn. The system applies it; the planner never mutates the World. */
export type EnemyDecision =
  /** Move to `dest` (clamped to reach) and TELEGRAPH attack `attackIndex` onto `targetHexes`. */
  | { kind: 'Act'; dest: Hex; attackIndex: number; targetHexes: Hex[] }
  /** Reposition to `dest` toward a future shot — no usable attack from anywhere reachable this turn. */
  | { kind: 'Move'; dest: Hex }
  /** Stay put and do nothing (already optimal, or nothing useful is reachable). */
  | { kind: 'Wait' };

/** The best usable attack against `target` from hex `from`: highest baseDamage in range with LOS, else none. */
function bestAttackFrom(
  world: World,
  grid: HexGrid,
  enemy: EntityId,
  from: Hex,
  target: Hex,
): { attackIndex: number; value: number } | undefined {
  const profiles = world.store(Attack).get(enemy)?.profiles;
  if (profiles === undefined) return undefined;
  let best: { attackIndex: number; value: number } | undefined;
  for (let i = 0; i < profiles.length; i += 1) {
    const profile = profiles[i]!;
    if (!inAttackRange(profile, from, target)) continue;
    if (!hasAttackLineOfSight(profile, from, target, (h) => grid.blocksSight(h))) continue;
    if (best === undefined || profile.baseDamage > best.value) {
      best = { attackIndex: i, value: profile.baseDamage };
    }
  }
  return best;
}

/** One scored candidate destination the enemy could stand on this turn. */
interface Candidate {
  readonly hex: Hex;
  /** The best attack usable from here against the player, or undefined if none. */
  readonly attack: { attackIndex: number; value: number } | undefined;
  /** Hex distance from this candidate to the player. */
  readonly distToPlayer: number;
  /** Hex distance from this candidate to the enemy's current hex (a move-cost proxy / tie-break). */
  readonly moveCost: number;
}

/**
 * Order two candidates best-first. Being able to telegraph an attack dominates. Among attackers we prefer
 * the higher-damage attack, then to stand FARTHER from the player (kiting; for a melee enemy every
 * attacking hex is at range 1 so this never bites), then the cheapest move, then a fixed hex order. Among
 * non-attackers (nobody can shoot this turn) we instead approach: prefer the hex CLOSEST to the player.
 * Pure and total — identical inputs give an identical order (no RNG).
 */
function compareCandidates(a: Candidate, b: Candidate): number {
  const aCanAttack = a.attack !== undefined;
  const bCanAttack = b.attack !== undefined;
  if (aCanAttack !== bCanAttack) return aCanAttack ? -1 : 1;

  if (aCanAttack && bCanAttack) {
    if (a.attack!.value !== b.attack!.value) return b.attack!.value - a.attack!.value; // higher damage first
    if (a.distToPlayer !== b.distToPlayer) return b.distToPlayer - a.distToPlayer; // hold range (kite)
  } else {
    if (a.distToPlayer !== b.distToPlayer) return a.distToPlayer - b.distToPlayer; // approach: closer first
  }
  if (a.moveCost !== b.moveCost) return a.moveCost - b.moveCost; // least movement
  if (a.hex.q !== b.hex.q) return a.hex.q - b.hex.q; // fixed lexicographic tie-break (q, then r)
  return a.hex.r - b.hex.r;
}

/**
 * Decide one enemy's action for the enemy turn. `blocked` is the set of hex KEYS the enemy may not stand on
 * (the player and other actors, plus destinations already claimed by earlier-deciding enemies this turn) —
 * so no two enemies stack and none ends on the player. The enemy may always STAY on its own hex (it is not
 * filtered by `blocked`). Returns Act (move + telegraph), Move (reposition only) or Wait.
 */
export function decideEnemy(
  world: World,
  grid: HexGrid,
  enemy: EntityId,
  blocked: ReadonlySet<string>,
): EnemyDecision {
  const enemyPos = world.store(HexPosition).get(enemy)?.hex;
  if (enemyPos === undefined) return { kind: 'Wait' };

  const player = world.entitiesWith(Player)[0];
  const playerPos = player !== undefined ? world.store(HexPosition).get(player)?.hex : undefined;
  if (playerPos === undefined) return { kind: 'Wait' }; // no target — nothing to plan against

  const movement = world.store(Archetype).get(enemy)?.movement ?? 0;

  const score = (hex: Hex): Candidate => ({
    hex,
    attack: bestAttackFrom(world, grid, enemy, hex, playerPos),
    distToPlayer: hexDistance(hex, playerPos),
    moveCost: hexDistance(hex, enemyPos),
  });

  // Candidates = stay put + every walkable hex reachable within the movement budget that is not occupied/
  // reserved. hexesReachable excludes the origin, so the stay candidate is added explicitly.
  const candidates: Candidate[] = [score(enemyPos)];
  for (const hex of hexesReachable(grid, enemyPos, movement).values()) {
    if (blocked.has(hexKey(hex))) continue; // cannot end on an occupied / already-claimed hex
    candidates.push(score(hex));
  }

  const best = candidates.reduce((a, b) => (compareCandidates(a, b) <= 0 ? a : b));

  if (best.attack !== undefined) {
    return { kind: 'Act', dest: best.hex, attackIndex: best.attack.attackIndex, targetHexes: [playerPos] };
  }
  if (!hexEquals(best.hex, enemyPos)) return { kind: 'Move', dest: best.hex };
  return { kind: 'Wait' };
}
