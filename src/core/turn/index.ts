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
} from './resources';
export type { Validation } from './system';
export { makeTurnSystem, turnActor, canMove, canPlayCard, canPlaySpell } from './system';
