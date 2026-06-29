import { defineComponent, type ComponentType } from '../ecs/component';
import type { AttackProfile, BehaviorTag } from './types';

/**
 * Combat components (ADR-007). All persistent (the default): hp changes during combat and enemies must
 * survive save/resume, so each feature round-trip-tests its own slice of the save (ADR-010).
 */

/**
 * Current and maximum hit points. Shared by the player and every enemy so combat is symmetric; an entity
 * at 0 hp is removed (ADR-007). The player's death/run-end (loss condition) is deferred to the run-
 * lifecycle feature (ADR-010) — here, reaching 0 simply emits EntityDied and destroys the entity.
 */
export interface HealthData {
  hp: number;
  maxHp: number;
}

/**
 * Defensive combat stats. `armor` is flat damage reduction with a min-1 floor (ADR-007). Lives on a
 * component (not derived from the archetype catalogue) so status effects (ADR-008) can modify it later.
 * Shield is a separate, status-granted absorb pool (ADR-008), not modelled yet — combat treats it as 0.
 */
export interface CombatStatsData {
  armor: number;
}

/** An entity's attack capability — its AttackProfile. Enemies receive theirs from their archetype. */
export interface AttackData {
  profile: AttackProfile;
}

/**
 * Marks which archetype an enemy is and carries the per-enemy data the Enemy AI feature reads (movement
 * tiles/turn and behaviour tags). Base stats are materialised onto Health/CombatStats/Attack at spawn;
 * this keeps the archetype identity addressable for AI and debugging.
 */
export interface ArchetypeData {
  defId: string;
  movement: number;
  tags: BehaviorTag[];
}

export const Health: ComponentType<HealthData> = defineComponent<HealthData>('Health');
export const CombatStats: ComponentType<CombatStatsData> = defineComponent<CombatStatsData>('CombatStats');
export const Attack: ComponentType<AttackData> = defineComponent<AttackData>('Attack');
export const Archetype: ComponentType<ArchetypeData> = defineComponent<ArchetypeData>('Archetype');
