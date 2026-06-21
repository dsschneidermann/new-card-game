import type { EntityId } from './entity';

/**
 * Domain events emitted by systems during a step and drained at the end for
 * rendering/replay (decision Q2: events are an output log). Features extend
 * this union with their own event kinds.
 */
export type GameEvent =
  // cardEntity (when present) is the played card-instance entity, echoed from the PlayCard command
  // so the card system can move it to the discard pile + resolve its effect, and the renderer can
  // animate that exact card out of the hand. cardTargets (when present) are picked card instances
  // echoed for the effect (e.g. Recall's chosen discard card).
  | { kind: 'CardPlayed'; entity: EntityId; cardId: string; cardEntity?: EntityId; cardTargets?: readonly EntityId[] }
  | { kind: 'SpellCast'; entity: EntityId; spellId?: string }
  | { kind: 'DamageDealt'; target: EntityId; amount: number }
  | { kind: 'EntityDied'; entity: EntityId }
  | { kind: 'EntityStepped'; entity: EntityId; q: number; r: number }
  // Card system (Card Entities, Deck Cycle & Stat Effects). HandDealt: the whole hand was replaced at
  // turn start (old hand discarded, fresh hand drawn) -> the scene discards every card and deals the
  // new hand in. HandDrawn: an effect drew a card or changed a cost mid-turn -> the scene refreshes
  // the fan incrementally. CardDiscarded: a single card left the hand for the discard pile (a play)
  // -> the scene animates that instance out.
  | { kind: 'HandDealt'; entity: EntityId }
  | { kind: 'HandDrawn'; entity: EntityId }
  | { kind: 'CardDiscarded'; entity: EntityId; instance: EntityId; defId: string }
  // Turn engine (feature 07). Phase is the literal 'player' | 'enemy' (kept inline
  // so events.ts has no dependency on the turn module).
  | { kind: 'RoundStarted'; round: number }
  | { kind: 'TurnStarted'; phase: 'player' | 'enemy'; actor?: EntityId }
  | { kind: 'TurnEnded'; phase: 'player' | 'enemy' }
  | { kind: 'ResourceChanged'; entity: EntityId }
  | { kind: 'ActionRejected'; reason: string };
