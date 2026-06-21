import { describe, it, expect } from 'vitest';
import {
  createWorld,
  advance,
  serializeWorld,
  restoreWorld,
  HexGrid,
  HexPosition,
  FacingState,
  offsetToAxial,
  Player,
  TurnState,
  ResourcePool,
  MovementBudget,
  makeTurnSystem,
  makeMovementSystem,
  makeCardSystem,
  DeckState,
  Card,
  CardMods,
  TempCardMods,
  buildCardInstances,
  reshuffle,
  drawOne,
  drawUpTo,
  effectiveCost,
  cardEffectiveCost,
  isTempFree,
  sortPileForDisplay,
  pickCandidates,
  isAttackCard,
  type World,
  type EntityId,
  type HexLayout,
  type GameEvent,
  type DeckStateData,
} from '@core/index';

const LAYOUT: HexLayout = { width: 32, height: 24, rowPitch: 18, originX: 24, originY: 28 };
const HAND = 4;
const kinds = (evs: readonly GameEvent[]): string[] => evs.map((e) => e.kind);

/** A world with the turn + movement + card systems and a player holding a deck of `deckIds`. */
function setup(deckIds: string[], opts?: { seed?: number }): { world: World; player: EntityId } {
  const grid = new HexGrid(12, 12);
  const world = createWorld(opts?.seed ?? 1);
  world.addSystem(makeTurnSystem(grid));
  world.addSystem(makeMovementSystem(grid, LAYOUT));
  world.addSystem(makeCardSystem(HAND));
  const player = world.createEntity();
  world.store(Player).add(player, { isPlayer: true });
  world.store(HexPosition).add(player, { hex: offsetToAxial({ col: 5, row: 5 }) });
  world.store(FacingState).add(player, { facing: 'right' });
  world.store(TurnState).add(player, { phase: 'player', round: 1, activeActor: player });
  world.store(ResourcePool).add(player, { energy: 3, energyMax: 3, mana: 1, manaMax: 5, manaRegen: 1 });
  world.store(MovementBudget).add(player, { remaining: 4, max: 4 });
  // The draw pile holds an instance per id (in order); the scene draws the opening hand — here the
  // tests draw explicitly or via an EndTurn, depending on what they exercise.
  const deck: DeckStateData = { drawPile: buildCardInstances(world, deckIds), hand: [], discardPile: [] };
  world.store(DeckState).add(player, deck);
  return { world, player };
}

const deckOf = (world: World, player: EntityId): DeckStateData =>
  world.store(DeckState).get(player) as DeckStateData;
const defOf = (world: World, inst: EntityId): string => world.store(Card).get(inst)?.defId ?? '';

describe('effectiveCost (pure)', () => {
  it('is base + permanent delta floored at 0, overridden to 0 when free this hand', () => {
    expect(effectiveCost(1, 0, false)).toBe(1);
    expect(effectiveCost(2, -1, false)).toBe(1);
    expect(effectiveCost(1, -1, false)).toBe(0);
    expect(effectiveCost(2, -5, false)).toBe(0); // floored, never negative
    expect(effectiveCost(3, 0, true)).toBe(0); // temporary free override
    expect(effectiveCost(2, -1, true)).toBe(0);
  });
});

