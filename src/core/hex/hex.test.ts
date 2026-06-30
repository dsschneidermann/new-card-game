import { describe, it, expect } from 'vitest';
import {
  advance,
  createWorld,
  HexGrid,
  HexPosition,
  FacingState,
  makeMovementSystem,
  findPath,
  hexesReachable,
  hexKey,
  neighbors,
  hexDistance,
  hexToPixel,
  pixelToHex,
  offsetToAxial,
  worldPixelBounds,
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

  it('hugs the straight line for a vertical move (no all-one-direction detour)', () => {
    const grid = new HexGrid(12, 12);
    const start = offsetToAxial({ col: 5, row: 8 }); // even row
    const goal = offsetToAxial({ col: 5, row: 0 }); // same column directly above
    const path = findPath(grid, start, goal);
    expect(path.length).toBe(hexDistance(start, goal) + 1); // still shortest
    // Every hop stays within one hex-width/2 of the vertical line through start.
    const sx = hexToPixel(LAYOUT, start).x;
    for (const h of path) {
      expect(Math.abs(hexToPixel(LAYOUT, h).x - sx)).toBeLessThanOrEqual(LAYOUT.width / 2);
    }
  });

  it('reroutes around a tall obstacle — a longer path is still found, never through blocked hexes', () => {
    const grid = new HexGrid(12, 12);
    const from = offsetToAxial({ col: 2, row: 6 });
    const to = offsetToAxial({ col: 9, row: 6 });
    // A tall obstacle down column 5 with a single gap at row 0 forces a detour over the top.
    for (let row = 1; row < 12; row += 1) grid.setWalkable(offsetToAxial({ col: 5, row }), false);
    const path = findPath(grid, from, to);
    expect(path.length).toBeGreaterThan(0); // reachable via the gap
    expect(path.length).toBeGreaterThan(hexDistance(from, to) + 1); // had to detour
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    for (let i = 0; i < path.length; i += 1) {
      expect(grid.isWalkable(path[i] as Hex)).toBe(true); // never routes through the tall obstacle
      if (i > 0) expect(hexDistance(path[i - 1] as Hex, path[i] as Hex)).toBe(1); // contiguous
    }
  });

  it('routes around a `blocked` wall (longer path) and never steps onto a blocked hex', () => {
    const grid = new HexGrid(12, 12);
    const from = offsetToAxial({ col: 2, row: 6 });
    const to = offsetToAxial({ col: 9, row: 6 });
    // The same column-5 wall as the tall-obstacle case, but expressed via the dynamic blocked SET (e.g. enemies)
    // rather than grid walkability — a single gap at row 0 forces a detour over the top.
    const blocked = new Set<string>();
    for (let row = 1; row < 12; row += 1) blocked.add(hexKey(offsetToAxial({ col: 5, row })));
    const path = findPath(grid, from, to, blocked);
    expect(path.length).toBeGreaterThan(hexDistance(from, to) + 1); // had to detour
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    for (const h of path) expect(blocked.has(hexKey(h))).toBe(false); // never through a blocked hex
  });

  it('returns [] when the destination is blocked — cannot stop ON a blocked hex', () => {
    const grid = new HexGrid(8, 8);
    const from = offsetToAxial({ col: 1, row: 1 });
    const to = offsetToAxial({ col: 4, row: 1 });
    expect(findPath(grid, from, to).length).toBeGreaterThan(0); // reachable when not blocked
    expect(findPath(grid, from, to, new Set([hexKey(to)]))).toEqual([]); // blocked destination
  });

  it('returns [] when blockers wall off the target (every approach blocked)', () => {
    const grid = new HexGrid(8, 8);
    const from = offsetToAxial({ col: 1, row: 1 });
    const to = offsetToAxial({ col: 4, row: 4 });
    const blocked = new Set(neighbors(to).map(hexKey)); // ring all six approaches; the target tile itself is open
    expect(findPath(grid, from, to, blocked)).toEqual([]);
  });

  it('never blocks the origin: a `blocked` set containing `from` still computes a route', () => {
    const grid = new HexGrid(8, 8);
    const from = offsetToAxial({ col: 1, row: 1 });
    const to = offsetToAxial({ col: 4, row: 1 });
    const path = findPath(grid, from, to, new Set([hexKey(from)]));
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
  });

  it('an empty `blocked` set is identical to passing none', () => {
    const grid = new HexGrid(10, 10);
    const from = offsetToAxial({ col: 1, row: 1 });
    const to = offsetToAxial({ col: 7, row: 5 });
    expect(findPath(grid, from, to, new Set())).toEqual(findPath(grid, from, to));
  });
});

