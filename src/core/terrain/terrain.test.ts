import { describe, it, expect } from 'vitest';
import { terrainTile, terrainKind, terrainOverlay, overlayFor, terrainLeaf, valueNoise } from '@core/index';

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

describe('terrainTile', () => {
  const SEED = 1234;
  const VARIANT_COUNTS = { grass: 2, dirt: 4 }; // the renderer derives these from its fill-frame list lengths

  it('is deterministic: identical (col,row,seed) yields the identical tile', () => {
    for (let r = 0; r < 20; r += 1) {
      for (let c = 0; c < 20; c += 1) {
        expect(terrainTile(c, r, SEED, VARIANT_COUNTS)).toEqual(terrainTile(c, r, SEED, VARIANT_COUNTS));
      }
    }
  });

  it('a different seed changes at least some of the field', () => {
    let differences = 0;
    for (let r = 0; r < 20; r += 1) {
      for (let c = 0; c < 20; c += 1) {
        const a = terrainTile(c, r, SEED, VARIANT_COUNTS);
        const b = terrainTile(c, r, SEED + 1, VARIANT_COUNTS);
        if (a.kind !== b.kind || a.variant !== b.variant) differences += 1;
      }
    }
    expect(differences).toBeGreaterThan(0);
  });

  it('variant is always within the kind bounds', () => {
    for (let r = 0; r < 30; r += 1) {
      for (let c = 0; c < 30; c += 1) {
        const t = terrainTile(c, r, SEED, VARIANT_COUNTS);
        expect(t.variant).toBeGreaterThanOrEqual(0);
        expect(t.variant).toBeLessThan(VARIANT_COUNTS[t.kind]);
      }
    }
  });

  it('produces COHERENT patches: horizontal neighbours share a kind far more often than not', () => {
    const SIZE = 60;
    let same = 0;
    let total = 0;
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE - 1; c += 1) {
        total += 1;
        if (terrainTile(c, r, SEED, VARIANT_COUNTS).kind === terrainTile(c + 1, r, SEED, VARIANT_COUNTS).kind)
          same += 1;
      }
    }
    expect(same / total).toBeGreaterThan(0.8); // coherent regions, not white noise
  });

  it('is mostly grass with some dirt (a non-zero minority)', () => {
    const SIZE = 80;
    let dirt = 0;
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (terrainTile(c, r, SEED, VARIANT_COUNTS).kind === 'dirt') dirt += 1;
      }
    }
    const frac = dirt / (SIZE * SIZE);
    expect(frac).toBeGreaterThan(0.02);
    expect(frac).toBeLessThan(0.5);
  });
});

