import type { World } from '../ecs/world';
import type { EntityId } from '../ecs/entity';
import type { AttackProfile, DamageResult } from './types';
import { Health, CombatStats, Attack } from './components';

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
 * A defender's current shield pool. Status effects (ADR-008) will grant this; until that feature lands
 * there is no shield, so this is always 0. Isolated here as the single seam status effects will fill.
 */
function shieldOf(_world: World, _target: EntityId): number {
  return 0;
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
 * Resolve `attacker`'s attack on a chosen `target`: read the attacker's AttackProfile and the target's
 * armour + shield, compute the damage (deterministically), and apply it — emitting AttackResolved with the
 * breakdown plus the DamageDealt / EntityDied events from applyDamage. Returns the DamageResult, or
 * undefined when the attacker has no attack or the target has no health. Range and line-of-sight are the
 * caller's gate (see targeting.selectTarget); this assumes an already-validated target.
 */
export function resolveAttack(
  world: World,
  attacker: EntityId,
  target: EntityId,
): DamageResult | undefined {
  const atk = world.store(Attack).get(attacker);
  const health = world.store(Health).get(target);
  if (atk === undefined || health === undefined) return undefined;
  const armor = world.store(CombatStats).get(target)?.armor ?? 0;
  const result = computeDamage(atk.profile, armor, shieldOf(world, target));
  const { lethal } = applyDamage(world, target, result);
  world.emit({
    kind: 'AttackResolved',
    attacker,
    target,
    hpLost: result.hpLost,
    shieldAbsorbed: result.shieldAbsorbed,
    lethal,
  });
  return result;
}
