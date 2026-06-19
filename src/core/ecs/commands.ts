import type { EntityId } from './entity';

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
  // energyCost/manaCost are supplied by the caller until feature 10 resolves them
  // from the card/spell definition; the turn engine spends them.
  | { kind: 'PlayCard'; entity: EntityId; cardId: string; energyCost?: number; target?: EntityId }
  | { kind: 'PlaySpell'; entity: EntityId; spellId: string; manaCost?: number; target?: EntityId }
  | { kind: 'EndTurn'; entity: EntityId };