describe('overlayFor (edge-tile rule resolver)', () => {
  const none = { n: false, e: false, s: false, w: false, nw: false, ne: false, se: false, sw: false };

  it('no grass neighbours -> null', () => {
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

describe('terrainOverlay + min-2-thickness dirt', () => {
  const SEED = 4242;

  it('overlays only on dirt: grass cells are null, and any overlay implies a dirt cell', () => {
    for (let r = 0; r < 40; r += 1) {
      for (let c = 0; c < 40; c += 1) {
        if (terrainKind(c, r, SEED) === 'grass') expect(terrainOverlay(c, r, SEED)).toBeNull();
        if (terrainOverlay(c, r, SEED) !== null) expect(terrainKind(c, r, SEED)).toBe('dirt');
      }
    }
  });

  it('every dirt cell is >=2 thick: never grass on both opposite cardinals (keeps the overlay rules complete)', () => {
    const g = (c: number, r: number): boolean => terrainKind(c, r, SEED) === 'grass';
    for (let r = -5; r < 45; r += 1) {
      for (let c = -5; c < 45; c += 1) {
        if (terrainKind(c, r, SEED) !== 'dirt') continue;
        expect(g(c - 1, r) && g(c + 1, r)).toBe(false); // not 1-wide (grass on W and E)
        expect(g(c, r - 1) && g(c, r + 1)).toBe(false); // not 1-high (grass on N and S)
      }
    }
  });

  it('is NOT 2x2-quantized: some even-aligned 2x2 block is mixed (boundaries keep per-cell resolution)', () => {
    let mixed = false;
    for (let bj = 0; bj < 40 && !mixed; bj += 1) {
      for (let bi = 0; bi < 40 && !mixed; bi += 1) {
        const k = terrainKind(2 * bi, 2 * bj, SEED);
        if (
          terrainKind(2 * bi + 1, 2 * bj, SEED) !== k ||
          terrainKind(2 * bi, 2 * bj + 1, SEED) !== k ||
          terrainKind(2 * bi + 1, 2 * bj + 1, SEED) !== k
        ) {
          mixed = true;
        }
      }
    }
    expect(mixed).toBe(true);
  });

  it('is deterministic for a given (col,row,seed)', () => {
    expect(terrainOverlay(7, 3, SEED)).toBe(terrainOverlay(7, 3, SEED));
    expect(terrainOverlay(8, 8, SEED)).toBe(terrainOverlay(8, 8, SEED));
  });
});

describe('terrainLeaf (grass-leaf foliage decals)', () => {
  const SEED = 9001;
  // A single-tile decal, an L-shaped (non-rectangular) decal, and a 2x2 decal — each with distinct frames.
  const SHAPES = [
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

  it('returns null everywhere when there are no shapes (inert until shapes are provided)', () => {
    for (let r = 0; r < 20; r += 1)
      for (let c = 0; c < 20; c += 1) expect(terrainLeaf(c, r, SEED, [])).toBeNull();
  });

  it('is deterministic for a given (col,row,seed,shapes)', () => {
    for (let r = 0; r < 30; r += 1)
      for (let c = 0; c < 30; c += 1)
        expect(terrainLeaf(c, r, SEED, SHAPES)).toBe(terrainLeaf(c, r, SEED, SHAPES));
  });

  it('only ever returns a frame that belongs to one of the provided shapes', () => {
    for (let r = -10; r < 50; r += 1)
      for (let c = -10; c < 50; c += 1) {
        const f = terrainLeaf(c, r, SEED, SHAPES);
        if (f !== null) expect(FRAMES.has(f)).toBe(true);
      }
  });

  it('places decals ONLY on grass (every leaf cell is a grass cell)', () => {
    for (let r = -10; r < 50; r += 1)
      for (let c = -10; c < 50; c += 1)
        if (terrainLeaf(c, r, SEED, SHAPES) !== null) expect(terrainKind(c, r, SEED)).toBe('grass');
  });

  it('places a multi-tile decal as a COMPLETE footprint (no partial decals)', () => {
    // frame 30 is the top-left (dx0,dy0) tile of the 2x2 shape, so a cell showing 30 is that decal's anchor;
    // its three siblings must therefore be the other corners, intact.
    let checked = false;
    for (let r = 0; r < 120 && !checked; r += 1)
      for (let c = 0; c < 120 && !checked; c += 1) {
        if (terrainLeaf(c, r, SEED, SHAPES) !== 30) continue;
        checked = true;
        expect(terrainLeaf(c + 1, r, SEED, SHAPES)).toBe(31);
        expect(terrainLeaf(c, r + 1, SEED, SHAPES)).toBe(32);
        expect(terrainLeaf(c + 1, r + 1, SEED, SHAPES)).toBe(33);
      }
    expect(checked).toBe(true); // sanity: the 2x2 decal does get placed somewhere
  });

  it('leaves are a clustered minority of grass: some placed, but not blanketing every grass cell', () => {
    const SIZE = 60;
    let grass = 0;
    let leaves = 0;
    for (let r = 0; r < SIZE; r += 1)
      for (let c = 0; c < SIZE; c += 1) {
        if (terrainKind(c, r, SEED) === 'grass') grass += 1;
        if (terrainLeaf(c, r, SEED, SHAPES) !== null) leaves += 1;
      }
    expect(leaves).toBeGreaterThan(0);
    expect(leaves).toBeLessThan(grass);
  });
});
