import { describe, it, expect } from 'vitest';
import { terrainTile, valueNoise, TERRAIN_VARIANTS } from '@core/index';

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

  it('is deterministic: identical (col,row,seed) yields the identical tile', () => {
    for (let r = 0; r < 20; r += 1) {
      for (let c = 0; c < 20; c += 1) {
        expect(terrainTile(c, r, SEED)).toEqual(terrainTile(c, r, SEED));
      }
    }
  });

  it('a different seed changes at least some of the field', () => {
    let differences = 0;
    for (let r = 0; r < 20; r += 1) {
      for (let c = 0; c < 20; c += 1) {
        const a = terrainTile(c, r, SEED);
        const b = terrainTile(c, r, SEED + 1);
        if (a.kind !== b.kind || a.variant !== b.variant) differences += 1;
      }
    }
    expect(differences).toBeGreaterThan(0);
  });

  it('variant is always within the kind bounds', () => {
    for (let r = 0; r < 30; r += 1) {
      for (let c = 0; c < 30; c += 1) {
        const t = terrainTile(c, r, SEED);
        expect(t.variant).toBeGreaterThanOrEqual(0);
        expect(t.variant).toBeLessThan(TERRAIN_VARIANTS[t.kind]);
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
        if (terrainTile(c, r, SEED).kind === terrainTile(c + 1, r, SEED).kind) same += 1;
      }
    }
    expect(same / total).toBeGreaterThan(0.8); // coherent regions, not white noise
  });

  it('is mostly grass with some dirt (a non-zero minority)', () => {
    const SIZE = 80;
    let dirt = 0;
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (terrainTile(c, r, SEED).kind === 'dirt') dirt += 1;
      }
    }
    const frac = dirt / (SIZE * SIZE);
    expect(frac).toBeGreaterThan(0.02);
    expect(frac).toBeLessThan(0.5);
  });
});