describe('deck cycle (drawOne / drawUpTo / reshuffle)', () => {
  it('drawUpTo fills the hand from the front of the draw pile', () => {
    const { world, player } = setup(['melee', 'ranged', 'defend', 'jump', 'melee']);
    const deck = deckOf(world, player);
    const order = [...deck.drawPile];
    const drawn = drawUpTo(deck, 3, world.rng);
    expect(deck.hand).toEqual(order.slice(0, 3));
    expect(drawn).toEqual(order.slice(0, 3));
    expect(deck.drawPile).toEqual(order.slice(3));
  });

  it('drawOne reshuffles the discard into the draw pile when empty, conserving the deck', () => {
    const { world, player } = setup(['a', 'b', 'c', 'd']);
    const deck = deckOf(world, player);
    const all = new Set(deck.drawPile);
    deck.discardPile.push(...deck.drawPile); // everything in discard, draw pile empty
    deck.drawPile.length = 0;
    const got = drawOne(deck, world.rng);
    expect(got).toBeDefined();
    const now = new Set([...deck.drawPile, ...deck.hand, ...deck.discardPile, got as EntityId]);
    expect(now).toEqual(all); // every instance still present exactly once
    expect(deck.drawPile.length + deck.discardPile.length + 1).toBe(all.size);
  });

  it('drawOne returns undefined only when the whole deck is in hand (draw + discard empty)', () => {
    const { world, player } = setup(['a', 'b']);
    const deck = deckOf(world, player);
    deck.hand.push(...deck.drawPile);
    deck.drawPile.length = 0;
    expect(drawOne(deck, world.rng)).toBeUndefined();
  });

  it('is deterministic for a given seed', () => {
    const a = setup(['a', 'b', 'c', 'd', 'e'], { seed: 9 });
    const b = setup(['a', 'b', 'c', 'd', 'e'], { seed: 9 });
    reshuffle(deckOf(a.world, a.player), a.world.rng);
    reshuffle(deckOf(b.world, b.player), b.world.rng);
    expect(deckOf(a.world, a.player).drawPile).toEqual(deckOf(b.world, b.player).drawPile);
  });
});

describe('card system: turn-start draw', () => {
  it('draws a fresh hand on TurnStarted{player}, discarding any leftovers', () => {
    // A 10-card deck so the draw pile (6 after the opening hand) refills the next hand without
    // having to reshuffle the just-discarded leftovers back in.
    const { world, player } = setup([
      'melee', 'ranged', 'defend', 'jump', 'melee', 'ranged', 'defend', 'jump', 'melee', 'ranged',
    ]);
    const deck = deckOf(world, player);
    drawUpTo(deck, HAND, world.rng); // stand in for the scene's opening draw
    const leftover = [...deck.hand];
    const evs = advance(world, [{ kind: 'EndTurn', entity: player }]); // -> TurnStarted{player} -> draw
    expect(deck.hand.length).toBe(HAND);
    for (const c of leftover) expect(deck.discardPile).toContain(c); // old hand discarded
    expect(kinds(evs)).toContain('HandDrawn');
  });
});

describe('card system: play -> discard', () => {
  it('moves the played instance from hand to the discard pile and emits CardDiscarded', () => {
    const { world, player } = setup(['melee', 'ranged', 'defend', 'jump', 'melee']);
    advance(world, [{ kind: 'EndTurn', entity: player }]); // draw a hand
    const deck = deckOf(world, player);
    const inst = deck.hand[0] as EntityId;
    const evs = advance(world, [
      { kind: 'PlayCard', entity: player, cardId: defOf(world, inst), energyCost: 1, cardEntity: inst },
    ]);
    expect(deck.hand).not.toContain(inst);
    expect(deck.discardPile).toContain(inst);
    expect(evs.find((e) => e.kind === 'CardDiscarded')).toMatchObject({ instance: inst, entity: player });
  });
});

