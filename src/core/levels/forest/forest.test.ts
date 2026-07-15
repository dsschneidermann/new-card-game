import { describe, it, expect } from 'vitest';
import {
  forestTerrainKind,
  forestTerrainTile,
  forestOverlay,
  forestLeaf,
  forestHexTerrainClass,
  generateForestObstacles,
  generateForestChests,
  generateForestEnemies,
  forestStartHex,
  forestObjectVariantIndex,
  forestObjectFlipped,
  FOREST_OBJECTS,
  FOREST_COLS,
  FOREST_ROWS,
  FOREST_ENEMY_MIN,
  FOREST_ENEMY_MAX,
  ARCHETYPES,
  HexGrid,
  offsetToAxial,
  hexKey,
  hexDistance,
  type DecalShape,
} from '@core/index';
import { bakeObstacleFlags } from '@core/obstacles';

describe('forest terrain (grass/dirt fill)', () => {
  const SEED = 1234;
  const VARIANT_COUNTS = { grass: 2, dirt: 4 };

  it('forestTerrainTile is deterministic and keeps the variant within the kind bounds', () => {
    for (let r = 0; r < 30; r += 1)
      for (let c = 0; c < 30; c += 1) {
        const t = forestTerrainTile(c, r, SEED, VARIANT_COUNTS);
        expect(forestTerrainTile(c, r, SEED, VARIANT_COUNTS)).toEqual(t);
        expect(t.variant).toBeGreaterThanOrEqual(0);
        expect(t.variant).toBeLessThan(VARIANT_COUNTS[t.kind]);
      }
  });

  it('produces coherent patches that are mostly grass with a non-zero dirt minority', () => {
    const SIZE = 70;
    let same = 0;
    let total = 0;
    let dirt = 0;
    for (let r = 0; r < SIZE; r += 1)
      for (let c = 0; c < SIZE; c += 1) {
        if (forestTerrainKind(c, r, SEED) === 'dirt') dirt += 1;
        if (c < SIZE - 1) {
          total += 1;
          if (forestTerrainKind(c, r, SEED) === forestTerrainKind(c + 1, r, SEED)) same += 1;
        }
      }
    expect(same / total).toBeGreaterThan(0.8); // coherent regions, not white noise
    const frac = dirt / (SIZE * SIZE);
    expect(frac).toBeGreaterThan(0.02);
    expect(frac).toBeLessThan(0.5);
  });
});

describe('forestOverlay (grass-edge auto-tiling)', () => {
  const SEED = 4242;

  it('overlays only on dirt (a grass cell is null), and is deterministic', () => {
    for (let r = 0; r < 40; r += 1)
      for (let c = 0; c < 40; c += 1) {
        if (forestTerrainKind(c, r, SEED) === 'grass') expect(forestOverlay(c, r, SEED)).toBeNull();
        if (forestOverlay(c, r, SEED) !== null) expect(forestTerrainKind(c, r, SEED)).toBe('dirt');
        expect(forestOverlay(c, r, SEED)).toBe(forestOverlay(c, r, SEED));
      }
  });

  it('every dirt cell is >=2 thick (never grass on both opposite cardinals), so the rule set stays complete', () => {
    const g = (c: number, r: number): boolean => forestTerrainKind(c, r, SEED) === 'grass';
    for (let r = -5; r < 45; r += 1)
      for (let c = -5; c < 45; c += 1) {
        if (forestTerrainKind(c, r, SEED) !== 'dirt') continue;
        expect(g(c - 1, r) && g(c + 1, r)).toBe(false);
        expect(g(c, r - 1) && g(c, r + 1)).toBe(false);
      }
  });
});

describe('forestLeaf (grass-leaf foliage)', () => {
  const SEED = 9001;
  const SHAPES: DecalShape[] = [
    [{ dx: 0, dy: 0, frame: 10 }],
    [
      { dx: 0, dy: 0, frame: 30 },
      { dx: 1, dy: 0, frame: 31 },
      { dx: 0, dy: 1, frame: 32 },
      { dx: 1, dy: 1, frame: 33 },
    ],
  ];

  it('places decals only on grass and is deterministic', () => {
    for (let r = -10; r < 50; r += 1)
      for (let c = -10; c < 50; c += 1) {
        const f = forestLeaf(c, r, SEED, SHAPES);
        expect(forestLeaf(c, r, SEED, SHAPES)).toBe(f);
        if (f !== null) expect(forestTerrainKind(c, r, SEED)).toBe('grass');
      }
  });

  it('is inert with no shapes', () => {
    for (let r = 0; r < 20; r += 1) for (let c = 0; c < 20; c += 1) expect(forestLeaf(c, r, SEED, [])).toBeNull();
  });
});

