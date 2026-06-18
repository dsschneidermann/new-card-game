import type { EntityId } from './entity';

/**
 * Cross-cutting intents submitted by scenes and AI and consumed by systems.
 * Gameplay features extend this union with their own command kinds.
 */
export type Command =
  | { kind: 'MoveTo'; entity: EntityId; x: number; y: number }
  | { kind: 'PlayCard'; entity: EntityId; cardId: string; target?: EntityId }
  | { kind: 'PlaySpell'; entity: EntityId; spellId: string; target?: EntityId }
  | { kind: 'EndTurn'; entity: EntityId };
