import type { EntityId } from './entity';
import type { Hex } from '../hex/hex';

/**
 * Cross-cutting intents submitted by scenes and AI and consumed by systems.
 * Gameplay features extend this union with their own command kinds.
 */
export type Command =
  // Low-level authorized move executed by the feature-05 movement system.
  | { kind: 'MoveTo'; entity: EntityId; q: number; r: number }
  // Player move INTENT: the turn engine validates it (phase + budget + reachability)
  // and, if legal, submits the MoveTo above (feature 07).
  | { kind: 'RequestMove'; entity: EntityId; q: number; r: number }
  // energyCost/manaCost are supplied by the caller until card/spell definitions resolve
  // them; the turn engine spends them. `targets` are the aimed hex(es) recorded for when
  // effects land (the selected hex, both picks for a two-step, none for a self-target).
  // `handIndex` is the hand slot of the played copy: the turn engine removes that slot from
  // DeckState.hand when the play is accepted (omit it for a non-hand play, e.g. AI/effects).
  | { kind: 'PlayCard'; entity: EntityId; cardId: string; energyCost?: number; target?: EntityId; targets?: readonly Hex[]; handIndex?: number }
  | { kind: 'PlaySpell'; entity: EntityId; spellId: string; manaCost?: number; target?: EntityId; targets?: readonly Hex[] }
  | { kind: 'EndTurn'; entity: EntityId };