describe('permanent effect (Sharpen / ReduceRandomOtherCost)', () => {
  it('lowers a random OTHER in-hand card by 1 permanently and persists across a save + cycle', () => {
    const { world, player } = setup(['sharpen', 'melee', 'melee', 'melee', 'ranged']);
    advance(world, [{ kind: 'EndTurn', entity: player }]); // hand = sharpen + 3 melee (deck order)
    const deck = deckOf(world, player);
    const sharpen = deck.hand.find((e) => defOf(world, e) === 'sharpen') as EntityId;
    expect(sharpen).toBeDefined();
    advance(world, [{ kind: 'PlayCard', entity: player, cardId: 'sharpen', energyCost: 1, cardEntity: sharpen }]);
    const reduced = deck.hand.find((e) => (world.store(CardMods).get(e)?.costDelta ?? 0) === -1);
    expect(reduced).toBeDefined(); // some other in-hand card got a permanent -1
    expect(cardEffectiveCost(world, reduced as EntityId)).toBe(0); // melee base 1 - 1 = 0

    // Persists through a save round-trip...
    const restored = restoreWorld(serializeWorld(world));
    expect(restored.store(CardMods).get(reduced as EntityId)?.costDelta).toBe(-1);
    // ...and travels with the instance through a full draw/discard/reshuffle cycle.
    const rdeck = restored.store(DeckState).get(player) as DeckStateData;
    rdeck.discardPile.push(...rdeck.hand, ...rdeck.drawPile);
    rdeck.hand.length = 0;
    rdeck.drawPile.length = 0;
    reshuffle(rdeck, restored.rng);
    expect(restored.store(CardMods).get(reduced as EntityId)?.costDelta).toBe(-1);
  });

  it('fizzles (no change) when there is no other card in hand', () => {
    const { world, player } = setup(['sharpen']);
    const deck = deckOf(world, player);
    drawUpTo(deck, HAND, world.rng); // hand = [sharpen] only
    const sharpen = deck.hand[0] as EntityId;
    advance(world, [{ kind: 'PlayCard', entity: player, cardId: 'sharpen', energyCost: 1, cardEntity: sharpen }]);
    // sharpen left the hand; nothing else exists to receive a CardMods
    const anyMods = [...deck.drawPile, ...deck.hand, ...deck.discardPile].some(
      (e) => world.store(CardMods).has(e),
    );
    expect(anyMods).toBe(false);
  });

  it('only reduces a card that still costs something (skips already-0-cost cards)', () => {
    const { world, player } = setup(['sharpen', 'jump', 'melee', 'jump']); // jump is base cost 0
    advance(world, [{ kind: 'EndTurn', entity: player }]); // hand = sharpen + jump + melee + jump
    const deck = deckOf(world, player);
    const sharpen = deck.hand.find((e) => defOf(world, e) === 'sharpen') as EntityId;
    advance(world, [{ kind: 'PlayCard', entity: player, cardId: 'sharpen', energyCost: 1, cardEntity: sharpen }]);
    const melee = deck.hand.find((e) => defOf(world, e) === 'melee') as EntityId;
    expect(world.store(CardMods).get(melee)?.costDelta).toBe(-1); // the only >0-cost card got it
    for (const jump of deck.hand.filter((e) => defOf(world, e) === 'jump')) {
      expect(world.store(CardMods).has(jump)).toBe(false); // 0-cost cards are never targeted
    }
  });

  it('fizzles when every other card in hand is already 0 cost', () => {
    const { world, player } = setup(['sharpen', 'jump', 'jump', 'jump']);
    advance(world, [{ kind: 'EndTurn', entity: player }]);
    const deck = deckOf(world, player);
    const sharpen = deck.hand.find((e) => defOf(world, e) === 'sharpen') as EntityId;
    advance(world, [{ kind: 'PlayCard', entity: player, cardId: 'sharpen', energyCost: 1, cardEntity: sharpen }]);
    const anyMods = [...deck.drawPile, ...deck.hand, ...deck.discardPile].some((e) =>
      world.store(CardMods).has(e),
    );
    expect(anyMods).toBe(false); // nothing worth reducing -> no-op
  });
});

