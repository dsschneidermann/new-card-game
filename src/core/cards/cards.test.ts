import { describe, it, expect } from 'vitest';
import {
  createWorld,
  serializeWorld,
  restoreWorld,
  hexDistance,
  hexLine,
  hexesWithinRange,
  resolveTargeting,
  cardDef,
  spellDef,
  drawHand,
  makeRng,
  DeckState,
  STARTER_COLLECTION,
  type Hex,
} from '@core/index';

describe('hexLine', () => {
  it('is contiguous, inclusive of both endpoints, length = distance + 1', () => {
    const check = (a: Hex, b: Hex): void => {
      const line = hexLine(a, b);
      expect(line[0]).toEqual(a);
      expect(line[line.length - 1]).toEqual(b);
      expect(line.length).toBe(hexDistance(a, b) + 1);
      for (let i = 1; i < line.length; i += 1) {
        expect(hexDistance(line[i - 1] as Hex, line[i] as Hex)).toBe(1);
      }
    };
    check({ q: 0, r: 0 }, { q: 3, r: 0 }); // straight
    check({ q: 0, r: 0 }, { q: 2, r: -3 }); // diagonal
  });

  it('returns the single hex when a == b', () => {
    expect(hexLine({ q: 2, r: -1 }, { q: 2, r: -1 })).toEqual([{ q: 2, r: -1 }]);
  });
});

describe('hexesWithinRange', () => {
  it('radius 0 is just the center; radius 1 is 7 hexes; radius 2 is 19', () => {
    expect(hexesWithinRange({ q: 0, r: 0 }, 0)).toEqual([{ q: 0, r: 0 }]);
    expect(hexesWithinRange({ q: 2, r: -1 }, 1)).toHaveLength(7);
    expect(hexesWithinRange({ q: 0, r: 0 }, 2)).toHaveLength(19);
  });

  it('includes only hexes within the radius', () => {
    const center: Hex = { q: 1, r: 1 };
    for (const h of hexesWithinRange(center, 2)) {
      expect(hexDistance(center, h)).toBeLessThanOrEqual(2);
    }
  });
});

describe('resolveTargeting', () => {
  const origin: Hex = { q: 0, r: 0 };
  const hovered: Hex = { q: 3, r: 0 };

  it('self: target ignored, highlights the caster', () => {
    expect(resolveTargeting({ kind: 'self' }, origin, hovered)).toEqual({
      primary: [origin],
      secondary: [],
    });
  });

  it('singleHex: only the hovered hex', () => {
    expect(resolveTargeting({ kind: 'singleHex' }, origin, hovered)).toEqual({
      primary: [hovered],
      secondary: [],
    });
  });

  it('lineOfSight: hovered is primary, the ray between is secondary', () => {
    const r = resolveTargeting({ kind: 'lineOfSight' }, origin, hovered);
    expect(r.primary).toEqual([hovered]);
    expect(r.secondary).toEqual(hexLine(origin, hovered).slice(1, -1));
    expect(r.secondary).not.toContainEqual(origin);
    expect(r.secondary).not.toContainEqual(hovered);
  });

  it('areaOfEffect(1): the 7-hex disk around hovered', () => {
    const r = resolveTargeting({ kind: 'areaOfEffect', radius: 1 }, origin, hovered);
    expect(r.primary).toHaveLength(7);
    expect(r.primary).toContainEqual(hovered);
    expect(r.secondary).toEqual([]);
  });

  it('twoStep: phase 1 resolves first; phase 2 locks firstPick (red) and shows hovered (yellow)', () => {
    const teleport = { kind: 'twoStep', first: { kind: 'singleHex' }, second: { kind: 'singleHex' } } as const;
    expect(resolveTargeting(teleport, origin, hovered)).toEqual({ primary: [hovered], secondary: [] });
    const firstPick: Hex = { q: 1, r: 1 };
    expect(resolveTargeting(teleport, origin, hovered, firstPick)).toEqual({
      primary: [firstPick],
      secondary: [hovered],
    });
  });
});

describe('starter content', () => {
  it('the starter collection is the expected multiset of defined cards', () => {
    expect(STARTER_COLLECTION).toEqual(['melee', 'melee', 'ranged', 'ranged', 'defend', 'defend', 'jump']);
    for (const id of STARTER_COLLECTION) expect(cardDef(id)).toBeDefined();
  });

  it('cards carry per-id art, the right costs and target specs', () => {
    expect(cardDef('melee')).toMatchObject({ art: 'card.art.melee', cost: 1, target: { kind: 'singleHex' } });
    expect(cardDef('ranged')?.target).toEqual({ kind: 'lineOfSight' });
    expect(cardDef('defend')?.target).toEqual({ kind: 'self' });
    expect(cardDef('jump')?.cost).toBe(0);
  });

  it('spells carry per-id art and the right target specs', () => {
    expect(spellDef('blizzard')).toMatchObject({
      art: 'spell.icon.blizzard',
      cost: 3,
      target: { kind: 'areaOfEffect', radius: 1 },
    });
    expect(spellDef('heal')?.target).toEqual({ kind: 'self' });
    expect(spellDef('teleport')?.target.kind).toBe('twoStep');
  });
});

describe('drawHand', () => {
  it('draws a random hand of n from the collection, reproducible for a given seed', () => {
    const hand = drawHand(STARTER_COLLECTION, 4, makeRng(7));
    expect(hand).toHaveLength(4);
    for (const id of hand) expect(STARTER_COLLECTION).toContain(id);
    expect(drawHand(STARTER_COLLECTION, 4, makeRng(7))).toEqual(hand); // same seed -> same hand
    expect(drawHand(['a', 'b'], 4, makeRng(1))).toHaveLength(2); // clamped to collection size
  });
});

describe('DeckState persistence (feature 06 obligation)', () => {
  it('round-trips the collection and hand through a save', () => {
    const world = createWorld(1);
    const e = world.createEntity();
    world.store(DeckState).add(e, { collection: [...STARTER_COLLECTION], hand: ['melee', 'ranged'] });
    const restored = restoreWorld(serializeWorld(world));
    expect(restored.store(DeckState).get(e)).toEqual({
      collection: [...STARTER_COLLECTION],
      hand: ['melee', 'ranged'],
    });
  });
});
