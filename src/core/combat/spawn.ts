import type { World } from '../ecs/world';
import type { EntityId } from '../ecs/entity';
import type { Hex } from '../hex/hex';
import { Enemy } from '../actors';
import { HexPosition } from '../hex/movement';
import type { EnemyDef } from './types';
import { Health, CombatStats, Attack, Archetype } from './components';

/**
 * Spawn an enemy of `def` onto `hex`, assembling the archetype as an ECS component bundle (ADR-007: data-
 * driven, not a subclass): the Enemy marker (+ art), position, Health at full, armour, attack, and the
 * archetype identity/movement/tags. Returns the new entity.
 *
 * PLACEMENT — which archetypes, how many, and where — is the Level Progression feature's job (its enemy
 * budget + reachable layout). This factory is the seam that feature calls; it does not decide placement.
 */
export function spawnEnemy(world: World, def: EnemyDef, hex: Hex): EntityId {
  const e = world.createEntity();
  world.store(Enemy).add(e, { isEnemy: true, art: def.spriteKey });
  world.store(HexPosition).add(e, { hex });
  world.store(Health).add(e, { hp: def.maxHp, maxHp: def.maxHp });
  world.store(CombatStats).add(e, { armor: def.armor });
  world.store(Attack).add(e, { profile: def.attack });
  world.store(Archetype).add(e, { defId: def.id, movement: def.movement, tags: [...def.tags] });
  return e;
}
