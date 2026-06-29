import type { System, World } from '../ecs/world';
import type { EntityId } from '../ecs/entity';
import type { Hex } from '../hex/hex';
import { hexEquals } from '../hex/hex';
import { HexPosition } from '../hex/movement';
import { Enemy } from '../actors';
import type { AttackProfile, DamageResult } from './types';
import { Health, CombatStats, Attack, Shield } from './components';

/**
 * Pure damage math (ADR-007). Flat-reduction armour with a min-1 floor; an optional pierce ignores part
 * of the armour before the floor; a Shield pool (status effects, ADR-008 — 0 until that lands) absorbs
 * what gets through before HP. Deterministic by design: no RNG rolls damage, so Restart Turn / undo
 * cannot be used to fish for better numbers (brief design constraint refining ADR-007).
 */
export function computeDamage(
  profile: AttackProfile,
  defenderArmor: number,
  defenderShield: number,
): DamageResult {
  const effectiveArmor = Math.max(0, defenderArmor - (profile.pierce ?? 0));
  const afterArmor = Math.max(1, profile.baseDamage - effectiveArmor);
  const shieldAbsorbed = Math.min(Math.max(0, defenderShield), afterArmor);
  const hpLost = afterArmor - shieldAbsorbed;
  return { afterArmor, shieldAbsorbed, hpLost };
}

/**
 * A defender's current shield pool (ADR-008): the absorb that soaks damage before HP. Read from the
 * Shield component (Defense & Shielding); 0 when the target has no shield. The single seam computeDamage
 * reads — applyDamage spends it down by what it absorbs.
 */
function shieldOf(world: World, target: EntityId): number {
  return Math.max(0, world.store(Shield).get(target)?.shield ?? 0);
}

/**
 * Apply an already-computed hit to `target`: reduce HP by hpLost (clamped at 0), emit DamageDealt, and on
 * reaching 0 emit EntityDied and destroy the entity (ADR-007). Generic over the damage source so a future
 * DoT (poison) can reuse it. Returns whether the hit was lethal and the HP left. Mutates the World, so it
 * is only ever called from within a system during advance().
 */
export function applyDamage(
  world: World,
  target: EntityId,
  result: DamageResult,
): { remainingHp: number; lethal: boolean } {
  const health = world.store(Health).get(target);
  if (health === undefined) return { remainingHp: 0, lethal: false };
  // Spend the shield it soaked FIRST (so the pool depletes), then take the HP it could not stop. shieldOf
  // already floored the pool at 0, so shieldAbsorbed never exceeds it — this can't push the shield negative.
  const shield = world.store(Shield).get(target);
  if (shield !== undefined) shield.shield = Math.max(0, shield.shield - result.shieldAbsorbed);
  health.hp = Math.max(0, health.hp - result.hpLost);
  const lethal = health.hp === 0;
  const remainingHp = health.hp;
  world.emit({ kind: 'DamageDealt', target, amount: result.hpLost });
  if (lethal) {
    world.emit({ kind: 'EntityDied', entity: target });
    world.destroyEntity(target);
  }
  return { remainingHp, lethal };
}

/**
 * Resolve one of `attacker`'s attacks on a chosen `target`. `attackIndex` selects which attack to use
 * (the Enemy AI chooses which; defaults to the entity's primary attack, index 0). Reads the
 * attack profile and the target's armour + shield, computes the damage (deterministically), and applies it
 * — emitting AttackResolved (carrying the attack's name) plus the DamageDealt / EntityDied events from
 * applyDamage. Returns the DamageResult, or undefined when the index is out of range or the target has no
 * health. Range and line-of-sight are the caller's gate (see targeting); this assumes a valid target.
 */
export function resolveAttack(
  world: World,
  attacker: EntityId,
  target: EntityId,
  attackIndex = 0,
): DamageResult | undefined {
  const profile = world.store(Attack).get(attacker)?.profiles[attackIndex];
  const health = world.store(Health).get(target);
  if (profile === undefined || health === undefined) return undefined;
  const armor = world.store(CombatStats).get(target)?.armor ?? 0;
  const result = computeDamage(profile, armor, shieldOf(world, target));
  const { lethal } = applyDamage(world, target, result);
  world.emit({
    kind: 'AttackResolved',
    attacker,
    target,
    attack: profile.name,
    hpLost: result.hpLost,
    shieldAbsorbed: result.shieldAbsorbed,
    lethal,
  });
  return result;
}

/** The living enemy standing on `hex`, if any (an enemy without Health — e.g. a disguised mimic — is not
 *  a valid combat target and is skipped). The player attacks enemies by the hex its card was aimed at. */
function enemyAt(world: World, hex: Hex): EntityId | undefined {
  for (const enemy of world.entitiesWith(Enemy)) {
    if (world.store(Health).get(enemy) === undefined) continue; // not a combat target (e.g. disguised mimic)
    const pos = world.store(HexPosition).get(enemy);
    if (pos !== undefined && hexEquals(pos.hex, hex)) return enemy;
  }
  return undefined;
}

/**
 * Resolve a player attack CARD against the enemies on the aimed `hexes` (Defense & Shielding). The card
 * supplies the damage (and optional pierce) — the player has no Attack component; its attacks are cards.
 * For each hex with a living enemy it runs the same deterministic computeDamage/applyDamage path
 * (armour, then shield, then HP) and emits AttackResolved (carrying `attackName`, the card's id) + the
 * DamageDealt / EntityDied events from applyDamage. A hex with no enemy is a harmless no-op (e.g. a
 * Whirlwind hex that happens to be empty, or an attack aimed at bare ground). Range/LOS were gated by the
 * caller (targeting); this only damages. Invoked by makeCardAttackSystem off an AttackRequested event;
 * exported for direct use in tests. Returns the per-hit DamageResults (for tests / future feedback).
 */
export function resolveCardAttack(
  world: World,
  attacker: EntityId,
  hexes: readonly Hex[],
  baseDamage: number,
  pierce = 0,
  attackName = 'attack',
): DamageResult[] {
  const profile: AttackProfile = {
    name: attackName,
    minRange: 0,
    maxRange: 0,
    requiresLineOfSight: false,
    baseDamage,
    pierce,
  };
  const results: DamageResult[] = [];
  for (const hex of hexes) {
    const target = enemyAt(world, hex);
    if (target === undefined) continue;
    const armor = world.store(CombatStats).get(target)?.armor ?? 0;
    const result = computeDamage(profile, armor, shieldOf(world, target));
    const { lethal } = applyDamage(world, target, result);
    world.emit({
      kind: 'AttackResolved',
      attacker,
      target,
      attack: profile.name,
      hpLost: result.hpLost,
      shieldAbsorbed: result.shieldAbsorbed,
      lethal,
    });
    results.push(result);
  }
  return results;
}

/**
 * The card-attack system (Defense & Shielding). Registered AFTER the card system, it fulfils the
 * AttackRequested events the card system emits from a played Attack card — resolving the damage against
 * the enemies on the aimed hexes (resolveCardAttack) and emitting AttackResolved. This is the seam that
 * keeps damage resolution in combat while the cards module only announces intent (it never calls the
 * resolver), so neither module imports the other for attacks. Snapshot events first (same discipline as
 * the card/shield systems) so we never react to AttackResolved we emit.
 */
export function makeCardAttackSystem(): System {
  return (world) => {
    for (const ev of [...world.events()]) {
      if (ev.kind === 'AttackRequested') {
        resolveCardAttack(world, ev.attacker, ev.hexes, ev.damage, ev.pierce, ev.attack);
      }
    }
  };
}
