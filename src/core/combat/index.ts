/**
 * Combat & Enemy Archetypes (ADR-007): data-driven archetypes, the deterministic damage resolver, attack
 * targeting (hex range + line of sight), the enemy spawn factory, and the shared combat components. Pure
 * core (ADR-002) — the scene animates off the emitted DamageDealt / AttackResolved / EntityDied events.
 */
export type { BehaviorTag, TargetRule, AttackProfile, EnemyDef, DamageResult } from './types';
export { ARCHETYPES } from './archetypes';
export type { HealthData, CombatStatsData, AttackData, ArchetypeData } from './components';
export { Health, CombatStats, Attack, Archetype } from './components';
export { computeDamage, applyDamage, resolveAttack } from './combat';
export { inAttackRange, hasAttackLineOfSight, targetsInReach, selectTarget } from './targeting';
export { spawnEnemy } from './spawn';
