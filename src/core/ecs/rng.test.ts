import { describe, it, expect } from 'vitest';
import { makeRng } from '@core/index';

describe('SeededRNG (mulberry32)', () => {
  it('the same seed yields an identical sequence', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    const seqA = Array.from({ length: 16 }, () => a.next());
    const seqB = Array.from({ length: 16 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds diverge', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('next() lies in [0,1) and int(max) in [0,max)', () => {
    const r = makeRng(99);
    for (let i = 0; i < 1000; i += 1) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(6);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
    }
  });

  it('pick is deterministic for a seed and throws on an empty array', () => {
    expect(makeRng(7).pick(['a', 'b', 'c'])).toBe(makeRng(7).pick(['a', 'b', 'c']));
    expect(() => makeRng(7).pick([])).toThrow();
  });
});
