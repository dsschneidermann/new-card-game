import type { System, World } from '../ecs/world';
import type { EntityId } from '../ecs/entity';
import { type Hex, hexKey, hexEquals } from '../hex/hex';
import type { HexGrid } from '../hex/grid';
import { HexPosition } from '../hex/movement';
import { Enemy, Player } from '../actors';
import { Health, CombatStats, Attack, Shield, computeDamage, applyDamage } from '../combat';
import { PlannedAttack } from './components';
import { decideEnemy } from './decide';

/**
 * Enemy turn (Movement & Telegraphed Attacks). This system IS the enemy phase: the Turn Engine merely emits
 * TurnStarted{enemy} (it has no enemy-phase loop of its own), and this system reacts to that event and,
 * within the SAME advance(), does the Into-the-Breach loop in order:
 *   1. RESOLVE the telegraphs planned last enemy turn against the player's now-final position.
 *   2. MOVE each enemy (greedy decision; submit MoveTo for the movement system to execute this same step).
 *   3. PLAN a fresh telegraph from each enemy's new position (write PlannedAttack; the attack fires next time).
 *
 * Registration is load-bearing (WorldScene.installSystems): turn -> THIS -> movement -> ... -> shield. After
 * the turn engine so it sees TurnStarted{enemy}; BEFORE the movement system so each enemy MoveTo resolves
 * the same advance; BEFORE the shield system so resolution reads the player's live Shield (a Defend played
 * that turn soaks the hit) before TurnStarted{player} wipes it. Phaser-free core (ADR-002); the only
 * randomness is the seeded world.rng draw that orders the enemies (see runEnemyTurn) — each enemy's
 * DECISION stays pure — so the turn is still replay-deterministic for a given seed.
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
 * Resolve due telegraphs, then move + re-telegraph every living enemy. Enemies act in a RANDOM order each
 * turn (seeded world.rng) rather than ascending id: the first to decide reserves the best hex, so rotating
 * who goes first keeps that greedy first-mover advantage from always favouring the lowest id — a fairer,
 * more balanced choice. Still replay-deterministic — world.rng is seeded and a resumed/restarted run keeps
 * the live rng, so the same run shuffles identically.
 */
function runEnemyTurn(world: World, grid: HexGrid): void {
  resolvePendingTelegraphs(world);

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
      // shortest path, which is within the enemy's movement budget because decideEnemy only picks
      // reachable hexes. Reserve the destination, and FREE the hex this enemy is vacating, so a
      // later-deciding enemy can avoid the new tile yet still claim the one being left behind this
      // same turn (the move is guaranteed: the destination is reachable, so the enemy does vacate).
      world.submit({ kind: 'MoveTo', entity: enemy, q: decision.dest.q, r: decision.dest.r });
      blocked.delete(hexKey(enemyPos));
      blocked.add(hexKey(decision.dest));
    }

    if (decision.kind === 'Act') planTelegraph(world, enemy, decision.attackIndex, decision.targetHexes);
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
 */
function resolvePendingTelegraphs(world: World): void {
  const player = world.entitiesWith(Player)[0];
  const playerHex = player !== undefined ? world.store(HexPosition).get(player)?.hex : undefined;
  for (const enemy of world.entitiesWith(Enemy, PlannedAttack)) {
    if (!world.isAlive(enemy)) continue;
    const plan = world.store(PlannedAttack).get(enemy)!;
    if (player !== undefined && playerHex !== undefined && plan.hexes.some((h) => hexEquals(h, playerHex))) {
      resolveTelegraphHit(world, enemy, player, plan.attackIndex);
    }
    world.store(PlannedAttack).remove(enemy);
  }
}

/**
 * Apply one telegraphed hit to the PLAYER (telegraphs never hit enemies, so there is no other branch). The
 * player is damaged but never killed: the loss condition / game-over is the run-lifecycle feature's job
 * (ADR-010) and is not built yet, so a telegraph floors the player's HP at 1 rather than destroying the
 * player entity (which would break the scene). Mirrors combat.resolveAttack (profile -> armor -> shield ->
 * computeDamage -> applyDamage) and emits AttackResolved like it so the scene animates the hit identically;
 * the HP floor is the only difference.
 */
function resolveTelegraphHit(world: World, attacker: EntityId, player: EntityId, attackIndex: number): void {
  const profile = world.store(Attack).get(attacker)?.profiles[attackIndex];
  const health = world.store(Health).get(player);
  if (profile === undefined || health === undefined) return;
  const armor = world.store(CombatStats).get(player)?.armor ?? 0;
  const shield = Math.max(0, world.store(Shield).get(player)?.shield ?? 0);
  const computed = computeDamage(profile, armor, shield);
  // Trim the HP loss so the player keeps at least 1 HP (shield absorb is unchanged). Until the run-lifecycle
  // feature lands, the player cannot be telegraphed to death.
  const survivableHpLoss = Math.max(0, health.hp - 1);
  const result =
    computed.hpLost > survivableHpLoss ? { ...computed, hpLost: survivableHpLoss } : computed;
  applyDamage(world, player, result); // never lethal here, so the player entity is never destroyed
  world.emit({
    kind: 'AttackResolved',
    attacker,
    target: player,
    attack: profile.name,
    hpLost: result.hpLost,
    shieldAbsorbed: result.shieldAbsorbed,
    lethal: false,
  });
}
