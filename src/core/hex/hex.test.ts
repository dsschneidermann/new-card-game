import { describe, it, expect } from 'vitest';
import {
  advance,
  createWorld,
  HexGrid,
  HexPosition,
  makeMovementSystem,
  findPath,
  neighbors,
  hexDistance,
  hexToPixel,
  pixelToHex,
  offsetToAxial,
  type Hex,
  type HexLayout,
  type GameEvent,
} from '@core/index';

const LAYOUT: HexLayout = { width: 32, height: 24, rowPitch: 18, originX: 24, originY: 28 };

describe('hex coordinates', () => {
  it('neighbors are the six axial directions in fixed order; distance is cube distance', () => {
    expect(neighbors({ q: 0, r: 0 })).toEqual([
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ]);
    for (const nb of neighbors({ q: 2, r: -1 })) expect(hexDistance({ q: 2, r: -1 }, nb)).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: 0 })).toBe(3);
    expect(hexDistance({ q: 0, r: 0 }, { q: -2, r: 1 })).toBe(2);
  });
});

describe('hex <-> pixel layout', () => {
  it('hexToPixel then pixelToHex round-trips for every cell centre', () => {
    const grid = new HexGrid(8, 8);
    for (const hex of grid.cells()) {
      const p = hexToPixel(LAYOUT, hex);
      expect(pixelToHex(LAYOUT, p.x, p.y)).toEqual(hex);
    }
  });

  it('a point inside a hex maps to that hex', () => {
    const hex: Hex = offsetToAxial({ col: 3, row: 4 });
    const c = hexToPixel(LAYOUT, hex);
    expect(pixelToHex(LAYOUT, c.x + 3, c.y - 2)).toEqual(hex);
    expect(pixelToHex(LAYOUT, c.x - 4, c.y + 2)).toEqual(hex);
  });

  it('pixelToHex returns the drawn hex containing the point, accurate near edges', () => {
    const hex: Hex = offsetToAxial({ col: 4, row: 4 });
    const c = hexToPixel(LAYOUT, hex);
    // Just inside the right shoulder: inside the drawn hex, though a neighbour's
    // centre is Euclidean-closer (a nearest-centre lookup would mis-assign this).
    expect(pixelToHex(LAYOUT, c.x + 14, c.y - 6)).toEqual(hex);
    // Clearly across the upper-right edge -> a different hex.
    expect(pixelToHex(LAYOUT, c.x + 20, c.y - 12)).not.toEqual(hex);
  });
});

describe('HexGrid', () => {
  it('inBounds respects cols x rows; walkableNeighbors excludes OOB and blocked', () => {
    const grid = new HexGrid(4, 4);
    expect(grid.inBounds(offsetToAxial({ col: 0, row: 0 }))).toBe(true);
    expect(grid.inBounds(offsetToAxial({ col: 3, row: 3 }))).toBe(true);
    expect(grid.inBounds(offsetToAxial({ col: -1, row: 0 }))).toBe(false);
    expect(grid.inBounds(offsetToAxial({ col: 4, row: 0 }))).toBe(false);

    const center = offsetToAxial({ col: 1, row: 1 });
    const before = grid.walkableNeighbors(center).length;
    const blockedNeighbor = grid.walkableNeighbors(center)[0] as Hex;
    grid.setWalkable(blockedNeighbor, false);
    expect(grid.walkableNeighbors(center).length).toBe(before - 1);
    expect(grid.walkableNeighbors(center)).not.toContainEqual(blockedNeighbor);
  });
});