describe('temporary effect (Quick Draw / DrawAndFree)', () => {
  it('draws an extra card and frees it (cost 0), and clears the free when it leaves the hand', () => {
    const { world, player } = setup(['quickdraw', 'melee', 'melee', 'melee', 'ranged', 'jump']);
    advance(world, [{ kind: 'EndTurn', entity: player }]); // hand = quickdraw + 3 melee; draw = ranged, jump
    const deck = deckOf(world, player);
    const quickdraw = deck.hand.find((e) => defOf(world, e) === 'quickdraw') as EntityId;
    const handBefore = deck.hand.length;
    advance(world, [
      { kind: 'PlayCard', entity: player, cardId: 'quickdraw', energyCost: 1, cardEntity: quickdraw },
    ]);
    expect(deck.hand.length).toBe(handBefore); // played one, drew one
    const freed = deck.hand.find((e) => isTempFree(world, e)) as EntityId;
    expect(freed).toBeDefined();
    expect(cardEffectiveCost(world, freed)).toBe(0); // free this hand -> 0

    // Playing the freed card removes it from the hand AND clears its temporary override.
    advance(world, [
      { kind: 'PlayCard', entity: player, cardId: defOf(world, freed), energyCost: 0, cardEntity: freed },
    ]);
    expect(isTempFree(world, freed)).toBe(false);
  });

  it('clears the temporary free at end of turn when an unplayed freed card is discarded', () => {
    const { world, player } = setup(['quickdraw', 'melee', 'melee', 'melee', 'ranged']);
    advance(world, [{ kind: 'EndTurn', entity: player }]);
    const deck = deckOf(world, player);
    const quickdraw = deck.hand.find((e) => defOf(world, e) === 'quickdraw') as EntityId;
    advance(world, [
      { kind: 'PlayCard', entity: player, cardId: 'quickdraw', energyCost: 1, cardEntity: quickdraw },
    ]);
    const freed = deck.hand.find((e) => isTempFree(world, e)) as EntityId;
    expect(freed).toBeDefined();
    advance(world, [{ kind: 'EndTurn', entity: player }]); // leftover hand discarded -> temp cleared
    expect(isTempFree(world, freed)).toBe(false);
  });
});

describe('sortPileForDisplay (overlay display order)', () => {
  it('orders attacks before skills, then by effective cost ascending, then by name', () => {
    // melee/ranged: attack cost 1; whirlwind: attack cost 2; jump: skill cost 0; defend/quickdraw: skill cost 1
    const { world, player } = setup(['whirlwind', 'defend', 'melee', 'quickdraw', 'jump', 'ranged']);
    const sorted = sortPileForDisplay(world, deckOf(world, player).drawPile).map((e) => defOf(world, e));
    expect(sorted).toEqual(['melee', 'ranged', 'whirlwind', 'jump', 'defend', 'quickdraw']);
  });

  it('uses EFFECTIVE cost: a permanent reduction moves a card to its reduced slot', () => {
    const { world, player } = setup(['whirlwind', 'melee']); // melee attack cost 1, whirlwind attack cost 2
    const deck = deckOf(world, player);
    expect(sortPileForDisplay(world, deck.drawPile).map((e) => defOf(world, e))).toEqual(['melee', 'whirlwind']);
    const whirlwind = deck.drawPile.find((e) => defOf(world, e) === 'whirlwind') as EntityId;
    world.store(CardMods).add(whirlwind, { costDelta: -2 }); // 2 -> 0, now cheaper than melee
    expect(sortPileForDisplay(world, deck.drawPile).map((e) => defOf(world, e))).toEqual(['whirlwind', 'melee']);
  });
});

