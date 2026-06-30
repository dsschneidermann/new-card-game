import type { World } from './ecs/world';
import type { EntityId } from './ecs/entity';
import { hexKey } from './hex/hex';
import { HexPosition } from './hex/movement';
import { Player, Enemy } from './actors';
import { Health } from './combat/components';

/**
 * Movement occupancy (Enemies Block Movement — low-obstacle semantics). The POLICY half of "an enemy is a low
 * obstacle for the PLAYER": which hexes a living enemy stands on, so the player's movement queries can route
 * around them. The MECHANISM half is the optional `blocked` set on findPath / hexesReachable (src/core/hex/path.ts).
 *
 * This lives ABOVE the hex layer on purpose: the foundational src/core/hex stays ignorant of combat/actors
 * (importing this would make a hex -> combat cycle), so the hex queries take a plain hex-key set and this module
 * supplies it. The movement system receives the policy by INJECTION; the turn and interact systems, which sit
 * above combat, import it directly. Pure and Phaser-free (ADR-002).
 */

/** Shared empty set returned for non-player movers, so enemy moves stay unblocked without allocating each call. */
const NO_BLOCKERS: ReadonlySet<string> = new Set<string>();

/**
 * The hex keys occupied by a living, REVEALED enemy — the tiles that block the PLAYER's movement. An entity
 * counts iff it is alive and carries both Enemy and Health: requiring Health is the load-bearing discriminator,
 * because a disguised mimic is an Enemy with a HexPosition but NO Health, so it is excluded and keeps reading as
 * the chest it imitates (a movement wall would give it away). Chests (not Enemy) and the player (not Enemy) are
 * excluded for the same component reason. Sight is never touched here — this is a LOW obstacle, not a TALL one.
 */
export function enemyOccupiedHexes(world: World): Set<string> {
  const occupied = new Set<string>();
  for (const enemy of world.entitiesWith(Enemy, Health)) {
    if (!world.isAlive(enemy)) continue;
    const pos = world.store(HexPosition).get(enemy);
    if (pos !== undefined) occupied.add(hexKey(pos.hex));
  }
  return occupied;
}

/**
 * The blocked-hex set to apply when `entity` moves: enemyOccupiedHexes when it is the player, otherwise empty.
 * Gating on the Player marker is what keeps this PLAYER-only — an enemy's MoveTo gets an empty set, so the
 * documented Into-the-Breach path-through (enemies route through one another and the player, avoiding only the
 * final occupied tile) is preserved. This is the single function the turn and movement systems consult.
 */
export function playerMoveBlockers(world: World, entity: EntityId): ReadonlySet<string> {
  return world.store(Player).get(entity) !== undefined ? enemyOccupiedHexes(world) : NO_BLOCKERS;
}
