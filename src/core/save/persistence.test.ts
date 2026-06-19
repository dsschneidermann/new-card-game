import { describe, it, expect } from 'vitest';
import {
  createWorld,
  advance,
  serializeWorld,
  restoreWorld,
  defineComponent,
  HexPosition,
  FacingState,
  MovePath,
  makeMovementSystem,
  HexGrid,
  offsetToAxial,
  InMemoryStorageAdapter,
  saveRun,
  loadRun,
  clearRun,
  hasSave,
  applySave,
  SAVE_KEY,
  SAVE_VERSION,
  type World,
  type GameEvent,
  type HexLayout,
} from '@core/index';

const LAYOUT: HexLayout = { width: 32, height: 24, rowPitch: 18, originX: 24, originY: 28 };

describe('serializeWorld / restoreWorld', () => {
  it('round-trips persistent component state and entity ids', () => {
    const world = createWorld(123);
    const a = world.createEntity();
    const b = world.createEntity();
    world.store(HexPosition).add(a, { hex: { q: 1, r: 2 } });
    world.store(FacingState).add(a, { facing: 'left' });
    world.store(HexPosition).add(b, { hex: { q: -3, r: 4 } });

    const restored = restoreWorld(serializeWorld(world));

    expect(restored.store(HexPosition).get(a)).toEqual({ hex: { q: 1, r: 2 } });
    expect(restored.store(FacingState).get(a)).toEqual({ facing: 'left' });
    expect(restored.store(HexPosition).get(b)).toEqual({ hex: { q: -3, r: 4 } });
    expect(restored.entitiesWith(HexPosition)).toEqual([a, b]);
  });

  it('serializes only persistent components (transient ones are excluded)', () => {
    const Transient = defineComponent<{ n: number }>('test.transient', { persistent: false });
    const world = createWorld(1);
    const e = world.createEntity();
    world.store(HexPosition).add(e, { hex: { q: 0, r: 0 } });
    world.store(MovePath).add(e, { path: [{ q: 0, r: 0 }], index: 0 });
    world.store(Transient).add(e, { n: 42 });

    const snap = serializeWorld(world);
    expect(snap.components).toHaveProperty('HexPosition');
    expect(snap.components).not.toHaveProperty('MovePath');
    expect(snap.components).not.toHaveProperty('test.transient');

    const restored = restoreWorld(snap);
    expect(restored.store(HexPosition).get(e)).toEqual({ hex: { q: 0, r: 0 } });
    expect(restored.store(MovePath).get(e)).toBeUndefined();
    expect(restored.store(Transient).get(e)).toBeUndefined();
  });

  it('resumes the live RNG stream rather than restarting from the seed', () => {
    const world = createWorld(999);
    world.rng.next();
    world.rng.next();
    world.rng.next();

    const restored = restoreWorld(serializeWorld(world));
    const fresh = createWorld(999);

    const restoredSeq = [restored.rng.next(), restored.rng.next(), restored.rng.next()];
    const worldSeq = [world.rng.next(), world.rng.next(), world.rng.next()];
    const freshSeq = [fresh.rng.next(), fresh.rng.next(), fresh.rng.next()];

    expect(restoredSeq).toEqual(worldSeq); // continues the original stream
    expect(restoredSeq).not.toEqual(freshSeq); // not a restart from the seed
  });

  it('restores the entity allocator: fresh ids stay monotonic, destroyed ids stay destroyed', () => {
    const world = createWorld(1);
    const a = world.createEntity(); // 1
    const b = world.createEntity(); // 2
    const c = world.createEntity(); // 3
    world.destroyEntity(b);
    world.store(HexPosition).add(a, { hex: { q: 0, r: 0 } });
    world.store(HexPosition).add(c, { hex: { q: 1, r: 0 } });

    const restored = restoreWorld(serializeWorld(world));
    expect(restored.isAlive(a)).toBe(true);
    expect(restored.isAlive(b)).toBe(false);
    expect(restored.isAlive(c)).toBe(true);

    const next = restored.createEntity();
    expect(next).toBe(4); // never reuses the destroyed id 2
    expect(next).not.toBe(b);
  });
});

