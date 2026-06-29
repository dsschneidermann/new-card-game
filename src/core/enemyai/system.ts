import type { System, World } from '../ecs/world';
import type { EntityId } from '../ecs/entity';
import { type Hex, hexKey, hexEquals } from '../hex/hex';
import type { HexGrid } from '../hex/grid';
import { HexPosition } from '../hex/movement';
import { Enemy, Player } from '../actors';
import { Health, CombatStats, Attack, Shield, computeDamage, applyDamage, resolveAttack } from '../combat';
import { PlannedAttack } from './components';
import { decideEnemy } from './decide';

/**
 * Enemy turn (Movement & Telegraphed Attacks). This system fills the enemy phase that the Turn Engine
 * leaves empty (runEnemyTurn is a no-op seam): it reacts to TurnStarted{enemy} and, within the SAME
 * advance(), does the Into-the-Breach loop in order:
 *   1. RESOLVE the telegraphs planned last enemy turn against the player's now-final position.
 *   2. MOVE each enemy (greedy decision; submit MoveTo for the movement system to execute this same step).
 *   3. PLAN a fresh telegraph from each enemy's new position (write PlannedAttack; the attack fires next time).
 *
 * Registration is load-bearing (WorldScene.installSystems): turn -> THIS -> movement -> ... -> shield. After
 * the turn engine so it sees TurnStarted{enemy}; BEFORE the movement system so each enemy MoveTo resolves
 * the same advance; BEFORE the shield system so resolution reads the player's live Shield (a Defend played
 * that turn soaks the hit) before TurnStarted{player} wipes it. Pure-core (ADR-002): reads no RNG, so the
 * enemy turn is deterministic and never perturbs the save's rng stream.
 */
export function makeEnemyTurnSystem(grid: HexGrid): System {
  return (world) => {
    // Snapshot events first so we never react to our own emissions (matches the card/shield discipline).
    for (const ev of [...world.events()]) {
      if (ev.kind === 'TurnStarted' && ev.phase === 'enemy') runEnemyTurn(world, grid);
    }
  };
}

/** Resolve due telegraphs, then move + re-telegraph every living enemy in deterministic ascending-id order. */
function runEnemyTurn(world: World, grid: HexGrid): void {
  resolvePendingTelegraphs(world);

  // Occupied hexes the enemies must avoid ending on: the player and every (living) combatant's current hex.
  // Each enemy's chosen destination is reserved as it decides, so no two enemies stack or land on the player.
  const blocked = occupancySet(world);

  for (const enemy of world.entitiesWith(Enemy)) {
    if (!world.isAlive(enemy)) continue; // an enemy removed earlier this turn is skipped
    const enemyPos = world.store(HexPosition).get(enemy)?.hex;
    if (enemyPos === undefined) continue;

    const decision = decideEnemy(world, grid, enemy, blocked);
    if (decision.kind === 'Wait') continue;

    if (!hexEquals(decision.dest, enemyPos)) {
      // The movement system (registered next) executes this MoveTo the same advance; it clamps to the
      // shortest path, which is within the enemy's movement budget because decideEnemy only picks
      // reachable hexes. Reserve the destination so later-deciding enemies do not pick it too.
      world.submit({ kind: 'MoveTo', entity: enemy, q: decision.dest.q, r: decision.dest.r });
      blocked.add(hexKey(decision.dest));
    }

    if (decision.kind === 'Act') planTelegraph(world, enemy, decision.attackIndex, decision.targetHexes);
  }
}

/** Hex keys occupied by living combatants (the player + every living enemy) — what movement must avoid. */
function occupancySet(world: World): Set<string> {
  const blocked = new Set<string>();
  for (const e of world.entitiesWith(HexPosition, Health)) {
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
 * For each locked hex, the Health entity standing on it takes the planned attack via the combat resolver.
 * An empty hex (the player dodged off it) is a harmless no-op; a dead attacker has no PlannedAttack (it was
 * removed with the entity), so its telegraph is already cancelled. The telegraph is cleared after it fires.
 */
function resolvePendingTelegraphs(world: World): void {
  for (const enemy of world.entitiesWith(Enemy, PlannedAttack)) {
    if (!world.isAlive(enemy)) continue;
    const plan = world.store(PlannedAttack).get(enemy)!;
    for (const hex of plan.hexes) {
      const occupant = occupantAt(world, hex, enemy);
      if (occupant === undefined) continue; // dodged / empty tile
      resolveTelegraphHit(world, enemy, occupant, plan.attackIndex);
    }
    world.store(PlannedAttack).remove(enemy);
  }
}

/** The living Health-bearing entity standing on `hex` (the player or an enemy), excluding the attacker. */
function occupantAt(world: World, hex: Hex, attacker: EntityId): EntityId | undefined {
  for (const e of world.entitiesWith(HexPosition, Health)) {
    if (e === attacker) continue;
    const pos = world.store(HexPosition).get(e);
    if (pos !== undefined && hexEquals(pos.hex, hex)) return e;
  }
  return undefined;
}

/**
 * Apply one telegraphed hit. A non-player occupant (a future friendly-fire case) resolves normally through
 * the combat resolver. The PLAYER is damaged but never killed: the loss condition / game-over is the
 * run-lifecycle feature's job (ADR-010) and is not built yet, so a telegraph floors the player's HP at 1
 * rather than destroying the player entity (which would break the scene). Emits AttackResolved like
 * resolveAttack so the scene animates the hit identically.
 */
function resolveTelegraphHit(world: World, attacker: EntityId, occupant: EntityId, attackIndex: number): void {
  if (!world.store(Player).has(occupant)) {
    resolveAttack(world, attacker, occupant, attackIndex);
    return;
  }
  const profile = world.store(Attack).get(attacker)?.profiles[attackIndex];
  const health = world.store(Health).get(occupant);
  if (profile === undefined || health === undefined) return;
  const armor = world.store(CombatStats).get(occupant)?.armor ?? 0;
  const shield = Math.max(0, world.store(Shield).get(occupant)?.shield ?? 0);
  const computed = computeDamage(profile, armor, shield);
  // Trim the HP loss so the player keeps at least 1 HP (shield absorb is unchanged). Until the run-lifecycle
  // feature lands, the player cannot be telegraphed to death.
  const survivableHpLoss = Math.max(0, health.hp - 1);
  const result =
    computed.hpLost > survivableHpLoss ? { ...computed, hpLost: survivableHpLoss } : computed;
  applyDamage(world, occupant, result); // never lethal here, so the player entity is never destroyed
  world.emit({
    kind: 'AttackResolved',
    attacker,
    target: occupant,
    attack: profile.name,
    hpLost: result.hpLost,
    shieldAbsorbed: result.shieldAbsorbed,
    lethal: false,
  });
}
