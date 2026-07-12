import type { World } from '../ecs/world';
import type { EntityId } from '../ecs/entity';
import type { Hex } from '../hex/hex';
import { Enemy } from '../actors';
import { HexPosition } from '../hex/movement';
import type { EnemyDef } from './types';
import { Health, CombatStats, Attack, Archetype, Shield, AttackCooldowns } from './components';

/**
 * Spawn an enemy of `def` onto `hex`, assembling the definition as an ECS component bundle (ADR-007: data-
 * driven, not a subclass): the Enemy marker (+ its roster art), position, Health at full, armour, the
 * definition's attacks, and the definition identity/movement. Returns the new entity.
 *
 * PLACEMENT — which enemies, how many, and where — is the Level Progression feature's job (its enemy
 * budget + reachable layout). This factory is the seam that feature calls; it does not decide placement.
 */
export function spawnEnemy(world: World, def: EnemyDef, hex: Hex): EntityId {
  const e = world.createEntity();
  world.store(Enemy).add(e, { isEnemy: true, art: def.spriteKey });
  world.store(HexPosition).add(e, { hex });
  world.store(Health).add(e, { hp: def.maxHp, maxHp: def.maxHp });
  world.store(CombatStats).add(e, {
    armor: def.armor,
    baseArmor: def.armor, // enemies never equip, so total armour == intrinsic armour
    ...(def.selfShield !== undefined ? { selfShield: def.selfShield } : {}),
  });
  world.store(Attack).add(e, { profiles: [...def.attacks] });
  // Every attack available at spawn; the enemy-turn system ticks these down and sets a profile's cooldown
  // when it telegraphs that attack (Enemy Attack Patterns). Parallel to Attack.profiles.
  world.store(AttackCooldowns).add(e, { remaining: def.attacks.map(() => 0) });
  world.store(Archetype).add(e, { defId: def.id, movement: def.movement });
  // Starts the round unshielded; gains its selfShield on its own turn (and is wiped each player turn).
  world.store(Shield).add(e, { shield: 0 });
  return e;
}
