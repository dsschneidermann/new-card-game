import { defineComponent, type ComponentType } from '../ecs/component';
import type { EntityId } from '../ecs/entity';
import type { SeededRNG } from '../ecs/rng';
import type { World } from '../ecs/world';

/**
 * The player's deck as cycling piles of card-INSTANCE entities (Card Entities, Deck Cycle &
 * Stat Effects feature). Each entry is the EntityId of a card-instance entity (which carries a
 * Card identity + any per-instance modifiers). The deck is the union of the three piles; cards
 * cycle draw -> hand -> discard, reshuffling the discard back into the draw pile when it runs dry.
 * Persisted (feature 06): the ids round-trip, and each instance's components round-trip with them.
 */
export interface DeckStateData {
  drawPile: EntityId[]; // face-down, drawn from the front (top)
  hand: EntityId[]; // the cards in hand this turn
  discardPile: EntityId[]; // played/discarded; reshuffled into the draw pile when it empties
}

export const DeckState: ComponentType<DeckStateData> = defineComponent<DeckStateData>('DeckState');

/** Immutable identity of a card instance: which CardDef it is (art/name/base cost live on the def). */
export interface CardData {
  defId: string;
}
export const Card: ComponentType<CardData> = defineComponent<CardData>('Card');

/**
 * PERMANENT per-instance stat modifiers. Persistent, so they travel with the card through the
 * draw/discard/reshuffle cycle and round-trip across saves. costDelta is added to the base cost.
 */
export interface CardModsData {
  costDelta: number;
}
export const CardMods: ComponentType<CardModsData> = defineComponent<CardModsData>('CardMods');

/**
 * TEMPORARY in-hand modifiers. Persistent (so a mid-turn Resume is faithful) but CLEARED by the
 * card system the moment the card leaves the hand (played, discarded, or end-of-turn). freeThisHand
 * makes the card cost 0 while it is in hand (shown in green).
 */
export interface TempCardModsData {
  freeThisHand: boolean;
}
export const TempCardMods: ComponentType<TempCardModsData> =
  defineComponent<TempCardModsData>('TempCardMods');

/**
 * Create one card-instance entity per def id (each tagged with a Card component) and return their
 * ids. The caller places them in a pile (e.g. the draw pile at deck-build).
 */
export function buildCardInstances(world: World, defIds: readonly string[]): EntityId[] {
  return defIds.map((defId) => {
    const e = world.createEntity();
    world.store(Card).add(e, { defId });
    return e;
  });
}

/** Fisher–Yates shuffle in place using the seeded RNG (same algorithm as the old drawHand). */
function shuffle(a: EntityId[], rng: SeededRNG): void {
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    const tmp = a[i] as EntityId;
    a[i] = a[j] as EntityId;
    a[j] = tmp;
  }
}

/** Move the discard pile into the draw pile and shuffle it — the reshuffle when the draw pile runs dry. */
export function reshuffle(deck: DeckStateData, rng: SeededRNG): void {
  deck.drawPile.push(...deck.discardPile);
  deck.discardPile.length = 0;
  shuffle(deck.drawPile, rng);
}

/**
 * The general-purpose draw primitive: take one instance from the top of the draw pile, reshuffling
 * the discard pile in first when the draw pile is empty. Returns undefined only when the whole deck
 * is already in hand (both draw and discard empty). Every draw (turn-start or effect) goes through this.
 */
export function drawOne(deck: DeckStateData, rng: SeededRNG): EntityId | undefined {
  if (deck.drawPile.length === 0) {
    if (deck.discardPile.length === 0) return undefined;
    reshuffle(deck, rng);
  }
  return deck.drawPile.shift();
}

/** Draw into the hand until it holds `target` cards (or the deck is exhausted). Returns the drawn ids. */
export function drawUpTo(deck: DeckStateData, target: number, rng: SeededRNG): EntityId[] {
  const drawn: EntityId[] = [];
  while (deck.hand.length < target) {
    const next = drawOne(deck, rng);
    if (next === undefined) break;
    deck.hand.push(next);
    drawn.push(next);
  }
  return drawn;
}
