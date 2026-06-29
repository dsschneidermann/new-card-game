/**
 * Combat & enemy-archetype data (ADR-007). Pure value types, Phaser-free (ADR-002): the archetype
 * catalogue, the attack profile, and the damage-result breakdown all live here so combat math and
 * targeting are unit-testable against fixed inputs.
 */

/** Behaviour tags an archetype carries; the Enemy AI feature selects per-enemy behaviour from these. */
export type BehaviorTag = 'melee' | 'ranged' | 'armored' | 'spellcaster' | 'support';

/**
 * How an attacker chooses among the targets it can reach (ADR-007). 'highestThreat' is a placeholder
 * until threat is modelled by the Enemy AI feature; selectTarget currently treats it as 'nearest'.
 */
export type TargetRule = 'nearest' | 'lowestHp' | 'highestThreat';

/** An attack's reach and effect (ADR-007). Ranges are measured in hex tiles (ADR-006). */
export interface AttackProfile {
  readonly minRange: number;
  readonly maxRange: number;
  readonly requiresLineOfSight: boolean;
  readonly targetRule: TargetRule;
  readonly baseDamage: number;
  /** Armour ignored before the min-1 floor (ADR-007). Absent means 0. */
  readonly pierce?: number;
}

/**
 * A data-driven enemy archetype: a bundle of stats plus behaviour tags, NOT a subclass (ADR-007). Stat
 * lines are data, so balance tuning needs no code change. spawnEnemy materialises a def into components.
 */
export interface EnemyDef {
  readonly id: string;
  /** Logical art base (ADR-004); the renderer draws `${spriteKey}.idle`. Placeholder until real art lands. */
  readonly spriteKey: string;
  readonly maxHp: number;
  /** Flat damage reduction (ADR-007). */
  readonly armor: number;
  /** Tiles the enemy may move per turn (read by the Enemy AI feature). */
  readonly movement: number;
  readonly attack: AttackProfile;
  readonly tags: readonly BehaviorTag[];
}

/** The breakdown of one resolved hit, returned by computeDamage and resolveAttack. */
export interface DamageResult {
  /** baseDamage after (pierced) armour, floored at 1 — what the hit would do to an unshielded target. */
  readonly afterArmor: number;
  /** How much of afterArmor the defender's shield soaked (0 until status effects land, ADR-008). */
  readonly shieldAbsorbed: number;
  /** HP actually lost: afterArmor minus shieldAbsorbed. */
  readonly hpLost: number;
}
