import type { System, World } from '../ecs/world';
import type { EntityId } from '../ecs/entity';
import { type Hex, hexKey, hexEquals } from '../hex/hex';
import type { HexGrid } from '../hex/grid';
import { HexPosition } from '../hex/movement';
import { Enemy, Player } from '../actors';
import { resolveAttack, attackPatternHexes, Attack, AttackCooldowns } from '../combat';
import { PlannedAttack } from './components';
import { decideEnemy } from './decide';

/**
 * Enemy turn (Movement & Telegraphed Attacks + Enemy Attack Patterns). This system IS the enemy phase: the
 * Turn Engine merely emits TurnStarted{enemy} (it has no enemy-phase loop of its own), and this system reacts
 * to that event and, within the SAME advance(), does the Into-the-Breach loop in order:
 *   1. RESOLVE the telegraphs planned last enemy turn against the player's now-final position.
 *   2. TICK every living enemy's attack cooldowns down by one (floor 0).
 *   3. MOVE each enemy (greedy decision; submit MoveTo for the movement system to execute this same step).
 *   4. PLAN a fresh telegraph from each enemy's new position: pick one of the decision's usable attacks with
 *      world.rng, expand its multi-hex pattern (clipped to the map), set that attack's cooldown, and write
 *      PlannedAttack. The attack fires next enemy turn.
 *
 * Registration is load-bearing (WorldScene.installSystems): turn -> THIS -> movement -> ... -> shield. After
 * the turn engine so it sees TurnStarted{enemy}; BEFORE the movement system so each enemy MoveTo resolves the
 * same advance; BEFORE the shield system so resolution reads the player's live Shield before TurnStarted
 * {player} wipes it. Phaser-free core (ADR-002). The ONLY randomness is the two seeded world.rng draws here —
 * the turn-order shuffle (see runEnemyTurn) and the per-enemy attack pick (see telegraphChosenAttack); each
 * enemy's DECISION stays pure, so the turn is still replay-deterministic for a given seed.
 */
export function makeEnemyTurnSystem(grid: HexGrid): System {
  return (world) => {
    // Snapshot events first so we never react to our own emissions (matches the card/shield discipline).
    for (const ev of [...world.events()]) {
      if (ev.kind === 'TurnStarted' && ev.phase === 'enemy') runEnemyTurn(world, grid);
    }
  };
}

/**
 * Resolve due telegraphs, tick cooldowns, then move + re-telegraph every living enemy. Enemies act in a
 * RANDOM order each turn (seeded world.rng) rather than ascending id: the first to decide reserves the best
 * hex, so rotating who goes first keeps that greedy first-mover advantage from always favouring the lowest id.
 * Still replay-deterministic — world.rng is seeded and a resumed/restarted run keeps the live rng, so the same
 * run shuffles and picks identically.
 */
function runEnemyTurn(world: World, grid: HexGrid): void {
  resolvePendingTelegraphs(world);
  tickCooldowns(world);

  // The player's hex is the fixed aim for every telegraph this turn (the player does not move during the
  // enemy phase). Patterns expand from each enemy's destination toward this hex.
  const playerHex = playerHexOf(world);

  // Occupied hexes the enemies must avoid ending on: the player, every other enemy, and props (see
  // occupancySet). Each enemy's chosen destination is reserved as it decides — and its vacated origin freed —
  // so no two enemies stack and none lands on the player or a prop.
  const blocked = occupancySet(world);

  for (const enemy of shuffledEnemies(world)) {
    if (!world.isAlive(enemy)) continue; // an enemy removed earlier this turn is skipped
    const enemyPos = world.store(HexPosition).get(enemy)?.hex;
    if (enemyPos === undefined) continue;

    const decision = decideEnemy(world, grid, enemy, blocked);
    if (decision.kind === 'Wait') continue;

    if (!hexEquals(decision.dest, enemyPos)) {
      // The movement system (registered next) executes this MoveTo the same advance; it clamps to the
      // shortest path, which is within the enemy's movement budget because decideEnemy only picks reachable
      // hexes. Reserve the destination, and FREE the hex this enemy is vacating, so a later-deciding enemy
      // can avoid the new tile yet still claim the one being left behind this same turn.
      world.submit({ kind: 'MoveTo', entity: enemy, q: decision.dest.q, r: decision.dest.r });
      blocked.delete(hexKey(enemyPos));
      blocked.add(hexKey(decision.dest));
    }

    if (decision.kind === 'Act' && playerHex !== undefined) {
      telegraphChosenAttack(world, grid, enemy, decision.dest, playerHex, decision.attackChoices);
    }
  }
}

/** The living enemies in a random order, shuffled with the seeded world.rng (Fisher-Yates). */
function shuffledEnemies(world: World): EntityId[] {
  const enemies = world.entitiesWith(Enemy).filter((e) => world.isAlive(e));
  for (let i = enemies.length - 1; i > 0; i -= 1) {
    const j = world.rng.int(i + 1);
    const tmp = enemies[i]!;
    enemies[i] = enemies[j]!;
    enemies[j] = tmp;
  }
  return enemies;
}

/** The player's current hex (the fixed aim for this turn's telegraphs), or undefined if there is no player. */
function playerHexOf(world: World): Hex | undefined {
  const player = world.entitiesWith(Player)[0];
  return player !== undefined ? world.store(HexPosition).get(player)?.hex : undefined;
}

