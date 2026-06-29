import { defineComponent, type ComponentType } from '../ecs/component';
import type { AttackProfile } from './types';

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
 * Defensive combat stats. `armor` is the entity's TOTAL flat damage reduction with a min-1 floor (ADR-007)
 * — the value the resolver reads. `baseArmor` is its intrinsic armour BEFORE equipment; the player's
 * total is recomputed as baseArmor + the armour of every equipped item whenever gear changes (see
 * recomputeArmor), so `armor` is always derived from the live loadout rather than an accumulated delta.
 * For an entity that never equips (every enemy), armor == baseArmor. `selfShield` is the amount of Shield
 * an entity grants ITSELF at the start of each of its own turns — an enemy ability (Defense & Shielding);
 * absent/0 for the player and for enemies with no self-shield.
 */
export interface CombatStatsData {
  armor: number;
  baseArmor: number;
  selfShield?: number;
}

/**
 * A defender's current Shield: a temporary absorb pool that soaks damage BEFORE HP (ADR-008), then is
 * spent down by what it absorbs. The player gains it from Defend (and it resets at the start of each
 * player turn); enemies grant it to themselves each enemy turn (and it resets at the end of the player
 * turn). Shared by player and enemies so the one resolver consumes it for both. Persistent: shield in
 * flight must survive save/resume mid-round.
 */
export interface ShieldData {
  shield: number;
}

/** An entity's attacks — one or more AttackProfiles. The Enemy AI selects which to use; resolveAttack
 *  takes the chosen index. Enemies receive theirs from their definition. */
export interface AttackData {
  profiles: AttackProfile[];
}

/**
 * Records which roster definition an enemy is and its movement (tiles/turn), both read by the Enemy AI
 * feature. Base stats are materialised onto Health/CombatStats/Attack at spawn; this keeps the definition
 * identity addressable for AI and debugging.
 */
export interface ArchetypeData {
  defId: string;
  movement: number;
}

export const Health: ComponentType<HealthData> = defineComponent<HealthData>('Health');
export const CombatStats: ComponentType<CombatStatsData> = defineComponent<CombatStatsData>('CombatStats');
export const Attack: ComponentType<AttackData> = defineComponent<AttackData>('Attack');
export const Archetype: ComponentType<ArchetypeData> = defineComponent<ArchetypeData>('Archetype');
export const Shield: ComponentType<ShieldData> = defineComponent<ShieldData>('Shield');
