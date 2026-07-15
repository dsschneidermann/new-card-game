import { defineComponent, type ComponentType } from './ecs/component';
import type { EntityId } from './ecs/entity';
import type { World } from './ecs/world';
import { hexEquals, type Hex } from './hex/hex';
import { HexPosition } from './hex/movement';
import { Enemy } from './actors';
import { ARCHETYPES } from './combat/archetypes';
import { materializeCombat } from './combat/spawn';

/**
 * Mimic enemies (Chest Rewards feature): a monster that DISGUISES itself as a closed chest on the map and
 * only REVEALS when the player approaches it like a chest. A disguised mimic is a HOLLOW Enemy — the marker
 * (art 'enemy_mimic_1') + a HexPosition + a Mimic component, but no Health or attacks — so while `revealed`
 * is false it reads exactly as the chest it imitates: drawn as the static chest-disguise frame, a valid
 * chest-style interact target, no health bar, and not a movement wall. Approaching it wakes it (the interact
 * system flips `revealed` and emits MimicRevealed): revealMimic MATERIALISES the 'mimic' archetype's combat
 * bundle (Health, armour, attacks, cooldowns, movement, shield) onto the same entity, so from that turn on
 * the woken mimic is a full enemy — it takes enemy turns, blocks the player's movement, and is a damageable
 * target. Pure and Phaser-free (ADR-002): the data + the wake mutation live here; the scene only swaps the
 * sprite on the event.
 */
export interface MimicData {
  /** Once revealed (approached), the mimic shows its monster animation and is no longer an interact target. */
  revealed?: boolean;
}
export const Mimic: ComponentType<MimicData> = defineComponent<MimicData>('Mimic');

/** The roster art base for the mimic enemy (the renderer draws `${MIMIC_ART}.unopened` disguised, `${MIMIC_ART}.idle` revealed). */
export const MIMIC_ART = 'enemy_mimic_1';

/**
 * Spawn a disguised mimic at `hex`: an Enemy carrying a Mimic component (revealed unset = disguised) +
 * HexPosition, but NO combat components — the Enemy marker is present from the start, while the combat/AI
 * bundle (Health, attacks, …) is added only when it wakes (revealMimic). Returns the mimic entity id. The
 * renderer draws it as the closed-chest disguise until it is revealed.
 */
export function spawnMimic(world: World, hex: Hex): EntityId {
  const mimic = world.createEntity();
  world.store(Enemy).add(mimic, { isEnemy: true, art: MIMIC_ART });
  world.store(Mimic).add(mimic, {});
  world.store(HexPosition).add(mimic, { hex });
  return mimic;
}

/**
 * The DISGUISED (un-revealed) mimic standing EXACTLY on `hex`, or undefined if none. A revealed mimic is a
 * plain enemy and not an interact target, so it is skipped. This is the mimic the player can "open" by
 * targeting `hex` with a move — the chest-style interact that wakes it (interactTargetAt pairs it with
 * unopenedChestAt so a chest and a disguised mimic are targeted identically).
 */
export function disguisedMimicAt(world: World, hex: Hex): EntityId | undefined {
  for (const [mimic, data] of world.store(Mimic).entries()) {
    if (data.revealed === true) continue;
    const at = world.store(HexPosition).get(mimic);
    if (at !== undefined && hexEquals(at.hex, hex)) return mimic;
  }
  return undefined;
}

/**
 * Wake a mimic from its disguise into a full enemy. Flips `revealed` (the renderer swaps to the idle-monster
 * animation) and MATERIALISES the 'mimic' archetype's combat bundle — Health, armour, attacks, cooldowns,
 * movement, shield — onto the SAME entity via the shared spawnEnemy assembler. Until now the mimic was a
 * hollow Enemy (marker + position only), which is exactly why it read as the chest it imitated: with no
 * Health it took no enemy turn, never blocked the player's movement, and could not be attacked. After this
 * it behaves like any spawned enemy. Idempotent: a no-op when the entity is not a mimic or is already
 * revealed, so a second wake never re-rolls it back to full HP.
 */
export function revealMimic(world: World, mimic: EntityId): void {
  const data = world.store(Mimic).get(mimic);
  if (data === undefined || data.revealed === true) return;
  data.revealed = true;
  materializeCombat(world, mimic, ARCHETYPES.mimic!);
}
