import type { World } from '../ecs/world';
import type { EntityId } from '../ecs/entity';
import { Card, CardMods, TempCardMods, type DeckStateData } from './deck';
import { cardDef } from './content';
import type { CardPick } from './types';

/**
 * Read-only derivations over the deck / card-instance model (Card Entities, Deck Cycle & Stat
 * Effects): effective cost, the temporary-free flag, the overlay display order, and the card-picker
 * candidate list. Pure (no mutation) and Phaser-free, so they are unit-tested and shared by both the
 * card system and the UI. The deck DATA + structural pile ops live in ./deck; the per-step system
 * lifecycle lives in ./system.
 */

/**
 * Pure effective-cost rule: base + permanent delta, floored at 0; a temporary free override is 0.
 * Kept pure (no world) so the rule is unit-testable on its own; cardEffectiveCost is the
 * world-aware reader that feeds it an instance's base + modifiers.
 */
export function effectiveCost(base: number, permDelta: number, tempFree: boolean): number {
  return tempFree ? 0 : Math.max(0, base + permDelta);
}

/** Effective energy cost of a card instance, reading its def base + permanent + temporary modifiers. */
export function cardEffectiveCost(world: World, instance: EntityId): number {
  const defId = world.store(Card).get(instance)?.defId;
  const base = defId !== undefined ? cardDef(defId)?.cost ?? 0 : 0;
  const permDelta = world.store(CardMods).get(instance)?.costDelta ?? 0;
  return effectiveCost(base, permDelta, isTempFree(world, instance));
}

/** Whether an instance currently has a temporary free override (drives the green cost colour). */
export function isTempFree(world: World, instance: EntityId): boolean {
  return world.store(TempCardMods).get(instance)?.freeThisHand === true;
}

/**
 * Order a pile's card instances for display in the Deck / Discard overlay: attack cards first, then
 * by effective energy cost ascending, then by card name alphabetically (a stable tiebreak). A DISPLAY
 * sort only: it deliberately does NOT reflect the draw pile's real (shuffled) next-draw order.
 */
export function sortPileForDisplay(world: World, ids: readonly EntityId[]): EntityId[] {
  const keyed = ids.map((id) => {
    const defId = world.store(Card).get(id)?.defId;
    const def = defId !== undefined ? cardDef(defId) : undefined;
    return { id, attack: def?.attack === true, cost: cardEffectiveCost(world, id), name: def?.name ?? '' };
  });
  keyed.sort((a, b) => {
    if (a.attack !== b.attack) return a.attack ? -1 : 1; // attacks before skills
    if (a.cost !== b.cost) return a.cost - b.cost; // then cheaper first
    return a.name.localeCompare(b.name); // then by name
  });
  return keyed.map((k) => k.id);
}

/**
 * The card instances a pickFrom card can choose from: its named pile, optionally narrowed by the
 * pick's filter (by card def id). The UI uses it to populate the picker and to check whether there
 * is anything to pick.
 */
export function pickCandidates(world: World, deck: DeckStateData, pick: CardPick): EntityId[] {
  const pile = pick.pile === 'draw' ? deck.drawPile : pick.pile === 'hand' ? deck.hand : deck.discardPile;
  const { filter } = pick;
  if (filter === undefined) return [...pile];
  return pile.filter((inst) => {
    const defId = world.store(Card).get(inst)?.defId;
    return defId !== undefined && filter(defId);
  });
}
