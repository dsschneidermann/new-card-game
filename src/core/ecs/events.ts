import type { EntityId } from './entity';

/**
 * Domain events emitted by systems during a step and drained at the end for
 * rendering/replay (decision Q2: events are an output log). Features extend
 * this union with their own event kinds.
 */
export type GameEvent =
  | { kind: 'CardPlayed'; entity: EntityId; cardId: string }
  | { kind: 'DamageDealt'; target: EntityId; amount: number }
  | { kind: 'EntityDied'; entity: EntityId }
  | { kind: 'EntityStepped'; entity: EntityId; q: number; r: number };
