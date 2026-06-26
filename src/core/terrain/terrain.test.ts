import { describe, it, expect } from 'vitest';
import { valueNoise, opened2x2, overlayFor, scatterDecal, type LeafShape } from '@core/index';

describe('valueNoise', () => {
  it('stays in [0,1) and is pure for a given point + seed', () => {
    for (let i = 0; i < 200; i += 1) {
      const x = i * 0.37;
      const y = (i % 13) * 0.51;
      const n = valueNoise(x, y, 99);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      expect(valueNoise(x, y, 99)).toBe(n);
    }
  });

  it('is low-frequency: closely-spaced samples differ less on average than lattice-spaced ones', () => {
    const N = 40;
    let near = 0;
    let far = 0;
    for (let i = 0; i < N; i += 1) {
      near += Math.abs(valueNoise(i * 0.16, 0, 7) - valueNoise((i + 1) * 0.16, 0, 7));
      far += Math.abs(valueNoise(i, 0, 7) - valueNoise(i + 1, 0, 7));
    }
    expect(near / N).toBeLessThan(far / N);
  });
});

describe('opened2x2 (morphological 2x2 opening)', () => {
  it('keeps a cell that belongs to a fully-on 2x2 block', () => {
    // A 2x2 on-block at (5,5)-(6,6); every corner of it survives the opening.
    const isOn = (c: number, r: number): boolean => c >= 5 && c <= 6 && r >= 5 && r <= 6;
    for (const [c, r] of [[5, 5], [6, 5], [5, 6], [6, 6]] as const) expect(opened2x2(isOn, c, r)).toBe(true);
    expect(opened2x2(isOn, 4, 5)).toBe(false); // a neighbour outside the block is off
  });

  it('removes a 1-wide feature (no fully-on 2x2 block survives)', () => {
    const verticalLine = (c: number, _r: number): boolean => c === 3; // 1-wide column
    for (let r = 0; r < 10; r += 1) expect(opened2x2(verticalLine, 3, r)).toBe(false);
    const single = (c: number, r: number): boolean => c === 2 && r === 2; // isolated cell
    expect(opened2x2(single, 2, 2)).toBe(false);
  });
});

describe('overlayFor (edge-tile rule resolver, kind-agnostic)', () => {
  const none = { n: false, e: false, s: false, w: false, nw: false, ne: false, se: false, sw: false };

  it('no other-kind neighbours -> null', () => {
    expect(overlayFor(none)).toBeNull();
  });

  it('a single cardinal -> the matching edge', () => {
    expect(overlayFor({ ...none, n: true })).toBe('edgeN');
    expect(overlayFor({ ...none, e: true })).toBe('edgeE');
    expect(overlayFor({ ...none, s: true })).toBe('edgeS');
    expect(overlayFor({ ...none, w: true })).toBe('edgeW');
  });

  it('two adjacent cardinals -> the matching pair, beating the single edges', () => {
    expect(overlayFor({ ...none, w: true, n: true })).toBe('pairWN');
    expect(overlayFor({ ...none, n: true, e: true })).toBe('pairNE');
    expect(overlayFor({ ...none, e: true, s: true })).toBe('pairES');
    expect(overlayFor({ ...none, s: true, w: true })).toBe('pairSW');
  });

  it('a single diagonal -> the matching corner', () => {
    expect(overlayFor({ ...none, nw: true })).toBe('cornerNW');
    expect(overlayFor({ ...none, ne: true })).toBe('cornerNE');
    expect(overlayFor({ ...none, se: true })).toBe('cornerSE');
    expect(overlayFor({ ...none, sw: true })).toBe('cornerSW');
  });

  it('priority: a cardinal beats a diagonal; a pair beats everything', () => {
    expect(overlayFor({ ...none, n: true, nw: true })).toBe('edgeN'); // cardinal > diagonal
    expect(overlayFor({ ...none, w: true, n: true, nw: true, ne: true })).toBe('pairWN'); // pair wins
  });
});

