import type { EntityId } from './entity';

/**
 * Domain events emitted by systems during a step and drained at the end for
 * rendering/replay (decision Q2: events are an output log). Features extend
 * this union with their own event kinds.
 */
export type GameEvent =
  // handIndex (when present) is the hand slot the played card left, echoed from the PlayCard
  // command so the renderer can animate that exact card out of the hand.
  | { kind: 'CardPlayed'; entity: EntityId; cardId: string; handIndex?: number }
  | { kind: 'SpellCast'; entity: EntityId; spellId?: string }
  | { kind: 'DamageDealt'; target: EntityId; amount: number }
  | { kind: 'EntityDied'; entity: EntityId }
  | { kind: 'EntityStepped'; entity: EntityId; q: number; r: number }
  // Turn engine (feature 07). Phase is the literal 'player' | 'enemy' (kept inline
  // so events.ts has no dependency on the turn module).
  | { kind: 'RoundStarted'; round: number }
  | { kind: 'TurnStarted'; phase: 'player' | 'enemy'; actor?: EntityId }
  | { kind: 'TurnEnded'; phase: 'player' | 'enemy' }
  | { kind: 'ResourceChanged'; entity: EntityId }
  | { kind: 'ActionRejected'; reason: string };
