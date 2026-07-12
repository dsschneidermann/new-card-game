import {
  Enemy,
  Health,
  Shield,
  CombatStats,
  Archetype,
  Attack,
  PlannedAttack,
  ARCHETYPES,
  HexPosition,
  hexEquals,
  type World,
  type EntityId,
  type Hex,
} from '@core/index';

/**
 * Pure, Phaser-free derivation of an enemy's hover "inspect card" data from world component state — the
 * render-side counterpart to buildCharacterViews (Enemy Hover Card feature). The Phaser drawing lives in
 * enemyCard.ts; keeping the data extraction here makes it unit-testable without a Phaser/DOM harness
 * (ADR-002/003). Reads only already-shipped combat components (ADR-007); no new state, no mutation.
 */

/** The fields the enemy inspect card shows, derived from the shared combat components. */
export interface EnemyCardData {
  /** Display name from the roster (ARCHETYPES), falling back to the raw defId, then a generic 'Enemy'. */
  readonly name: string;
  /** Current hit points (Health.hp). */
  readonly hp: number;
  /** Maximum hit points (Health.maxHp). */
  readonly maxHp: number;
  /** Current Shield pool (Defense & Shielding) — 0 when the enemy carries none. */
  readonly shield: number;
  /** Total flat damage reduction the resolver reads (CombatStats.armor) — 0 when absent. */
  readonly armor: number;
  /** The name of the attack this enemy is currently telegraphing (its PlannedAttack profile's name), or
   *  null when it has no active telegraph — so the player can tie the red pattern to a name and learn it. */
  readonly attackName: string | null;
  /** The enemy's idle-sheet texture key (`${Enemy.art}.idle`), drawn as the card portrait. */
  readonly portraitTexture: string;
}

/**
 * Derive the inspect-card data for `entity`, or null when it is not an inspectable enemy. An entity is
 * inspectable only if it carries BOTH the Enemy marker and a Health component — i.e. a living combat
 * enemy. This single gate excludes a disguised mimic (an Enemy with no Health, so its disguise is not
 * spoiled) and the player (no Enemy marker). The name resolves through the ARCHETYPES roster by the
 * entity's Archetype.defId, degrading to the raw defId and then 'Enemy' if either is missing.
 */
export function enemyCardData(world: World, entity: EntityId): EnemyCardData | null {
  const enemy = world.store(Enemy).get(entity);
  const health = world.store(Health).get(entity);
  if (enemy === undefined || health === undefined) return null;
  const defId = world.store(Archetype).get(entity)?.defId;
  const name = (defId !== undefined ? ARCHETYPES[defId]?.name : undefined) ?? defId ?? 'Enemy';
  // The currently-telegraphed attack's name (Enemy Attack Patterns): PlannedAttack.attackIndex into the
  // enemy's Attack.profiles. Null when the enemy has no active telegraph (e.g. just spawned, or defeated).
  const plan = world.store(PlannedAttack).get(entity);
  const attackName =
    plan !== undefined ? (world.store(Attack).get(entity)?.profiles[plan.attackIndex]?.name ?? null) : null;
  return {
    name,
    hp: health.hp,
    maxHp: health.maxHp,
    shield: world.store(Shield).get(entity)?.shield ?? 0,
    armor: world.store(CombatStats).get(entity)?.armor ?? 0,
    attackName,
    portraitTexture: `${enemy.art}.idle`,
  };
}

/**
 * The inspectable enemy standing on `hex` as card data, else null — the hover hit-test. Scans the Enemy
 * entities for one whose HexPosition matches and whose enemyCardData is non-null (a no-Health enemy on
 * the hex, e.g. a disguised mimic, is skipped). Mirrors the private enemyAt in combat.ts, but lives in
 * the render layer because choosing what to inspect is a presentation concern, not a combat rule.
 */
export function enemyCardAt(world: World, hex: Hex): EnemyCardData | null {
  for (const entity of world.entitiesWith(Enemy)) {
    const pos = world.store(HexPosition).get(entity);
    if (pos === undefined || !hexEquals(pos.hex, hex)) continue;
    const data = enemyCardData(world, entity);
    if (data !== null) return data;
  }
  return null;
}
