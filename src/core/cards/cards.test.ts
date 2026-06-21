import { describe, it, expect } from 'vitest';
import {
  hexDistance,
  hexLine,
  hexesWithinRange,
  resolveTargeting,
  targetMaxRange,
  cardDef,
  spellDef,
  isAttackCard,
  isHeavyAttack,
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

  it('singleHex with maxRange: highlights in range, empty beyond range', () => {
    const near: Hex = { q: 1, r: 0 }; // distance 1
    const far: Hex = { q: 3, r: 0 }; // distance 3
    expect(resolveTargeting({ kind: 'singleHex', maxRange: 1 }, origin, near)).toEqual({ primary: [near], secondary: [] });
    expect(resolveTargeting({ kind: 'singleHex', maxRange: 1 }, origin, far)).toEqual({ primary: [], secondary: [] });
  });

  it('lineOfSight with maxRange: draws the ray in range, empty beyond range', () => {
    const within: Hex = { q: 2, r: 0 }; // distance 2
    const beyond: Hex = { q: 6, r: 0 }; // distance 6
    expect(resolveTargeting({ kind: 'lineOfSight', maxRange: 5 }, origin, within).primary).toEqual([within]);
    expect(resolveTargeting({ kind: 'lineOfSight', maxRange: 5 }, origin, beyond)).toEqual({ primary: [], secondary: [] });
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

  it('selfAoe: the disk around the caster (minus the caster), ignoring hovered', () => {
    const r = resolveTargeting({ kind: 'selfAoe', radius: 2 }, origin, hovered);
    expect(r.secondary).toEqual([]);
    expect(r.primary).toHaveLength(18); // 19-hex disk (radius 2) minus the caster
    expect(r.primary).not.toContainEqual(origin);
    for (const h of r.primary) {
      expect(hexDistance(origin, h)).toBeGreaterThan(0);
      expect(hexDistance(origin, h)).toBeLessThanOrEqual(2);
    }
    // hovered is ignored: a different hovered yields the same set
    expect(resolveTargeting({ kind: 'selfAoe', radius: 2 }, origin, origin).primary).toEqual(r.primary);
  });

  it('selfAoe radius 1: the 6 neighbours of the caster (excludes the caster)', () => {
    const r = resolveTargeting({ kind: 'selfAoe', radius: 1 }, origin, hovered);
    expect(r.primary).toHaveLength(6);
    expect(r.primary).not.toContainEqual(origin);
  });
});

describe('targetMaxRange', () => {
  it('returns the singleHex/lineOfSight maxRange, undefined for unranged specs', () => {
    expect(targetMaxRange({ kind: 'singleHex', maxRange: 1 })).toBe(1);
    expect(targetMaxRange({ kind: 'lineOfSight', maxRange: 5 })).toBe(5);
    expect(targetMaxRange({ kind: 'singleHex' })).toBeUndefined();
    expect(targetMaxRange({ kind: 'self' })).toBeUndefined();
    expect(targetMaxRange({ kind: 'areaOfEffect', radius: 1 })).toBeUndefined();
    expect(targetMaxRange({ kind: 'selfAoe', radius: 2 })).toBeUndefined();
    expect(
      targetMaxRange({ kind: 'twoStep', first: { kind: 'singleHex' }, second: { kind: 'singleHex' } }),
    ).toBeUndefined();
  });
});

describe('starter content', () => {
  it('the starter collection is the expected 20-card multiset of defined cards', () => {
    expect(STARTER_COLLECTION).toEqual([
      'melee', 'melee', 'melee',
      'longstrike', 'longstrike',
      'ranged', 'ranged', 'ranged',
      'defend', 'defend',
      'jump', 'jump',
      'quickdraw', 'quickdraw',
      'sharpen', 'sharpen',
      'whirlwind', 'whirlwind',
      'recall', 'recall',
    ]);
    expect(STARTER_COLLECTION).toHaveLength(20);
    for (const id of STARTER_COLLECTION) expect(cardDef(id)).toBeDefined();
  });

  it('isAttackCard is true for attack cards, false for skills, spells and unknown ids', () => {
    expect(isAttackCard('melee')).toBe(true);
    expect(isAttackCard('longstrike')).toBe(true);
    expect(isAttackCard('ranged')).toBe(true);
    expect(isAttackCard('defend')).toBe(false);
    expect(isAttackCard('jump')).toBe(false);
    expect(isAttackCard('quickdraw')).toBe(false); // a skill demonstrator
    expect(isAttackCard('sharpen')).toBe(false); // a skill demonstrator
    expect(isAttackCard('whirlwind')).toBe(true); // a self-centered AOE melee (attack)
    expect(isAttackCard('blizzard')).toBe(false); // a spell id, not a card
    expect(isAttackCard('nope')).toBe(false);
  });

  it('isHeavyAttack is true only for heavy attacks (whirlwind, longstrike) -> attack2 animation', () => {
    expect(isHeavyAttack('whirlwind')).toBe(true);
    expect(isHeavyAttack('longstrike')).toBe(true);
    expect(isHeavyAttack('melee')).toBe(false); // a normal attack -> attack1
    expect(isHeavyAttack('ranged')).toBe(false);
    expect(isHeavyAttack('defend')).toBe(false);
    expect(isHeavyAttack('quickdraw')).toBe(false);
    expect(isHeavyAttack('blizzard')).toBe(false); // a spell id, not a card
    expect(isHeavyAttack('nope')).toBe(false);
    // the flag lives on the defs of the heavy attacks only
    expect(cardDef('whirlwind')?.heavyAttack).toBe(true);
    expect(cardDef('longstrike')?.heavyAttack).toBe(true);
    expect(cardDef('melee')?.heavyAttack).toBeUndefined();
  });

  it('the demonstrator skills carry their effects', () => {
    expect(cardDef('quickdraw')).toMatchObject({ cost: 1, effect: { kind: 'DrawAndFree' } });
    expect(cardDef('sharpen')).toMatchObject({ cost: 1, effect: { kind: 'ReduceRandomOtherCost', amount: 1 } });
    expect(cardDef('recall')).toMatchObject({
      cost: 1,
      target: { kind: 'self' },
      pickFrom: { pile: 'discard' },
      effect: { kind: 'MoveToHand' },
    });
    expect(cardDef('melee')?.effect).toBeUndefined();
  });

  it('attack cards carry per-id art, costs, and their ranged target specs', () => {
    expect(cardDef('melee')).toMatchObject({ art: 'card.art.melee', cost: 1, target: { kind: 'singleHex', maxRange: 1 } });
    expect(cardDef('longstrike')?.target).toEqual({ kind: 'singleHex', maxRange: 2 });
    expect(cardDef('ranged')?.target).toEqual({ kind: 'lineOfSight', maxRange: 5 });
    expect(cardDef('defend')?.target).toEqual({ kind: 'self' });
    expect(cardDef('jump')?.cost).toBe(0);
    expect(cardDef('whirlwind')).toMatchObject({ cost: 2, attack: true, target: { kind: 'selfAoe', radius: 2 } });
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

// Deck-cycle behaviour and DeckState v3 persistence are covered in src/core/cards/system.test.ts.
