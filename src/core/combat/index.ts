/**
 * Combat & Enemy Archetypes (ADR-007): the data-driven enemy roster, the deterministic damage resolver,
 * attack targeting (hex range + line of sight, multi-attack selection), the enemy spawn factory, and the
 * shared combat components. Pure core (ADR-002) — the scene animates off the emitted DamageDealt /
 * AttackResolved / EntityDied events.
 */
export type { AttackProfile, EnemyDef, DamageResult } from './types';
export { ARCHETYPES } from './archetypes';
export type { HealthData, CombatStatsData, AttackData, ArchetypeData, ShieldData } from './components';
export { Health, CombatStats, Attack, Archetype, Shield } from './components';
export { computeDamage, applyDamage, resolveAttack, resolveCardAttack, makeCardAttackSystem } from './combat';
export { inAttackRange, hasAttackLineOfSight } from './targeting';
export { spawnEnemy } from './spawn';
export {
  gainShield,
  resetShield,
  resetEnemyShields,
  applyEnemySelfShields,
  makeShieldSystem,
} from './shield';
