/** Turn Engine: phases, resource economy and the enemy-turn runner (feature 07). */
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
export type { TurnHooks, Validation } from './system';
export { makeTurnSystem, turnActor, canMove, canPlayCard, canPlaySpell } from './system';