describe('card-pick effect (Recall / MoveToHand)', () => {
  it('returns the selected discard card to hand and discards recall itself', () => {
    const { world, player } = setup(['recall', 'melee']);
    const deck = deckOf(world, player);
    const recall = deck.drawPile.find((e) => defOf(world, e) === 'recall') as EntityId;
    const melee = deck.drawPile.find((e) => defOf(world, e) === 'melee') as EntityId;
    deck.drawPile.length = 0;
    deck.hand.push(recall); // recall in hand
    deck.discardPile.push(melee); // melee sitting in the discard
    advance(world, [
      { kind: 'PlayCard', entity: player, cardId: 'recall', energyCost: 1, cardEntity: recall, cardTargets: [melee] },
    ]);
    expect(deck.hand).toContain(melee); // the picked card returned to hand
    expect(deck.discardPile).not.toContain(melee);
    expect(deck.discardPile).toContain(recall); // recall itself was played -> discard
  });

  it('is a no-op when the selected card is not in the discard pile', () => {
    const { world, player } = setup(['recall', 'melee']);
    const deck = deckOf(world, player);
    const recall = deck.drawPile.find((e) => defOf(world, e) === 'recall') as EntityId;
    const melee = deck.drawPile.find((e) => defOf(world, e) === 'melee') as EntityId;
    deck.drawPile.length = 0;
    deck.hand.push(recall, melee); // melee is in HAND, not the discard
    advance(world, [
      { kind: 'PlayCard', entity: player, cardId: 'recall', energyCost: 1, cardEntity: recall, cardTargets: [melee] },
    ]);
    expect(deck.hand).toContain(melee); // unchanged (still in hand)
    expect(deck.discardPile).toEqual([recall]); // only recall moved to discard
  });

  it('plays cleanly with no cardTargets (no card was picked)', () => {
    const { world, player } = setup(['recall', 'melee']);
    const deck = deckOf(world, player);
    const recall = deck.drawPile.find((e) => defOf(world, e) === 'recall') as EntityId;
    const melee = deck.drawPile.find((e) => defOf(world, e) === 'melee') as EntityId;
    deck.drawPile.length = 0;
    deck.hand.push(recall);
    deck.discardPile.push(melee);
    advance(world, [{ kind: 'PlayCard', entity: player, cardId: 'recall', energyCost: 1, cardEntity: recall }]); // no cardTargets
    expect(deck.discardPile).toContain(melee); // unchanged
    expect(deck.hand).not.toContain(melee);
  });

  it('MoveToHand also pulls the selected card from the draw pile', () => {
    const { world, player } = setup(['recall', 'melee']);
    const deck = deckOf(world, player);
    const recall = deck.drawPile.find((e) => defOf(world, e) === 'recall') as EntityId;
    const melee = deck.drawPile.find((e) => defOf(world, e) === 'melee') as EntityId;
    deck.drawPile.length = 0;
    deck.hand.push(recall);
    deck.drawPile.push(melee); // melee sitting in the DRAW pile
    advance(world, [
      { kind: 'PlayCard', entity: player, cardId: 'recall', energyCost: 1, cardEntity: recall, cardTargets: [melee] },
    ]);
    expect(deck.hand).toContain(melee); // pulled from draw to hand
    expect(deck.drawPile).not.toContain(melee);
  });
});

describe('pickCandidates (card-picker source)', () => {
  it('returns the named pile, narrowed by the optional filter (by def id)', () => {
    const { world, player } = setup(['melee', 'ranged', 'defend', 'jump']);
    const deck = deckOf(world, player);
    const byDef = (id: string): EntityId => deck.drawPile.find((e) => defOf(world, e) === id) as EntityId;
    const melee = byDef('melee');
    const ranged = byDef('ranged');
    const defend = byDef('defend');
    const jump = byDef('jump');
    deck.drawPile.length = 0;
    deck.drawPile.push(melee, ranged); // draw = [melee, ranged]
    deck.discardPile.push(defend, jump); // discard = [defend, jump]
    expect(pickCandidates(world, deck, { pile: 'draw' })).toEqual([melee, ranged]);
    expect(pickCandidates(world, deck, { pile: 'discard' })).toEqual([defend, jump]);
    expect(pickCandidates(world, deck, { pile: 'draw', filter: (id) => isAttackCard(id) })).toEqual([melee, ranged]);
    expect(pickCandidates(world, deck, { pile: 'discard', filter: (id) => isAttackCard(id) })).toEqual([]);
  });
});

describe('DeckState v3 persistence (feature 06 obligation)', () => {
  it('round-trips the three piles + per-instance Card / CardMods / TempCardMods', () => {
    const { world, player } = setup(['melee', 'ranged', 'defend', 'jump']);
    const deck = deckOf(world, player);
    drawUpTo(deck, 2, world.rng); // hand = 2, draw = 2
    const h0 = deck.hand[0] as EntityId;
    world.store(CardMods).add(h0, { costDelta: -1 });
    world.store(TempCardMods).add(h0, { freeThisHand: true });

    const restored = restoreWorld(serializeWorld(world));
    const r = restored.store(DeckState).get(player) as DeckStateData;
    expect(r.hand).toEqual(deck.hand);
    expect(r.drawPile).toEqual(deck.drawPile);
    expect(r.discardPile).toEqual(deck.discardPile);
    expect(restored.store(Card).get(h0)?.defId).toBe(defOf(world, h0));
    expect(restored.store(CardMods).get(h0)?.costDelta).toBe(-1);
    expect(restored.store(TempCardMods).get(h0)?.freeThisHand).toBe(true);
  });
});
