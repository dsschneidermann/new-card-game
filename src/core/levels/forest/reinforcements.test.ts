import { describe, it, expect } from 'vitest';
import { createWorld, type World } from '../../ecs/world';
import type { EntityId } from '../../ecs/entity';
import { HexGrid } from '../../hex/grid';
import { type Hex, hexKey } from '../../hex/hex';
import { offsetToAxial, axialToOffset } from '../../hex/layout';
import { HexPosition } from '../../hex/movement';
import { Enemy, Player } from '../../actors';
import { TurnState } from '../../turn/components';
import { spawnEnemy, ARCHETYPES } from '../../combat';
import {
  planForestReinforcements,
  reinforcementWaveSize,
  unlockedPool,
  offscreenRingHexes,
  FOREST_REINFORCEMENTS,
  type ReinforcementConfig,
  type ReinforcementSpawn,
} from './reinforcements';

// A 52x42 world (the forest size) so a centred player's off-screen ring sits fully in-bounds.
const COLS = 52;
const ROWS = 42;
const CENTER = offsetToAxial({ col: 26, row: 21 });

/** A world with a positioned player carrying TurnState at `round` — the minimum the planner reads. */
function makeWorld(seed: number, round: number, playerHex: Hex = CENTER): { world: World; player: EntityId } {
  const world = createWorld(seed);
  const player = world.createEntity();
  world.store(Player).add(player, { isPlayer: true });
  world.store(HexPosition).add(player, { hex: playerHex });
  world.store(TurnState).add(player, { phase: 'enemy', round, activeActor: player });
  return { world, player };
}

/** Realise a plan the way the renderer does — spawnEnemy per entry (spawnEnemy draws no rng, so order holds). */
function realise(world: World, plan: readonly ReinforcementSpawn[]): void {
  for (const { defId, hex } of plan) {
    const def = ARCHETYPES[defId];
    if (def !== undefined) spawnEnemy(world, def, hex);
  }
}

describe('reinforcementWaveSize', () => {
  it('is 0 before startRound, then ramps by one every waveGrowthEvery rounds, and PLATEAUS at maxWaveSize', () => {
    const cfg = FOREST_REINFORCEMENTS; // start 3, base 1, +1 every 2, max 4
    expect(reinforcementWaveSize(1, cfg)).toBe(0);
    expect(reinforcementWaveSize(2, cfg)).toBe(0);
    expect(reinforcementWaveSize(3, cfg)).toBe(1);
    expect(reinforcementWaveSize(4, cfg)).toBe(1);
    expect(reinforcementWaveSize(5, cfg)).toBe(2);
    expect(reinforcementWaveSize(7, cfg)).toBe(3);
    expect(reinforcementWaveSize(9, cfg)).toBe(4);
    // Plateau: never exceeds maxWaveSize however far the run goes.
    expect(reinforcementWaveSize(11, cfg)).toBe(4);
    expect(reinforcementWaveSize(99, cfg)).toBe(4);
  });
});

describe('unlockedPool', () => {
  it('widens the eligible pool at each tier and holds the full roster after the last tier (plateau)', () => {
    const cfg = FOREST_REINFORCEMENTS;
    expect(unlockedPool(1, cfg)).toEqual(['goblin', 'slime', 'orc']);
    expect(unlockedPool(4, cfg)).toEqual(['goblin', 'slime', 'orc']);
    expect(unlockedPool(5, cfg)).toContain('knight');
    expect(unlockedPool(9, cfg)).toContain('demon');
    expect(unlockedPool(13, cfg)).toContain('dragon');
    expect(unlockedPool(99, cfg)).toEqual(unlockedPool(13, cfg)); // holds the full roster (plateau)
  });

  it('is strictly non-shrinking as the round rises', () => {
    const cfg = FOREST_REINFORCEMENTS;
    let prev = 0;
    for (const round of [1, 5, 9, 13, 50]) {
      const size = unlockedPool(round, cfg).length;
      expect(size).toBeGreaterThanOrEqual(prev);
      prev = size;
    }
  });
});

describe('offscreenRingHexes', () => {
  it('returns the perimeter of the viewport box expanded by one ring, entirely OUTSIDE the visible viewport', () => {
    const ring = offscreenRingHexes(FOREST_REINFORCEMENTS, CENTER, COLS, ROWS);
    expect(ring.length).toBeGreaterThan(0);
    const { col: pc, row: pr } = axialToOffset(CENTER);
    const halfCols = Math.floor(FOREST_REINFORCEMENTS.viewCols / 2);
    const halfRows = Math.floor(FOREST_REINFORCEMENTS.viewRows / 2);
    // Visible viewport box (inclusive) the ring must sit entirely outside of.
    const winLeft = pc - halfCols;
    const winRight = pc + (FOREST_REINFORCEMENTS.viewCols - 1 - halfCols);
    const winTop = pr - halfRows;
    const winBottom = pr + (FOREST_REINFORCEMENTS.viewRows - 1 - halfRows);
    const cols = ring.map((h) => axialToOffset(h).col);
    const rows = ring.map((h) => axialToOffset(h).row);
    for (const h of ring) {
      const { col, row } = axialToOffset(h);
      const outside = col < winLeft || col > winRight || row < winTop || row > winBottom;
      expect(outside).toBe(true);
    }
    // Extent matches the viewport expanded by one ring on every side.
    expect(Math.max(...cols) - Math.min(...cols) + 1).toBe(FOREST_REINFORCEMENTS.viewCols + 2);
    expect(Math.max(...rows) - Math.min(...rows) + 1).toBe(FOREST_REINFORCEMENTS.viewRows + 2);
  });

  it('drops hexes that fall off the map near a world edge, but still yields a non-empty in-world ring', () => {
    const nearEdge = offsetToAxial({ col: 2, row: 2 });
    const ring = offscreenRingHexes(FOREST_REINFORCEMENTS, nearEdge, COLS, ROWS);
    expect(ring.length).toBeGreaterThan(0);
    for (const h of ring) {
      const { col, row } = axialToOffset(h);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThan(COLS);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(ROWS);
    }
  });
});

