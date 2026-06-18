import { describe, it, expect } from 'vitest';
import { createWorld, defineComponent } from '@core/index';

interface Pos {
  x: number;
  y: number;
}
interface Hp {
  value: number;
}
const Position = defineComponent<Pos>('Position');
const Health = defineComponent<Hp>('Health');

describe('ComponentStore', () => {
  it('add then get returns the component; remove clears it', () => {
    const w = createWorld();
    const e = w.createEntity();
    const store = w.store(Position);
    expect(store.has(e)).toBe(false);
    expect(store.get(e)).toBeUndefined();

    store.add(e, { x: 1, y: 2 });
    expect(store.has(e)).toBe(true);
    expect(store.get(e)).toEqual({ x: 1, y: 2 });

    store.remove(e);
    expect(store.has(e)).toBe(false);
    expect(store.get(e)).toBeUndefined();
  });
});

describe('World.entitiesWith', () => {
  it('returns only entities possessing ALL queried types, ascending', () => {
    const w = createWorld();
    const a = w.createEntity();
    const b = w.createEntity();
    const c = w.createEntity();
    w.store(Position).add(a, { x: 0, y: 0 });
    w.store(Health).add(a, { value: 10 });
    w.store(Position).add(b, { x: 1, y: 1 }); // position only
    w.store(Health).add(c, { value: 5 }); // health only

    expect(w.entitiesWith(Position, Health)).toEqual([a]); // full match
    expect(w.entitiesWith(Position)).toEqual([a, b]); // partial
    expect(w.entitiesWith(Health)).toEqual([a, c]);
  });
});

describe('Entity ids are never reused within a run', () => {
  it('ids are monotonic and a destroyed id is not reissued', () => {
    const w = createWorld();
    const a = w.createEntity();
    const b = w.createEntity();
    expect(b).toBeGreaterThan(a);

    w.destroyEntity(a);
    const c = w.createEntity();
    expect(c).toBeGreaterThan(b); // a's id is not recycled
    expect(c).not.toBe(a);
  });

  it('a stale handle resolves to not-found', () => {
    const w = createWorld();
    const e = w.createEntity();
    w.store(Position).add(e, { x: 3, y: 4 });

    w.destroyEntity(e);
    expect(w.isAlive(e)).toBe(false);
    expect(w.store(Position).get(e)).toBeUndefined(); // purged on destroy
    expect(w.entitiesWith(Position)).not.toContain(e);
  });
});
