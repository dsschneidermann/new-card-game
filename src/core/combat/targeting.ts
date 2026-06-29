import type { World } from '../ecs/world';
import type { EntityId } from '../ecs/entity';
import { type Hex, hexDistance } from '../hex/hex';
import { hasLineOfSight } from '../hex/los';
import { HexPosition } from '../hex/movement';
import type { AttackProfile } from './types';
import { Health } from './components';

/**
 * Attack targeting on the hex grid (ADR-006/ADR-007). Reuses the existing hex distance and line-of-sight
 * helpers (no new grid or Bresenham code): an attack reaches a target that is within its range band AND,
 * when it requires line of sight, has a clear straight hex line to it.
 */

/** Whether `to` is within the profile's [minRange, maxRange], measured as hex distance (ADR-006). */
export function inAttackRange(profile: AttackProfile, from: Hex, to: Hex): boolean {
  const d = hexDistance(from, to);
  return d >= profile.minRange && d <= profile.maxRange;
}

/**
 * Whether the profile can SEE `to` from `from`: trivially true unless it requires line of sight, in which
 * case the existing hex LOS must be clear. `blocksSight` is the caller's predicate (e.g. grid.blocksSight),
 * keeping this Phaser-free; sight-blocking tiles fully block (partial cover is an open brief question).
 */
export function hasAttackLineOfSight(
  profile: AttackProfile,
  from: Hex,
  to: Hex,
  blocksSight: (h: Hex) => boolean,
): boolean {
  return !profile.requiresLineOfSight || hasLineOfSight(blocksSight, from, to);
}

/**
 * The candidates an attacker at `from` could legally hit: in range AND (if the profile requires it) in
 * line of sight. Candidates lacking a position are skipped. The caller supplies the candidate set (e.g.
 * the enemy's opponents), keeping team logic out of targeting.
 */
export function targetsInReach(
  world: World,
  profile: AttackProfile,
  from: Hex,
  candidates: readonly EntityId[],
  blocksSight: (h: Hex) => boolean,
): EntityId[] {
  return candidates.filter((c) => {
    const pos = world.store(HexPosition).get(c);
    if (pos === undefined) return false;
    return inAttackRange(profile, from, pos.hex) && hasAttackLineOfSight(profile, from, pos.hex, blocksSight);
  });
}

/**
 * Pick a single target from `candidates` per the profile's targetRule (ADR-007), or undefined when none is
 * reachable. 'nearest' minimises hex distance, 'lowestHp' minimises current HP; 'highestThreat' is not
 * modelled yet and falls back to 'nearest' (the Enemy AI feature will refine it). Ties break by lowest
 * entity id so selection is deterministic (entity ids are monotonic — ECS invariant).
 */
export function selectTarget(
  world: World,
  profile: AttackProfile,
  from: Hex,
  candidates: readonly EntityId[],
  blocksSight: (h: Hex) => boolean,
): EntityId | undefined {
  const reachable = targetsInReach(world, profile, from, candidates, blocksSight);
  if (reachable.length === 0) return undefined;
  const score = (e: EntityId): number => {
    if (profile.targetRule === 'lowestHp') return world.store(Health).get(e)?.hp ?? Infinity;
    const pos = world.store(HexPosition).get(e);
    return pos === undefined ? Infinity : hexDistance(from, pos.hex); // nearest (and highestThreat placeholder)
  };
  return reachable.reduce((best, e) => {
    const scoreE = score(e);
    const scoreBest = score(best);
    if (scoreE < scoreBest) return e;
    if (scoreE === scoreBest && e < best) return e; // deterministic tie-break by id
    return best;
  });
}