describe('forest placement generation', () => {
  const grid = (): HexGrid => new HexGrid(FOREST_COLS, FOREST_ROWS);

  it('forestStartHex is in-bounds and walkable', () => {
    expect(grid().inBounds(forestStartHex)).toBe(true);
    expect(grid().isWalkable(forestStartHex)).toBe(true);
  });

  it('generateForestObstacles is deterministic, in-bounds, and keeps the start clear', () => {
    const a = generateForestObstacles(777);
    const b = generateForestObstacles(777);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    const g = grid();
    const startKey = hexKey(forestStartHex);
    for (const o of a) {
      expect(g.inBounds(o.hex)).toBe(true);
      expect(['tall', 'low', 'none']).toContain(o.kind); // 'none' = non-blocking visual decal
      expect(hexKey(o.hex)).not.toBe(startKey);
      expect(hexDistance(o.hex, forestStartHex)).toBeGreaterThan(3); // START_CLEAR_RADIUS
    }
  });

  it('applying the generated obstacles sets walkability/sight per kind and leaves the start walkable', () => {
    const g = grid();
    const obstacles = generateForestObstacles(777);
    bakeObstacleFlags(g, obstacles);
    for (const o of obstacles) {
      expect(g.isWalkable(o.hex)).toBe(o.kind === 'none'); // only 'none' decals stay walkable; tall/low block move
      expect(g.blocksSight(o.hex)).toBe(o.kind === 'tall');
    }
    expect(g.isWalkable(forestStartHex)).toBe(true);
  });

  it('generateForestChests is deterministic, in-bounds, walkable (clear of obstacles + start), and distinct', () => {
    const obstacles = generateForestObstacles(777);
    const a = generateForestChests(777, obstacles);
    const b = generateForestChests(777, obstacles);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    const g = grid();
    bakeObstacleFlags(g, obstacles);
    const seen = new Set<string>();
    const blocked = new Set(obstacles.map((o) => hexKey(o.hex)));
    for (const c of a) {
      expect(g.inBounds(c.hex)).toBe(true);
      expect(g.isWalkable(c.hex)).toBe(true); // not on an obstacle
      expect(blocked.has(hexKey(c.hex))).toBe(false);
      expect(hexKey(c.hex)).not.toBe(hexKey(forestStartHex));
      expect(seen.has(hexKey(c.hex))).toBe(false); // distinct
      seen.add(hexKey(c.hex));
    }
  });

  // Defense & Shielding: the blocked set the renderer passes (obstacles + chests + the start hex).
  const blockedFor = (seed: number): Set<string> => {
    const obstacles = generateForestObstacles(seed);
    const chests = generateForestChests(seed, obstacles);
    return new Set<string>([
      ...obstacles.map((o) => hexKey(o.hex)),
      ...chests.map((c) => hexKey(c.hex)),
      hexKey(forestStartHex),
    ]);
  };
  const FOREST_ENEMY_POOL = ['goblin', 'slime', 'orc'];

  it('generateForestEnemies is deterministic, sized in [MIN,MAX], off blocked hexes, clear of start, distinct, from the pool', () => {
    const seed = 777;
    const blocked = blockedFor(seed);
    const a = generateForestEnemies(seed, blocked);
    const b = generateForestEnemies(seed, blocked);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(FOREST_ENEMY_MIN);
    expect(a.length).toBeLessThanOrEqual(FOREST_ENEMY_MAX);
    const g = grid();
    const seen = new Set<string>();
    for (const e of a) {
      expect(g.inBounds(e.hex)).toBe(true);
      expect(blocked.has(hexKey(e.hex))).toBe(false); // never on an obstacle / chest / start
      expect(hexDistance(e.hex, forestStartHex)).toBeGreaterThan(6); // ENEMY_CLEAR_RADIUS
      expect(seen.has(hexKey(e.hex))).toBe(false); // distinct
      seen.add(hexKey(e.hex));
      expect(FOREST_ENEMY_POOL).toContain(e.defId); // forest-tier pool
      expect(ARCHETYPES[e.defId]).toBeDefined(); // a real archetype
    }
  });

  it('places enemies off blocked hexes across several seeds', () => {
    for (const seed of [1, 42, 1000, 99999]) {
      const blocked = blockedFor(seed);
      for (const e of generateForestEnemies(seed, blocked)) {
        expect(blocked.has(hexKey(e.hex))).toBe(false);
      }
    }
  });
});