describe('hexesReachable', () => {
  it('returns walkable hexes within N steps, excluding the origin, keyed for membership', () => {
    const grid = new HexGrid(8, 8);
    const from = offsetToAxial({ col: 3, row: 3 });
    const reach = hexesReachable(grid, from, 2);
    expect(reach.has(hexKey(from))).toBe(false); // origin excluded
    const nbrs = grid.walkableNeighbors(from);
    for (const n of nbrs) expect(reach.has(hexKey(n))).toBe(true); // each neighbour reachable
    expect(reach.size).toBeGreaterThan(nbrs.length); // includes some 2-step hexes
    for (const [k, hex] of reach) expect(hexKey(hex)).toBe(k); // value is the keyed Hex (for painting)
  });

  it('excludes obstacles/out-of-bounds; a blocked neighbour is unreachable; maxSteps 0 yields nothing', () => {
    const grid = new HexGrid(8, 8);
    const from = offsetToAxial({ col: 3, row: 3 });
    const obstacle = grid.walkableNeighbors(from)[0] as Hex;
    grid.setWalkable(obstacle, false);
    expect(hexesReachable(grid, from, 2).has(hexKey(obstacle))).toBe(false);
    expect(hexesReachable(grid, from, 0).size).toBe(0);
  });

  it('a `blocked` hex is excluded, and so is anything reachable only through it; other routes remain', () => {
    const grid = new HexGrid(10, 10);
    const from = offsetToAxial({ col: 3, row: 3 });
    const baseline = hexesReachable(grid, from, 2);
    const neighbour = grid.walkableNeighbors(from)[0] as Hex;
    const reach = hexesReachable(grid, from, 2, new Set([hexKey(neighbour)]));
    expect(reach.has(hexKey(neighbour))).toBe(false); // the blocked hex itself is unreachable
    expect(reach.size).toBeLessThan(baseline.size); // it (and anything only reachable through it) drop out
    const other = grid.walkableNeighbors(from)[1] as Hex;
    expect(reach.has(hexKey(other))).toBe(true); // an unblocked neighbour is still reachable
  });

  it('an empty `blocked` set is identical to passing none', () => {
    const grid = new HexGrid(8, 8);
    const from = offsetToAxial({ col: 3, row: 3 });
    expect([...hexesReachable(grid, from, 2, new Set()).keys()].sort()).toEqual(
      [...hexesReachable(grid, from, 2).keys()].sort(),
    );
  });
});

