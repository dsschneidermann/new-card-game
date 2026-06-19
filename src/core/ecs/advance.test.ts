import { describe, it, expect } from 'vitest';
import {
  advance,
  createWorld,
  CommandQueue,
  defineComponent,
  type Command,
  type EntityId,
  type System,
} from '@core/index';

interface Hp {
  value: number;
}
const Health = defineComponent<Hp>('Health');

describe('CommandQueue', () => {
  it('drain() returns commands in FIFO order and empties the queue', () => {
    const w = createWorld(1);
    const e = w.createEntity();
    const q = new CommandQueue();
    q.submit({ kind: 'EndTurn', entity: e });
    q.submit({ kind: 'MoveTo', entity: e, q: 5, r: 6 });
    expect(q.size).toBe(2);

    const drained = q.drain();
    expect(drained.map((c) => c.kind)).toEqual(['EndTurn', 'MoveTo']);
    expect(q.size).toBe(0);
    expect(q.drain()).toEqual([]);
  });
});

describe('advance() — systems, events, and commands', () => {
  it('runs systems in registration order', () => {
    const w = createWorld(1);
    const log: string[] = [];
    const record =
      (name: string): System =>
      () => {
        log.push(name);
      };
    w.addSystem(record('a'));
    w.addSystem(record('b'));
    w.addSystem(record('c'));

    advance(w, []);
    expect(log).toEqual(['a', 'b', 'c']);
  });

  it('returns events emitted this step and clears the bus and command queue', () => {
    const w = createWorld(1);
    const e = w.createEntity();
    w.addSystem((world) => {
      for (const cmd of world.commands()) {
        if (cmd.kind === 'PlayCard') {
          world.emit({ kind: 'CardPlayed', entity: cmd.entity, cardId: cmd.cardId });
        }
      }
    });

    const events = advance(w, [{ kind: 'PlayCard', entity: e, cardId: 'strike' }]);
    expect(events).toEqual([{ kind: 'CardPlayed', entity: e, cardId: 'strike' }]);
    expect(w.events()).toEqual([]); // bus drained
    expect(w.commands()).toEqual([]); // commands cleared
    expect(advance(w, [])).toEqual([]); // nothing carries over
  });

  it('a later system sees events emitted earlier in the same step', () => {
    const w = createWorld(1);
    const seen: string[] = [];
    w.addSystem((world) => world.emit({ kind: 'EntityDied', entity: world.createEntity() }));
    w.addSystem((world) => {
      for (const ev of world.events()) seen.push(ev.kind);
    });

    advance(w, []);
    expect(seen).toEqual(['EntityDied']);
  });

  it('is deterministic for the same seed and command list', () => {
    const cmds = (e: EntityId): Command[] => [{ kind: 'PlayCard', entity: e, cardId: 'x' }];
    const dmgSystem: System = (world, ctx) => {
      for (const cmd of world.commands()) {
        if (cmd.kind === 'PlayCard') {
          const dmg = ctx.rng.int(6) + 1;
          const hp = world.store(Health).get(cmd.entity);
          if (hp !== undefined) hp.value -= dmg;
          world.emit({ kind: 'DamageDealt', target: cmd.entity, amount: dmg });
        }
      }
    };

    const one = createWorld(42);
    const e1 = one.createEntity();
    one.store(Health).add(e1, { value: 20 });
    one.addSystem(dmgSystem);

    const two = createWorld(42);
    const e2 = two.createEntity();
    two.store(Health).add(e2, { value: 20 });
    two.addSystem(dmgSystem);

    const ev1 = advance(one, cmds(e1));
    const ev2 = advance(two, cmds(e2));
    expect(ev1).toEqual(ev2);
    expect(one.store(Health).get(e1)).toEqual(two.store(Health).get(e2));
  });
});
