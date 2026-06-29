import { defineComponent, type ComponentType } from '../ecs/component';
import type { Hex } from '../hex/hex';

/**
 * A locked enemy TELEGRAPH (Enemy AI: Movement & Telegraphed Attacks). When an enemy plans an attack on
 * its turn it writes this onto itself instead of resolving immediately: `attackIndex` is the chosen
 * AttackProfile (into the enemy's Attack.profiles) and `hexes` are the FIXED target tiles the attack will
 * strike at the END of the next player turn (Into-the-Breach). The hexes do not re-aim — the player counters
 * by leaving them, raising Shield, or killing the attacker (which removes this with the entity). Persistent
 * (the default) so a telegraph survives save/resume mid-puzzle; SAVE_VERSION is bumped when this lands.
 */
export interface PlannedAttackData {
  attackIndex: number;
  hexes: Hex[];
}

export const PlannedAttack: ComponentType<PlannedAttackData> =
  defineComponent<PlannedAttackData>('PlannedAttack');