describe('movement system', () => {
  const stepped = (evs: readonly GameEvent[]): GameEvent[] =>
    evs.filter((e) => e.kind === 'EntityStepped');

  it('resolves a whole move in ONE advance: MovementStarted -> EntityStepped per hop -> MovementEnded, ending at the target', () => {
    const grid = new HexGrid(8, 8);
    const world = createWorld(1);
    world.addSystem(makeMovementSystem(grid, LAYOUT));
    const e = world.createEntity();
    const from = offsetToAxial({ col: 0, row: 0 });
    const to = offsetToAxial({ col: 3, row: 0 });
    world.store(HexPosition).add(e, { hex: from });
    const d = hexDistance(from, to);

    const events = advance(world, [{ kind: 'MoveTo', entity: e, q: to.q, r: to.r }]);
    const kinds = events.map((ev) => ev.kind);
    expect(kinds[0]).toBe('MovementStarted');
    expect(kinds[kinds.length - 1]).toBe('MovementEnded');
    expect(stepped(events).length).toBe(d); // one EntityStepped per hop, all in this single advance
    expect((world.store(HexPosition).get(e) as { hex: Hex }).hex).toEqual(to); // committed to the target now
    expect(stepped(advance(world)).length).toBe(0); // nothing carries to later advances
  });

  it('a single-hex move also resolves in one advance (the walk-anim case)', () => {
    const grid = new HexGrid(8, 8);
    const world = createWorld(1);
    world.addSystem(makeMovementSystem(grid, LAYOUT));
    const e = world.createEntity();
    const from = offsetToAxial({ col: 2, row: 2 });
    world.store(HexPosition).add(e, { hex: from });
    const adj = grid.walkableNeighbors(from)[0] as Hex;

    const events = advance(world, [{ kind: 'MoveTo', entity: e, q: adj.q, r: adj.r }]);
    expect(events.filter((ev) => ev.kind === 'MovementStarted')).toHaveLength(1);
    expect(stepped(events)).toHaveLength(1);
    expect(events.filter((ev) => ev.kind === 'MovementEnded')).toHaveLength(1);
    expect((world.store(HexPosition).get(e) as { hex: Hex }).hex).toEqual(adj);
  });

  it('a MoveTo to a blocked or OOB hex causes no movement and no event', () => {
    const grid = new HexGrid(8, 8);
    const world = createWorld(1);
    world.addSystem(makeMovementSystem(grid, LAYOUT));
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
      world.addSystem(makeMovementSystem(grid, LAYOUT));
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

  it('routes a mover around hexes from the injected blockersFor; no resolver leaves the straight path', () => {
    const grid = new HexGrid(10, 10);
    const from = offsetToAxial({ col: 1, row: 3 });
    const to = offsetToAxial({ col: 5, row: 3 });
    const mid = findPath(grid, from, to)[2] as Hex; // a hex partway along the straight (unblocked) route
    const startedPath = (evs: readonly GameEvent[]): readonly Hex[] =>
      (evs.find((e) => e.kind === 'MovementStarted') as { path: readonly Hex[] }).path;

    const blockedWorld = createWorld(1);
    blockedWorld.addSystem(makeMovementSystem(grid, LAYOUT, () => new Set([hexKey(mid)])));
    const a = blockedWorld.createEntity();
    blockedWorld.store(HexPosition).add(a, { hex: from });
    const blockedPath = startedPath(advance(blockedWorld, [{ kind: 'MoveTo', entity: a, q: to.q, r: to.r }]));
    expect(blockedPath.some((h) => hexKey(h) === hexKey(mid))).toBe(false); // detoured around the blocked hex
    expect((blockedWorld.store(HexPosition).get(a) as { hex: Hex }).hex).toEqual(to); // still reaches the target

    const openWorld = createWorld(1);
    openWorld.addSystem(makeMovementSystem(grid, LAYOUT)); // no resolver
    const b = openWorld.createEntity();
    openWorld.store(HexPosition).add(b, { hex: from });
    const openPath = startedPath(advance(openWorld, [{ kind: 'MoveTo', entity: b, q: to.q, r: to.r }]));
    expect(openPath.some((h) => hexKey(h) === hexKey(mid))).toBe(true); // unchanged: straight through the hex
  });
});

describe('facing (movement intent)', () => {
  it('sets facing once from the start->target intent and holds it across hops', () => {
    const grid = new HexGrid(12, 12);
    const world = createWorld(1);
    world.addSystem(makeMovementSystem(grid, LAYOUT));
    const e = world.createEntity();
    world.store(HexPosition).add(e, { hex: offsetToAxial({ col: 8, row: 6 }) });
    world.store(FacingState).add(e, { facing: 'right' });
    const target = offsetToAxial({ col: 2, row: 6 }); // to the left
    advance(world, [{ kind: 'MoveTo', entity: e, q: target.q, r: target.r }]);
    expect(world.store(FacingState).get(e)?.facing).toBe('left');
    for (let i = 0; i < 5; i += 1) advance(world);
    expect(world.store(FacingState).get(e)?.facing).toBe('left'); // unchanged across hops
  });

  it('keeps the previous facing for a same-column vertical move', () => {
    const grid = new HexGrid(12, 12);
    const world = createWorld(1);
    world.addSystem(makeMovementSystem(grid, LAYOUT));
    const e = world.createEntity();
    world.store(HexPosition).add(e, { hex: offsetToAxial({ col: 5, row: 8 }) });
    world.store(FacingState).add(e, { facing: 'left' });
    const target = offsetToAxial({ col: 5, row: 0 }); // directly above (dx == 0)
    advance(world, [{ kind: 'MoveTo', entity: e, q: target.q, r: target.r }]);
    expect(world.store(FacingState).get(e)?.facing).toBe('left'); // kept, not reset
  });
});

describe('worldPixelBounds (camera clamp extent)', () => {
  // LAYOUT: width 32, height 24, rowPitch 18, origin (24,28). hw=16, hh=12.
  it('spans from col0/row0 cell edges to the last cell edges (incl. the odd-row half-shift)', () => {
    const b = worldPixelBounds(LAYOUT, 52, 42);
    expect(b.minX).toBe(LAYOUT.originX - 16); // col 0 even-row left edge
    expect(b.minY).toBe(LAYOUT.originY - 12); // row 0 top edge
    // last col on an odd row: origin + 51*width + half-width (odd shift) + half-width (cell edge)
    expect(b.maxX).toBe(LAYOUT.originX + 51 * 32 + 16 + 16);
    expect(b.maxY).toBe(LAYOUT.originY + 41 * 18 + 12); // last row bottom edge
  });

  it('grows with the grid size on both axes', () => {
    const small = worldPixelBounds(LAYOUT, 26, 21);
    const big = worldPixelBounds(LAYOUT, 52, 42);
    expect(big.maxX - big.minX).toBeGreaterThan(small.maxX - small.minX);
    expect(big.maxY - big.minY).toBeGreaterThan(small.maxY - small.minY);
  });

  it('omits the odd-row shift for a single-row grid', () => {
    const oneRow = worldPixelBounds(LAYOUT, 10, 1);
    expect(oneRow.maxX).toBe(LAYOUT.originX + 9 * 32 + 16); // no odd-row half-shift, just the cell edge
  });

  it('every cell of a grid lies within its world pixel bounds', () => {
    const cols = 12;
    const rows = 10;
    const b = worldPixelBounds(LAYOUT, cols, rows);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const { x, y } = hexToPixel(LAYOUT, offsetToAxial({ col, row }));
        expect(x - 16).toBeGreaterThanOrEqual(b.minX); // cell left edge in-bounds
        expect(x + 16).toBeLessThanOrEqual(b.maxX); // cell right edge in-bounds
        expect(y - 12).toBeGreaterThanOrEqual(b.minY);
        expect(y + 12).toBeLessThanOrEqual(b.maxY);
      }
    }
  });
});