describe('saveRun / loadRun / clearRun (InMemoryStorageAdapter)', () => {
  it('saves, reports presence, loads an equal snapshot, and clears', () => {
    const adapter = new InMemoryStorageAdapter();
    const world = createWorld(7);
    const e = world.createEntity();
    world.store(HexPosition).add(e, { hex: { q: 2, r: 3 } });

    expect(hasSave(adapter)).toBe(false);
    saveRun(adapter, world);
    expect(hasSave(adapter)).toBe(true);

    const res = loadRun(adapter);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.version).toBe(SAVE_VERSION);
      expect(res.state.world).toEqual(serializeWorld(world));
      expect(applySave(res.state).store(HexPosition).get(e)).toEqual({ hex: { q: 2, r: 3 } });
    }

    clearRun(adapter);
    expect(hasSave(adapter)).toBe(false);
    expect(loadRun(adapter)).toEqual({ ok: false, reason: 'absent' });
  });

  it('loadRun is total: absent / corrupt / incompatible, never throws (no migration)', () => {
    const adapter = new InMemoryStorageAdapter();
    expect(loadRun(adapter)).toEqual({ ok: false, reason: 'absent' });

    adapter.set(SAVE_KEY, '{not valid json');
    expect(loadRun(adapter)).toEqual({ ok: false, reason: 'corrupt' });

    adapter.set(SAVE_KEY, JSON.stringify(42)); // not an object
    expect(loadRun(adapter)).toEqual({ ok: false, reason: 'corrupt' });

    adapter.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION })); // missing world
    expect(loadRun(adapter)).toEqual({ ok: false, reason: 'corrupt' });

    adapter.set(SAVE_KEY, JSON.stringify({ version: 999, world: {} })); // wrong version
    expect(loadRun(adapter)).toEqual({ ok: false, reason: 'incompatible' });

    expect(() => loadRun(adapter)).not.toThrow();
  });

  it('determinism survives save/load: a restored run evolves identically to the original', () => {
    const world = createWorld(7);
    world.addSystem(makeMovementSystem(new HexGrid(8, 8), LAYOUT));
    const e = world.createEntity();
    world.store(HexPosition).add(e, { hex: offsetToAxial({ col: 0, row: 0 }) });
    world.store(FacingState).add(e, { facing: 'right' });

    // Complete a first move so the snapshot captures a moved, at-rest entity.
    const mid = offsetToAxial({ col: 2, row: 1 });
    advance(world, [{ kind: 'MoveTo', entity: e, q: mid.q, r: mid.r }]);
    for (let i = 0; i < 6; i += 1) advance(world);
    expect(world.store(HexPosition).get(e)).toEqual({ hex: mid });

    const snap = serializeWorld(world);

    // Issue the SAME second move to the original and to a restored copy.
    const to = offsetToAxial({ col: 5, row: 3 });
    const play = (w: World): { pos: unknown; evs: GameEvent[][]; facing: unknown } => {
      const evs = [advance(w, [{ kind: 'MoveTo', entity: e, q: to.q, r: to.r }])];
      for (let i = 0; i < 10; i += 1) evs.push(advance(w));
      return { pos: w.store(HexPosition).get(e), evs, facing: w.store(FacingState).get(e) };
    };

    const orig = play(world);

    const restored = restoreWorld(snap);
    restored.addSystem(makeMovementSystem(new HexGrid(8, 8), LAYOUT)); // systems are code, re-registered on resume
    const rest = play(restored);

    expect(rest.pos).toEqual(orig.pos);
    expect(rest.facing).toEqual(orig.facing);
    expect(rest.evs).toEqual(orig.evs);
  });
});
