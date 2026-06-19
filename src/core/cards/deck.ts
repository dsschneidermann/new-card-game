import { defineComponent, type ComponentType } from '../ecs/component';

/**
 * The player's deck and current hand (feature 09), persisted as ECS state
 * (feature 06): the collection is a multiset of card ids; the hand is the ids
 * drawn for the current turn.
 */
export interface DeckStateData {
  collection: string[]; // card ids owned (duplicates = copies)
  hand: string[]; // card ids in hand this turn
}

export const DeckState: ComponentType<DeckStateData> = defineComponent<DeckStateData>('DeckState');

/**
 * Draw a fresh hand of `n` card ids from the collection. Deterministic for now
 * (the first n); shuffle/discard with the seeded RNG is deferred to feature 12.
 */
export function drawHand(collection: readonly string[], n: number): string[] {
  return collection.slice(0, Math.max(0, n));
}
