/** Turn Engine: phases, resource economy and the enemy-turn runner. */
export type { Phase, TurnStateData, ResourcePoolData, MovementBudgetData } from './components';
export { TurnState, ResourcePool, MovementBudget } from './components';
export {
  refillEnergy,
  regenMana,
  spendEnergy,
  spendMana,
  canAffordEnergy,
  canAffordMana,
  PLAYER_BASE_ENERGY_MAX,
  PLAYER_BASE_MANA_MAX,
  PLAYER_BASE_MANA_REGEN,
  PLAYER_BASE_MOVEMENT,
} from './resources';
export type { Validation } from './system';
export { makeTurnSystem, turnActor, canMove, canPlayCard, canPlaySpell } from './system';