describe('findPath (BFS)', () => {
  it('returns a contiguous neighbour route of length distance+1 on an open grid', () => {
    const grid = new HexGrid(10, 10);
    const from = offsetToAxial({ col: 1, row: 1 });
    const to = offsetToAxial({ col: 7, row: 5 });
    const path = findPath(grid, from, to);
    expect(path.length).toBe(hexDistance(from, to) + 1);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    for (let i = 1; i < path.length; i += 1) {
      expect(hexDistance(path[i - 1] as Hex, path[i] as Hex)).toBe(1);
    }
  });

  it('returns [] when unreachable or OOB; [from] when from == to', () => {
    const grid = new HexGrid(5, 5);
    const from = offsetToAxial({ col: 0, row: 0 });
    expect(findPath(grid, from, from)).toEqual([from]);
    expect(findPath(grid, from, { q: 99, r: 99 })).toEqual([]);

    const target = offsetToAxial({ col: 2, row: 2 });
    for (const nb of neighbors(target)) grid.setWalkable(nb, false);
    expect(findPath(grid, from, target)).toEqual([]);
  });

  it('is deterministic for identical grid and endpoints', () => {
    const from = offsetToAxial({ col: 0, row: 0 });
    const to = offsetToAxial({ col: 6, row: 6 });
    expect(findPath(new HexGrid(8, 8), from, to)).toEqual(findPath(new HexGrid(8, 8), from, to));
  });
});

describe('movement system', () => {
  const stepped = (evs: readonly GameEvent[]): GameEvent[] =>
    evs.filter((e) => e.kind === 'EntityStepped');

  it('plans a MovePath and steps one hex per advance, emitting EntityStepped, clearing on arrival', () => {
    const grid = new HexGrid(8, 8);
    const world = createWorld(1);
    world.addSystem(makeMovementSystem(grid));
    const e = world.createEntity();
    const from = offsetToAxial({ col: 0, row: 0 });
    const to = offsetToAxial({ col: 3, row: 0 });
    world.store(HexPosition).add(e, { hex: from });

    const d = hexDistance(from, to);
    const events: GameEvent[] = [];
    events.push(...advance(world, [{ kind: 'MoveTo', entity: e, q: to.q, r: to.r }]));
    for (let i = 1; i < d; i += 1) events.push(...advance(world));

    expect((world.store(HexPosition).get(e) as { hex: Hex }).hex).toEqual(to);
    expect(stepped(events).length).toBe(d);
    expect(stepped(advance(world)).length).toBe(0); // arrived: nothing more
  });

  it('a MoveTo to a blocked or OOB hex causes no movement and no event', () => {
    const grid = new HexGrid(8, 8);
    const world = createWorld(1);
    world.addSystem(makeMovementSystem(grid));
    const e = world.createEntity();
    const from = offsetToAxial({ col: 2, row: 2 });
    world.store(HexPosition).add(e, { hex: from });

    const blocked = offsetToAxial({ col: 4, row: 2 });
    grid.setWalkable(blocked, false);
    expect(stepped(advance(world, [{ kind: 'MoveTo', entity: e, q: blocked.q, r: blocked.r }])).length).toBe(0);
    expect(stepped(advance(world, [{ kind: 'MoveTo', entity: e, q: 99, r: 99 }])).length).toBe(0);
    expect((world.store(HexPosition).get(e) as { hex: Hex }).hex).toEqual(from);
  });

  it('is deterministic: same grid + MoveTo + advances yields identical position and events', () => {
    const run = (): { pos: Hex; evs: GameEvent[] } => {
      const grid = new HexGrid(8, 8);
      const world = createWorld(7);
      world.addSystem(makeMovementSystem(grid));
      const e = world.createEntity();
      world.store(HexPosition).add(e, { hex: offsetToAxial({ col: 0, row: 0 }) });
      const to = offsetToAxial({ col: 5, row: 3 });
      const evs: GameEvent[] = [];
      evs.push(...advance(world, [{ kind: 'MoveTo', entity: e, q: to.q, r: to.r }]));
      for (let i = 0; i < 10; i += 1) evs.push(...advance(world));
      return { pos: (world.store(HexPosition).get(e) as { hex: Hex }).hex, evs };
    };
    const a = run();
    const b = run();
    expect(a.pos).toEqual(b.pos);
    expect(a.evs).toEqual(b.evs);
  });
});