describe('forest object placement (registry-driven)', () => {
  const SEEDS = [1, 42, 777, 1000, 99999, 314159];
  const knownIds = new Set(FOREST_OBJECTS.map((d) => d.id));
  const defOf = (id: string) => FOREST_OBJECTS.find((d) => d.id === id)!;

  it('every spawn carries a known object variant whose kind matches its def', () => {
    for (const seed of SEEDS)
      for (const o of generateForestObstacles(seed)) {
        expect(knownIds.has(o.variant)).toBe(true);
        expect(o.kind).toBe(defOf(o.variant).kind);
      }
  });

  it('honours each object terrain constraint (dirt-only sits on dirt, grass-only on grass)', () => {
    for (const seed of SEEDS)
      for (const o of generateForestObstacles(seed)) {
        const def = defOf(o.variant);
        if (def.terrain === 'any') continue;
        expect(forestHexTerrainClass(o.hex, seed)).toBe(def.terrain);
      }
  });

  it('never places two objects on the same hex', () => {
    for (const seed of SEEDS) {
      const seen = new Set<string>();
      for (const o of generateForestObstacles(seed)) {
        expect(seen.has(hexKey(o.hex))).toBe(false);
        seen.add(hexKey(o.hex));
      }
    }
  });

  it('places 1..4 ruins per run (count min/max), each on cleanly-grass ground', () => {
    for (const seed of SEEDS) {
      const ruins = generateForestObstacles(seed).filter((o) => o.variant === 'ruins');
      expect(ruins.length).toBeGreaterThanOrEqual(1);
      expect(ruins.length).toBeLessThanOrEqual(4);
      for (const r of ruins) expect(forestHexTerrainClass(r.hex, seed)).toBe('grass');
    }
  });

  it('reaches placement for the density objects incl. the dirt-only rock across seeds', () => {
    const placed = new Set<string>();
    for (const seed of SEEDS) for (const o of generateForestObstacles(seed)) placed.add(o.variant);
    for (const id of ['tall_grass', 'low_grass', 'low_dirt']) expect(placed.has(id)).toBe(true);
  });

  it('forestHexTerrainClass yields grass, dirt, and mixed across the map, deterministically', () => {
    const classes = new Set<string>();
    outer: for (const seed of SEEDS)
      for (let row = 0; row < FOREST_ROWS; row += 1)
        for (let col = 0; col < FOREST_COLS; col += 1) {
          const hex = offsetToAxial({ col, row });
          const c = forestHexTerrainClass(hex, seed);
          expect(forestHexTerrainClass(hex, seed)).toBe(c); // deterministic
          classes.add(c);
          if (classes.size === 3) break outer;
        }
    expect(classes.has('grass')).toBe(true);
    expect(classes.has('dirt')).toBe(true);
    expect(classes.has('mixed')).toBe(true);
  });

  it('cosmetic variant/flip derivations are deterministic and in range', () => {
    const SEED = 777;
    for (let row = 0; row < 20; row += 1)
      for (let col = 0; col < 20; col += 1) {
        const hex = offsetToAxial({ col, row });
        const idx = forestObjectVariantIndex(hex, SEED, 2);
        expect(forestObjectVariantIndex(hex, SEED, 2)).toBe(idx); // deterministic
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(2);
        expect(forestObjectVariantIndex(hex, SEED, 1)).toBe(0); // single-variant object -> always 0
        expect(forestObjectFlipped(hex, SEED)).toBe(forestObjectFlipped(hex, SEED)); // deterministic
      }
  });
});
