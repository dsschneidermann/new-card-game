import { defineComponent, type ComponentType } from '../ecs/component';
import type { SeededRNG } from '../ecs/rng';

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
 * Draw a fresh random hand of `n` card ids from the collection, WITHOUT
 * replacement (n distinct slots of the multiset), using the seeded RNG so it is
 * reproducible for a given seed. A full draw/discard pile + reshuffle is still
 * deferred to feature 12; this is a simple per-turn random draw.
 */
export function drawHand(collection: readonly string[], n: number, rng: SeededRNG): string[] {
  const pool = [...collection];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1); // Fisher-Yates
    const a = pool[i] as string;
    pool[i] = pool[j] as string;
    pool[j] = a;
  }
  return pool.slice(0, Math.max(0, n));
}