/**
 * Decrement every living enemy's attack cooldown counters by one, floored at 0 — once per enemy turn, whether
 * or not that enemy attacks. So a special used this turn (its counter set to `cooldown`) becomes selectable
 * again exactly `cooldown` enemy turns later, gating stronger/wider strikes to less than every turn.
 */
function tickCooldowns(world: World): void {
  for (const enemy of world.entitiesWith(Enemy, AttackCooldowns)) {
    if (!world.isAlive(enemy)) continue;
    const remaining = world.store(AttackCooldowns).get(enemy)?.remaining;
    if (remaining === undefined) continue;
    for (let i = 0; i < remaining.length; i += 1) {
      if (remaining[i]! > 0) remaining[i] = remaining[i]! - 1;
    }
  }
}

/**
 * Pick ONE of the enemy's usable attacks with the seeded world.rng, expand its multi-hex pattern from the
 * enemy's destination toward the player's hex (clipped to the map so nothing spills off-board), put that
 * attack on cooldown, and write the telegraph. The aim hex (playerHex) is always in-bounds, so the clipped
 * pattern always still threatens it. `attackChoices` is guaranteed non-empty by decideEnemy (Act only returns
 * usable attacks); the length-0 guard is defensive.
 */
function telegraphChosenAttack(
  world: World,
  grid: HexGrid,
  enemy: EntityId,
  dest: Hex,
  playerHex: Hex,
  attackChoices: number[],
): void {
  if (attackChoices.length === 0) return;
  const attackIndex = attackChoices[world.rng.int(attackChoices.length)]!;
  const profile = world.store(Attack).get(enemy)?.profiles[attackIndex];
  if (profile === undefined) return;

  const hexes = attackPatternHexes(profile.pattern, dest, playerHex).filter((h) => grid.inBounds(h));
  setCooldown(world, enemy, attackIndex, profile.cooldown ?? 0);
  planTelegraph(world, enemy, attackIndex, hexes);
}

/** Put attack `index` on cooldown for `cooldown` enemy turns. A basic (cooldown 0) is never locked. */
function setCooldown(world: World, enemy: EntityId, index: number, cooldown: number): void {
  if (cooldown <= 0) return;
  const remaining = world.store(AttackCooldowns).get(enemy)?.remaining;
  if (remaining === undefined) return; // spawned enemies always carry it; defensive for hand-built worlds
  remaining[index] = cooldown;
}

/**
 * Hex keys an enemy may not END its move on: the player, every other enemy, AND Health-less props (chests,
 * disguised mimics). Keying on HexPosition alone (not HexPosition + Health) is load-bearing — a disguised
 * mimic is an Enemy with a HexPosition but NO Health, so a Health-filtered set would let an enemy stack on
 * top of it (and on chests). This constrains only the final tile; enemies still PATH through one another and
 * the player, exactly like player movement.
 */
function occupancySet(world: World): Set<string> {
  const blocked = new Set<string>();
  for (const e of world.entitiesWith(HexPosition)) {
    if (!world.isAlive(e)) continue;
    const pos = world.store(HexPosition).get(e);
    if (pos !== undefined) blocked.add(hexKey(pos.hex));
  }
  return blocked;
}

/** Write the enemy's telegraph and announce it. The hexes are copied so later mutation can't alias them. */
function planTelegraph(world: World, enemy: EntityId, attackIndex: number, hexes: readonly Hex[]): void {
  const copied = hexes.map((h) => ({ q: h.q, r: h.r }));
  world.store(PlannedAttack).add(enemy, { attackIndex, hexes: copied });
  world.emit({ kind: 'AttackPlanned', attacker: enemy, attackIndex, hexes: copied });
}

/**
 * Fire every enemy's pending telegraph at the start of the enemy phase (i.e. the end of the player's turn).
 * Telegraphs threaten ONLY the player (no enemy-vs-enemy friendly fire): a locked hex lands iff the player is
 * standing on it. If the player stepped off every locked hex this turn the telegraph whiffs (a harmless
 * no-op); a dead attacker has no PlannedAttack (removed with the entity), so its telegraph is already
 * cancelled. The player occupies a single hex, so at most one hit lands per enemy. Cleared after it fires.
 *
 * A landed telegraph resolves through the SHARED combat resolver (resolveAttack: profile -> armor -> shield
 * -> computeDamage -> applyDamage -> AttackResolved). applyDamage handles the player safely — at 0 HP it emits
 * PlayerDefeated and leaves the player entity intact (it owns TurnState/DeckState) rather than destroying it
 * (only enemies are destroyed), so the player CAN be telegraphed to death and the scene opens the defeat
 * screen (Core Gaps: player health & defeat). There is no longer a survive-at-1-HP floor.
 */
function resolvePendingTelegraphs(world: World): void {
  const player = world.entitiesWith(Player)[0];
  const playerHex = player !== undefined ? world.store(HexPosition).get(player)?.hex : undefined;
  for (const enemy of world.entitiesWith(Enemy, PlannedAttack)) {
    if (!world.isAlive(enemy)) continue;
    const plan = world.store(PlannedAttack).get(enemy)!;
    if (player !== undefined && playerHex !== undefined && plan.hexes.some((h) => hexEquals(h, playerHex))) {
      resolveAttack(world, enemy, player, plan.attackIndex);
    }
    world.store(PlannedAttack).remove(enemy);
  }
}
