import type { System, World } from '../ecs/world';
import type { EntityId } from '../ecs/entity';
import { type Hex, hexEquals } from '../hex/hex';
import type { HexGrid } from '../hex/grid';
import { HexPosition } from '../hex/movement';
import { hexesWithinRange } from '../hex/range';
import { Enemy } from '../actors';
import { Health, applyHeal, resolveCardAttack } from '../combat';
import { spellDef } from '../cards/content';

/**
 * The spell system (Core Gaps: spell effects). Registered AFTER the card system, it reacts to the turn
 * engine's SpellCast event — now carrying the aimed `targets` — and lands the cast spell's mechanical effect
 * (SpellDef.effect). Spells live in their OWN module so the cards/deck module keeps its no-import-of-combat
 * seam; this module legitimately uses combat primitives directly:
 *   - Attack:        damage every enemy on the aimed hex(es) through the deterministic combat resolver. For an
 *                    areaOfEffect spell the disk is re-expanded from the recorded centre (the cast records only
 *                    the centre hex), matching what the targeting UI tinted.
 *   - Heal:          restore the caster's HP, clamped to maxHp.
 *   - TeleportEnemy: move the living enemy on the first aimed hex to the second, when that hex is free.
 * Snapshot this step's events first (same discipline as the card / combat systems) so an effect we emit
 * (DamageDealt / AttackResolved / Healed) is never reprocessed.
 */
export function makeSpellSystem(grid: HexGrid): System {
  return (world) => {
    for (const ev of [...world.events()]) {
      if (ev.kind !== 'SpellCast' || ev.spellId === undefined) continue;
      const def = spellDef(ev.spellId);
      const effect = def?.effect;
      if (def === undefined || effect === undefined) continue;
      const caster = ev.entity;
      const targets = ev.targets ?? [];
      switch (effect.kind) {
        case 'Attack': {
          // An area spell records only its centre hex; re-expand the disk so every in-radius hex is hit (the
          // resolver no-ops on hexes with no enemy). A non-area spell hits exactly its recorded target hex(es).
          const hexes =
            def.target.kind === 'areaOfEffect' && targets[0] !== undefined
              ? hexesWithinRange(targets[0], def.target.radius)
              : targets;
          resolveCardAttack(world, caster, hexes, effect.damage, effect.pierce ?? 0, ev.spellId);
          break;
        }
        case 'Heal': {
          applyHeal(world, caster, effect.amount);
          break;
        }
        case 'TeleportEnemy': {
          teleportEnemy(world, grid, targets[0], targets[1]);
          break;
        }
      }
    }
  };
}

/** The living enemy (Enemy marker + Health — a disguised mimic has no Health) standing on `hex`, if any. */
function livingEnemyAt(world: World, hex: Hex): EntityId | undefined {
  for (const enemy of world.entitiesWith(Enemy)) {
    if (world.store(Health).get(enemy) === undefined) continue; // not a combat target (e.g. disguised mimic)
    const pos = world.store(HexPosition).get(enemy);
    if (pos !== undefined && hexEquals(pos.hex, hex)) return enemy;
  }
  return undefined;
}

/** True when any entity with a HexPosition stands on `hex` (the player or any enemy). */
function isOccupied(world: World, hex: Hex): boolean {
  for (const e of world.entitiesWith(HexPosition)) {
    if (hexEquals(world.store(HexPosition).get(e)!.hex, hex)) return true;
  }
  return false;
}

/**
 * Teleport the living enemy on `from` to `to`. Fizzles (no-op) when there is no living enemy at `from`, or
 * `to` is not a valid landing hex — out of bounds, movement-blocked, or already occupied by another actor —
 * or either hex is missing. A discrete reposition: it sets HexPosition directly (no path), so the renderer
 * snaps the sprite to the new hex next frame, reading the committed position.
 */
function teleportEnemy(world: World, grid: HexGrid, from: Hex | undefined, to: Hex | undefined): void {
  if (from === undefined || to === undefined) return;
  const enemy = livingEnemyAt(world, from);
  if (enemy === undefined) return;
  if (!grid.isWalkable(to) || isOccupied(world, to)) return; // fizzle: not a free landing hex
  world.store(HexPosition).get(enemy)!.hex = to;
}
