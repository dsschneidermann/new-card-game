import { defineComponent, type ComponentType } from './ecs/component';

/**
 * Marker tagging the player-controlled entity (persisted — feature 06). After a
 * save is restored the player has no privileged id, so the scene locates it with
 * `world.entitiesWith(Player)[0]`. Later actor data (stats, deck, …) attaches to
 * this same entity as those features land.
 */
export interface PlayerData {
  readonly isPlayer: true;
}

export const Player: ComponentType<PlayerData> = defineComponent<PlayerData>('Player');

/**
 * Marker tagging an enemy-controlled entity (persisted). The Turn Engine's
 * EnemyTurnRunner iterates entitiesWith(Enemy); feature 09 attaches archetype
 * data and feature 12 the AI behavior to these entities.
 */
export interface EnemyData {
  readonly isEnemy: true;
  /** Roster art key base, e.g. 'enemy_orc_warrior_brown' (derived from the manifest's enemy_<name>.idle
   *  keys: base = key minus '.idle'). The scene renders `${art}.idle` and animates `${art}.<state>.right`.
   *  Persisted so resume restores each enemy's art. */
  readonly art: string;
}

export const Enemy: ComponentType<EnemyData> = defineComponent<EnemyData>('Enemy');
