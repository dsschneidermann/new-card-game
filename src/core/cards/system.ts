import type { System, World } from '../ecs/world';
import type { EntityId } from '../ecs/entity';
import {
  DeckState,
  Card,
  CardMods,
  TempCardMods,
  drawOne,
  drawUpTo,
  type DeckStateData,
} from './deck';
import { cardDef } from './content';
import { cardEffectiveCost } from './queries';
import type { CardEffect } from './types';

/** The deck owner (the player holds the singleton DeckState). */
function deckOwner(world: World): EntityId | undefined {
  return world.entitiesWith(DeckState)[0];
}

/**
 * The card system (Card Entities, Deck Cycle & Stat Effects). Registered AFTER the turn engine,
 * it coordinates with it through THIS step's events (same-step visible on the event bus):
 *  - TurnStarted{player}: discard the leftover hand (clearing temporaries) then draw a fresh hand.
 *  - CardPlayed{cardEntity}: move the played instance hand -> discard (clearing temporaries) and
 *    resolve its effect.
 * The turn engine keeps only cost + phase; all hand/deck lifecycle + effects live here. Draw and
 * shuffle use world.rng, so the sequence is deterministic and save/replay-safe. Read-only deck/card
 * queries (cost, display order, pick candidates) live in ./queries.
 */
export function makeCardSystem(handSize: number): System {
  return (world) => {
    const owner = deckOwner(world);
    if (owner === undefined) return;
    const deck = world.store(DeckState).get(owner);
    if (deck === undefined) return;
    // Snapshot this step's events first: resolving effects emits more events (HandChanged), and we
    // must not react to our own emissions within the same pass.
    const events = [...world.events()];
    for (const ev of events) {
      if (ev.kind === 'TurnStarted' && ev.phase === 'player') {
        startTurn(world, owner, deck, handSize);
      } else if (ev.kind === 'CardPlayed' && ev.entity === owner && ev.cardEntity !== undefined) {
        playCard(world, owner, deck, ev.cardEntity, ev.cardTargets ?? []);
      }
    }
  };
}

/** Turn start: discard any leftover hand (clearing temporaries), then draw up to the hand size. */
function startTurn(world: World, owner: EntityId, deck: DeckStateData, handSize: number): void {
  for (const inst of deck.hand) {
    clearTemp(world, inst);
    deck.discardPile.push(inst);
  }
  deck.hand.length = 0;
  drawUpTo(deck, handSize, world.rng);
  // A wholesale hand replacement (distinct from the incremental HandChanged that effects emit) so the
  // UI discards the whole old hand and deals the new one in, even when a card is reshuffled + redrawn.
  world.emit({ kind: 'HandDealt', entity: owner });
}

/** A played card leaves the hand -> discard (clearing temporaries), then its effect resolves. */
function playCard(
  world: World,
  owner: EntityId,
  deck: DeckStateData,
  instance: EntityId,
  cardTargets: readonly EntityId[],
): void {
  const i = deck.hand.indexOf(instance);
  if (i === -1) return; // not in hand (defensive — e.g. a non-hand play)
  deck.hand.splice(i, 1);
  clearTemp(world, instance);
  deck.discardPile.push(instance);
  const defId = world.store(Card).get(instance)?.defId;
  world.emit({ kind: 'CardDiscarded', entity: owner, instance, defId: defId ?? '' });
  const effect = defId !== undefined ? cardDef(defId)?.effect : undefined;
  if (effect !== undefined) resolveEffect(world, owner, deck, effect, cardTargets);
}

/** Clear any temporary in-hand modifiers from an instance (whenever it leaves the hand). */
function clearTemp(world: World, instance: EntityId): void {
  world.store(TempCardMods).remove(instance);
}

/**
 * Apply a played card's effect. Effects mutate the world (draw, attach/adjust modifiers) via
 * world.rng so they stay deterministic. The played card has already left the hand, so the hand now
 * holds only OTHER cards (relevant to ReduceRandomOtherCost).
 */
function resolveEffect(
  world: World,
  owner: EntityId,
  deck: DeckStateData,
  effect: CardEffect,
  cardTargets: readonly EntityId[],
): void {
  switch (effect.kind) {
    case 'DrawAndFree': {
      const drawn = drawOne(deck, world.rng); // cycles (reshuffles) as needed
      if (drawn === undefined) return; // the whole deck is already in hand
      deck.hand.push(drawn);
      world.store(TempCardMods).add(drawn, { freeThisHand: true });
      world.emit({ kind: 'HandChanged', entity: owner }); // the scene refreshes the fan to show the new card
      break;
    }
    case 'ReduceRandomOtherCost': {
      // Only target OTHER in-hand cards that still cost something — reducing an already-0-cost card
      // (base 0, already reduced to 0, or free this hand) shows no change, so skip them.
      const candidates = deck.hand.filter((inst) => cardEffectiveCost(world, inst) > 0);
      if (candidates.length === 0) return; // fizzle: nothing worth reducing
      const target = candidates[world.rng.int(candidates.length)] as EntityId;
      const mods = world.store(CardMods).get(target);
      if (mods !== undefined) mods.costDelta -= effect.amount;
      else world.store(CardMods).add(target, { costDelta: -effect.amount });
      world.emit({ kind: 'HandChanged', entity: owner }); // refresh the fan to show the reduced cost
      break;
    }
    case 'MoveToHand': {
      const target = cardTargets[0];
      if (target === undefined) return; // no card was selected (defensive)
      // Remove it from whichever pile holds it (draw / discard); a hand pick is already there.
      for (const pile of [deck.drawPile, deck.discardPile]) {
        const i = pile.indexOf(target);
        if (i !== -1) pile.splice(i, 1);
      }
      if (!deck.hand.includes(target)) deck.hand.push(target);
      world.emit({ kind: 'HandChanged', entity: owner }); // refresh the fan to show the card now in hand
      break;
    }
  }
}