describe('planForestReinforcements', () => {
  it('plans NOTHING before startRound', () => {
    const { world } = makeWorld(1, 2); // round 2 < startRound 3
    expect(planForestReinforcements(world, new HexGrid(COLS, ROWS), FOREST_REINFORCEMENTS)).toHaveLength(0);
  });

  it('at startRound plans exactly one enemy, on a walkable off-screen ring hex, from the unlocked pool', () => {
    const grid = new HexGrid(COLS, ROWS);
    const { world } = makeWorld(2, 3); // round 3 -> wave size 1
    const plan = planForestReinforcements(world, grid, FOREST_REINFORCEMENTS);

    expect(plan).toHaveLength(1);
    const ring = new Set(offscreenRingHexes(FOREST_REINFORCEMENTS, CENTER, COLS, ROWS).map(hexKey));
    expect(ring.has(hexKey(plan[0]!.hex))).toBe(true);
    expect(grid.isWalkable(plan[0]!.hex)).toBe(true);
    expect(unlockedPool(3, FOREST_REINFORCEMENTS)).toContain(plan[0]!.defId);
  });

  it('plans a full growing wave at a later round, all on distinct valid ring hexes', () => {
    const grid = new HexGrid(COLS, ROWS);
    const { world } = makeWorld(3, 9); // round 9 -> wave size 4
    const plan = planForestReinforcements(world, grid, FOREST_REINFORCEMENTS);

    const keys = plan.map((p) => hexKey(p.hex));
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(4); // distinct hexes, no two share a tile
    const ring = new Set(offscreenRingHexes(FOREST_REINFORCEMENTS, CENTER, COLS, ROWS).map(hexKey));
    const pool = unlockedPool(9, FOREST_REINFORCEMENTS);
    for (const p of plan) {
      expect(ring.has(hexKey(p.hex))).toBe(true);
      expect(pool).toContain(p.defId);
    }
  });

  it('respects the global concurrent cap: no plan at the cap, only the remaining slots just below it', () => {
    const grid = new HexGrid(COLS, ROWS);
    const cfg: ReinforcementConfig = { ...FOREST_REINFORCEMENTS, maxConcurrent: 2 };

    // At the cap (2 living enemies placed inside the viewport, off the ring): the plan is empty.
    const atCap = makeWorld(4, 9);
    spawnEnemy(atCap.world, ARCHETYPES['goblin']!, offsetToAxial({ col: 24, row: 21 }));
    spawnEnemy(atCap.world, ARCHETYPES['goblin']!, offsetToAxial({ col: 28, row: 21 }));
    expect(planForestReinforcements(atCap.world, grid, cfg)).toHaveLength(0);

    // One below the cap: a wave of 4 clamps to the single remaining slot.
    const belowCap = makeWorld(5, 9);
    spawnEnemy(belowCap.world, ARCHETYPES['goblin']!, offsetToAxial({ col: 24, row: 21 }));
    expect(planForestReinforcements(belowCap.world, grid, cfg)).toHaveLength(1);
  });

  it('never plans a spawn on an occupied or non-walkable hex', () => {
    const grid = new HexGrid(COLS, ROWS);
    const ring = offscreenRingHexes(FOREST_REINFORCEMENTS, CENTER, COLS, ROWS);
    // Block half the ring (non-walkable) and occupy a quarter of it with a prop, leaving room for the wave.
    const blocked = new Set<string>();
    ring.forEach((h, i) => {
      if (i % 2 === 0) {
        grid.setWalkable(h, false);
        blocked.add(hexKey(h));
      }
    });
    const { world } = makeWorld(6, 9); // wave size 4
    const occupiedHex = ring.find((h, i) => i % 2 === 1)!; // a walkable ring hex we now occupy
    const prop = world.createEntity();
    world.store(HexPosition).add(prop, { hex: occupiedHex });
    blocked.add(hexKey(occupiedHex));

    for (const p of planForestReinforcements(world, grid, FOREST_REINFORCEMENTS)) {
      expect(grid.isWalkable(p.hex)).toBe(true);
      expect(blocked.has(hexKey(p.hex))).toBe(false);
    }
  });

  it('is deterministic: same seed + state replays an identical plan; a different seed differs', () => {
    const grid = new HexGrid(COLS, ROWS);
    const planFor = (seed: number): string[] => {
      const { world } = makeWorld(seed, 9);
      return planForestReinforcements(world, grid, FOREST_REINFORCEMENTS)
        .map((p) => `${p.defId}@${hexKey(p.hex)}`)
        .sort();
    };
    expect(planFor(42)).toEqual(planFor(42)); // replay-deterministic
    expect(planFor(42)).not.toEqual(planFor(7)); // a different seed produces a different wave
  });

  it('realises into real Enemy entities on the planned hexes (renderer parity)', () => {
    const grid = new HexGrid(COLS, ROWS);
    const { world } = makeWorld(8, 9);
    const plan = planForestReinforcements(world, grid, FOREST_REINFORCEMENTS);
    realise(world, plan);

    const placed = world.entitiesWith(Enemy).map((e) => hexKey(world.store(HexPosition).get(e)!.hex)).sort();
    expect(placed).toEqual(plan.map((p) => hexKey(p.hex)).sort());
  });
});