describe('scatterDecal (one-per-slot decal placement)', () => {
  const SEED = 9001;
  const OPTS = { slot: 3, density: 0.8, cluster: 0.35, scale: 0.3 };
  // A single-tile decal, an L-shaped (non-rectangular) decal, and a 2x2 decal — each with distinct frames.
  const SHAPES: LeafShape[] = [
    [{ dx: 0, dy: 0, frame: 10 }],
    [
      { dx: 0, dy: 0, frame: 20 },
      { dx: 1, dy: 0, frame: 21 },
      { dx: 0, dy: 1, frame: 22 },
    ],
    [
      { dx: 0, dy: 0, frame: 30 },
      { dx: 1, dy: 0, frame: 31 },
      { dx: 0, dy: 1, frame: 32 },
      { dx: 1, dy: 1, frame: 33 },
    ],
  ];
  const FRAMES = new Set([10, 20, 21, 22, 30, 31, 32, 33]);
  const all = (): boolean => true;

  it('returns null everywhere when there are no shapes (inert until shapes are provided)', () => {
    for (let r = 0; r < 20; r += 1)
      for (let c = 0; c < 20; c += 1) expect(scatterDecal(c, r, SEED, [], all, OPTS)).toBeNull();
  });

  it('is deterministic for a given (col,row,seed,shapes)', () => {
    for (let r = 0; r < 30; r += 1)
      for (let c = 0; c < 30; c += 1)
        expect(scatterDecal(c, r, SEED, SHAPES, all, OPTS)).toBe(scatterDecal(c, r, SEED, SHAPES, all, OPTS));
  });

  it('only ever returns a frame that belongs to one of the provided shapes', () => {
    for (let r = -10; r < 50; r += 1)
      for (let c = -10; c < 50; c += 1) {
        const f = scatterDecal(c, r, SEED, SHAPES, all, OPTS);
        if (f !== null) expect(FRAMES.has(f)).toBe(true);
      }
  });

  it('places a decal ONLY where the allow-predicate holds for its whole footprint', () => {
    // allow = only the left half of the plane. No decal tile may land on a disallowed cell.
    const leftHalf = (c: number, _r: number): boolean => c < 20;
    for (let r = -10; r < 50; r += 1)
      for (let c = -10; c < 50; c += 1)
        if (scatterDecal(c, r, SEED, SHAPES, leftHalf, OPTS) !== null) expect(leftHalf(c, r)).toBe(true);
  });

  it('places a multi-tile decal as a COMPLETE footprint, never overlapping', () => {
    // frame 30 is the (0,0) tile of the 2x2 shape, so a cell showing 30 is that decal's anchor; its three
    // siblings must be intact — and because slots are disjoint, no other decal overwrites them.
    let checked = false;
    for (let r = 0; r < 120 && !checked; r += 1)
      for (let c = 0; c < 120 && !checked; c += 1) {
        if (scatterDecal(c, r, SEED, SHAPES, all, OPTS) !== 30) continue;
        checked = true;
        expect(scatterDecal(c + 1, r, SEED, SHAPES, all, OPTS)).toBe(31);
        expect(scatterDecal(c, r + 1, SEED, SHAPES, all, OPTS)).toBe(32);
        expect(scatterDecal(c + 1, r + 1, SEED, SHAPES, all, OPTS)).toBe(33);
      }
    expect(checked).toBe(true); // sanity: the 2x2 decal does get placed somewhere
  });

  it('is a clustered minority, not a blanket: some placed, but far from every cell', () => {
    const SIZE = 60;
    let placed = 0;
    for (let r = 0; r < SIZE; r += 1)
      for (let c = 0; c < SIZE; c += 1) if (scatterDecal(c, r, SEED, SHAPES, all, OPTS) !== null) placed += 1;
    expect(placed).toBeGreaterThan(0);
    expect(placed).toBeLessThan(SIZE * SIZE);
  });
});
