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
  // energyCost/manaCost are the EFFECTIVE cost the caller computed (base + per-instance modifiers);
  // the turn engine spends it. `targets` are the aimed hex(es) recorded for when effects land (the
  // selected hex, both picks for a two-step, the in-bounds burst for a self-AOE, none for a plain
  // self-target). `faceToward` (attack cards) is the hex the attack was aimed at — the target hex,
  // or the clicked hex for a self-AOE — used to turn the player to face the attack. `cardEntity` is
  // the played card-instance entity: on an accepted play the card system moves it to the discard
  // pile and resolves its effect (omit it for a non-hand play, e.g. AI/effects). `cardTargets` are
  // picked CARD instances (e.g. the discard card chosen for Recall) that the card's effect resolves.
  | { kind: 'PlayCard'; entity: EntityId; cardId: string; energyCost?: number; target?: EntityId; targets?: readonly Hex[]; cardEntity?: EntityId; faceToward?: Hex; cardTargets?: readonly EntityId[] }
  | { kind: 'PlaySpell'; entity: EntityId; spellId: string; manaCost?: number; target?: EntityId; targets?: readonly Hex[] }
  // Chest Interaction Core System: a zero-cost INTERACT submitted by the scene when the player TARGETS an
  // unopened chest. The chest system (registered first) computes the stop hex — the tile before the chest,
  // since the chest's own last step is free — submits the RequestMove the turn engine validates, and tracks
  // arrival; a chest never blocks movement and is never a normal stand-on destination.
  | { kind: 'RequestChestInteract'; entity: EntityId; chest: EntityId }
  // The player picked one of the chest's three offered cards: the chest system applies takeChestCard
  // (chosen -> owner's discard, the two unchosen destroyed, chest marked opened) and emits ChestOpened.
  | { kind: 'TakeChestCard'; entity: EntityId; chest: EntityId; chosen: EntityId }
  | { kind: 'EndTurn'; entity: EntityId };
