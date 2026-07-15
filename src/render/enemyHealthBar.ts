import {
  Enemy,
  Health,
  Shield,
  HexPosition,
  hexEquals,
  type World,
  type EntityId,
  type Hex,
} from '@core/index';

/**
 * Pure, Phaser-free derivation of an enemy's foot health-bar from world component state — the render-side
 * counterpart to buildCharacterViews, a sibling of enemyCardData (Enemy Health Bars feature). The Phaser
 * drawing lives in EnemyHealthBars.ts; keeping the visibility gate + the derived values here makes them
 * unit-testable without a Phaser/DOM harness (ADR-002/003). Reads only already-shipped combat components
 * (ADR-007) — no new state, no mutation, no save change.
 */

/** The values one enemy's foot health bar draws from: current/max HP and the current Shield pool. */
export interface EnemyHealthBarView {
  /** Current hit points (Health.hp) — the green fill's extent. */
  readonly hp: number;
  /** Maximum hit points (Health.maxHp) — the bar's full width and the 10-HP tick scale. */
  readonly maxHp: number;
  /** Current Shield pool (Defense & Shielding); 0 when the enemy carries none — drives the blue outline. */
  readonly shield: number;
}

/**
 * Derive the foot health-bar view for `entity`, or null when no bar should show. A bar shows only for a
 * living enemy — one carrying BOTH the Enemy marker and a Health component, the same inspectable gate the
 * hover card uses, so the player (no Enemy marker) and a disguised mimic (Enemy, no Health) are excluded —
 * AND only when the enemy has taken damage (hp < maxHp) OR is the currently-hovered enemy (its HexPosition
 * equals hoveredHex). A full-HP, un-hovered enemy returns null. `hoveredHex` is the board hex under the
 * pointer, or null when nothing on the board is hovered.
 */
export function enemyHealthBarData(
  world: World,
  entity: EntityId,
  hoveredHex: Hex | null,
): EnemyHealthBarView | null {
  const enemy = world.store(Enemy).get(entity);
  const health = world.store(Health).get(entity);
  if (enemy === undefined || health === undefined) return null;
  const pos = world.store(HexPosition).get(entity);
  const hovered = hoveredHex !== null && pos !== undefined && hexEquals(pos.hex, hoveredHex);
  const damaged = health.hp < health.maxHp;
  if (!damaged && !hovered) return null;
  return {
    hp: health.hp,
    maxHp: health.maxHp,
    shield: world.store(Shield).get(entity)?.shield ?? 0,
  };
}

/**
 * The interior HP values at which the bar draws a 10-point indicator line: every multiple of 10 strictly
 * between 0 and maxHp (the maxHp end is the bar's edge, so it carries no interior tick). e.g. 45 -> [10,20,
 * 30,40]; 30 -> [10,20]; 10 -> []; 8 -> []. The drawer places each at value/maxHp along the fixed-width bar.
 */
export function healthBarTicks(maxHp: number): number[] {
  const ticks: number[] = [];
  for (let value = 10; value < maxHp; value += 10) ticks.push(value);
  return ticks;
}
