import { describe, it, expect } from 'vitest';
import {
  attackPatternHexes,
  hexAdd,
  hexEquals,
  hexDistance,
  hexKey,
  HEX_DIRECTIONS,
  type Hex,
  type AttackPattern,
} from '@core/index';

const AIM: Hex = { q: 8, r: 8 };
const E = HEX_DIRECTIONS[0]!; // the +q direction
const attacker = (dist: number): Hex => {
  // A hex `dist` tiles from AIM along -E, so the from->to direction is +E (a stable, on-axis attacker).
  let h = AIM;
  for (let i = 0; i < dist; i += 1) h = hexAdd(h, { q: -E.q, r: -E.r });
  return h;
};
const includesAim = (hexes: Hex[]): boolean => hexes.some((h) => hexEquals(h, AIM));
const noDupes = (hexes: Hex[]): boolean => new Set(hexes.map(hexKey)).size === hexes.length;

describe('attackPatternHexes', () => {
  it('single (and an absent pattern) is just the aim hex', () => {
    expect(attackPatternHexes({ kind: 'single' }, attacker(1), AIM)).toEqual([AIM]);
    expect(attackPatternHexes(undefined, attacker(1), AIM)).toEqual([AIM]); // back-compat default
  });

  it('every pattern kind always includes the aim hex', () => {
    const kinds: AttackPattern[] = [
      { kind: 'single' },
      { kind: 'line', size: 3 },
      { kind: 'blast', size: 1 },
      { kind: 'blast', size: 2 },
    ];
    for (const pattern of kinds) expect(includesAim(attackPatternHexes(pattern, attacker(2), AIM))).toBe(true);
  });

  it('line(size) is a contiguous on-axis beam of `size` hexes from the aim, stepping away from the attacker', () => {
    const from = attacker(2); // two tiles behind AIM along -E, so the beam continues along +E past the aim
    const beam = attackPatternHexes({ kind: 'line', size: 3 }, from, AIM);
    expect(beam).toHaveLength(3);
    expect(beam[0]).toEqual(AIM); // starts at the aim
    expect(beam).toEqual([AIM, hexAdd(AIM, E), hexAdd(AIM, hexAdd(E, E))]); // AIM, AIM+E, AIM+2E
    for (let i = 1; i < beam.length; i += 1) expect(hexDistance(beam[i - 1]!, beam[i]!)).toBe(1); // contiguous
  });

  it('line(1) collapses to the aim only', () => {
    expect(attackPatternHexes({ kind: 'line', size: 1 }, attacker(3), AIM)).toEqual([AIM]);
  });

  it('blast(1) is the aim plus its six neighbours (7 hexes, no duplicates)', () => {
    const blast = attackPatternHexes({ kind: 'blast', size: 1 }, attacker(2), AIM);
    expect(blast).toHaveLength(7);
    expect(noDupes(blast)).toBe(true);
    for (const h of blast) expect(hexDistance(AIM, h)).toBeLessThanOrEqual(1);
  });

  it('blast(2) is every hex within radius 2 (19 hexes)', () => {
    const blast = attackPatternHexes({ kind: 'blast', size: 2 }, attacker(3), AIM);
    expect(blast).toHaveLength(19);
    expect(noDupes(blast)).toBe(true);
    for (const h of blast) expect(hexDistance(AIM, h)).toBeLessThanOrEqual(2);
  });

  it('a blast is independent of the attacker position (centred on the aim)', () => {
    const a = attackPatternHexes({ kind: 'blast', size: 1 }, attacker(1), AIM);
    const b = attackPatternHexes({ kind: 'blast', size: 1 }, attacker(4), AIM);
    expect(new Set(a.map(hexKey))).toEqual(new Set(b.map(hexKey)));
  });
});
