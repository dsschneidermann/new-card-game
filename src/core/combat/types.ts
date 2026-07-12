/**
 * Combat & enemy-definition data (ADR-007). Pure value types, Phaser-free (ADR-002): the enemy roster,
 * the attack profile, and the damage-result breakdown all live here so combat math and targeting are
 * unit-testable against fixed inputs.
 */

/**
 * The SHAPE a telegraphed attack threatens, expanded from the attacker toward the aim hex by
 * attackPatternHexes (Enemy Attack Patterns). `kind` picks the shape; `size` is the line length in hexes
 * (line) or the blast radius (blast), ignored by single. A bigger pattern only ADDS threatened tiles — the
 * aim hex is always covered — so patterns extend reach and force the player to dodge more than one tile.
 */
export type AttackPatternKind = 'single' | 'line' | 'blast';
export interface AttackPattern {
  readonly kind: AttackPatternKind;
  /** Line length in hexes (default 2) or blast radius (default 1); ignored by 'single'. */
  readonly size?: number;
}

/** A single named attack an entity can make (ADR-007). Ranges are measured in hex tiles (ADR-006). */
export interface AttackProfile {
  /** Identifies the attack (e.g. 'bite', 'fire_breath') — carried on AttackResolved so the scene can
   *  animate the specific attack, shown on the enemy inspect card, and useful for logs/balancing. */
  readonly name: string;
  readonly minRange: number;
  readonly maxRange: number;
  readonly requiresLineOfSight: boolean;
  readonly baseDamage: number;
  /** Armour ignored before the min-1 floor (ADR-007). Absent means 0. */
  readonly pierce?: number;
  /** The multi-hex shape this attack threatens (Enemy Attack Patterns). Absent means a single-hex strike
   *  (the aim hex only) — back-compatible with pre-pattern profiles. */
  readonly pattern?: AttackPattern;
  /** Minimum number of enemy turns between successive USES of this attack (2 = at most every other turn).
   *  Absent/0 means no limit — the reliable basic. The Enemy AI will not re-select this attack until its
   *  per-enemy AttackCooldowns counter ticks back to 0. Larger patterns / stronger strikes carry this. */
  readonly cooldown?: number;
}

/**
 * A concrete enemy definition: base stats plus one or more attacks, tied to a roster sprite (ADR-007). A
 * data-driven bundle materialised onto components by spawnEnemy — not a subclass. The roster holds many
 * such definitions with different stats; balance numbers are data, so tuning needs no code change.
 */
export interface EnemyDef {
  readonly id: string;
  /** Display name (e.g. 'Lava Golem'). */
  readonly name: string;
  /** Roster art base, e.g. 'enemy_goblin_1' — the renderer draws `${spriteKey}.idle` and animates states. */
  readonly spriteKey: string;
  readonly maxHp: number;
  /** Flat damage reduction (ADR-007). */
  readonly armor: number;
  /** Tiles the enemy may move per turn (read by the Enemy AI feature). */
  readonly movement: number;
  /** Shield this enemy grants itself at the start of each of its own turns (Defense & Shielding). Absent
   *  means it has no self-shield ability. The whole pool is wiped at the end of each player turn first. */
  readonly selfShield?: number;
  /** One or more attacks; the Enemy AI picks which to use against a target by range/LOS. */
  readonly attacks: readonly AttackProfile[];
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
