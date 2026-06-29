import { describe, it, expect } from 'vitest';
import {
  createWorld,
  spawnEnemy,
  ARCHETYPES,
  Shield,
  gainShield,
  resetShield,
  resetEnemyShields,
  applyEnemySelfShields,
  makeShieldSystem,
} from '@core/index';

describe('shield ops (Defense & Shielding)', () => {
  it('gainShield attaches the pool when absent, adds to it otherwise, and ignores non-positive amounts', () => {
    const world = createWorld(1);
    const e = world.createEntity();
    gainShield(world, e, 5);
    expect(world.store(Shield).get(e)).toEqual({ shield: 5 }); // attached
    gainShield(world, e, 3);
    expect(world.store(Shield).get(e)?.shield).toBe(8); // added
    gainShield(world, e, 0);
    gainShield(world, e, -4);
    expect(world.store(Shield).get(e)?.shield).toBe(8); // unchanged by <= 0
  });

  it('resetShield zeroes an existing pool and is a no-op without one', () => {
    const world = createWorld(1);
    const e = world.createEntity();
    world.store(Shield).add(e, { shield: 9 });
    resetShield(world, e);
    expect(world.store(Shield).get(e)?.shield).toBe(0);
    const f = world.createEntity();
    expect(() => resetShield(world, f)).not.toThrow();
  });

  it('resetEnemyShields wipes every enemy and applyEnemySelfShields re-grants each its selfShield', () => {
    const world = createWorld(1);
    const orc = spawnEnemy(world, ARCHETYPES.orc!, { q: 0, r: 0 }); // selfShield 3
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, { q: 1, r: 0 }); // none
    world.store(Shield).get(orc)!.shield = 42;
    world.store(Shield).get(goblin)!.shield = 7;
    resetEnemyShields(world);
    expect(world.store(Shield).get(orc)?.shield).toBe(0);
    expect(world.store(Shield).get(goblin)?.shield).toBe(0);
    applyEnemySelfShields(world);
    expect(world.store(Shield).get(orc)?.shield).toBe(ARCHETYPES.orc!.selfShield);
    expect(world.store(Shield).get(goblin)?.shield).toBe(0); // no selfShield to grant
  });

  it('applyEnemySelfShields skips a dead enemy', () => {
    const world = createWorld(1);
    const orc = spawnEnemy(world, ARCHETYPES.orc!, { q: 0, r: 0 });
    world.destroyEntity(orc); // dead -> purged
    expect(() => applyEnemySelfShields(world)).not.toThrow();
    expect(world.store(Shield).get(orc)).toBeUndefined();
  });
});

describe('makeShieldSystem reacts to the turn engine events (Defense & Shielding)', () => {
  it('TurnEnded{player} wipes all enemy shield', () => {
    const world = createWorld(1);
    const sys = makeShieldSystem();
    const orc = spawnEnemy(world, ARCHETYPES.orc!, { q: 0, r: 0 });
    world.store(Shield).get(orc)!.shield = 5;
    world.emit({ kind: 'TurnEnded', phase: 'player' });
    sys(world);
    expect(world.store(Shield).get(orc)?.shield).toBe(0);
  });

  it('TurnStarted{enemy} grants each enemy its selfShield', () => {
    const world = createWorld(1);
    const sys = makeShieldSystem();
    const orc = spawnEnemy(world, ARCHETYPES.orc!, { q: 0, r: 0 });
    world.emit({ kind: 'TurnStarted', phase: 'enemy' });
    sys(world);
    expect(world.store(Shield).get(orc)?.shield).toBe(ARCHETYPES.orc!.selfShield);
  });

  it('TurnStarted{player} resets the acting player’s shield to 0', () => {
    const world = createWorld(1);
    const sys = makeShieldSystem();
    const player = world.createEntity();
    world.store(Shield).add(player, { shield: 8 });
    world.emit({ kind: 'TurnStarted', phase: 'player', actor: player });
    sys(world);
    expect(world.store(Shield).get(player)?.shield).toBe(0);
  });

  it('ShieldGainRequested grants the requested entity that much shield (a played Defend)', () => {
    const world = createWorld(1);
    const sys = makeShieldSystem();
    const player = world.createEntity();
    world.emit({ kind: 'ShieldGainRequested', entity: player, amount: 5 });
    sys(world);
    expect(world.store(Shield).get(player)?.shield).toBe(5);
  });

  it('processes a full end-of-turn event burst in order: enemy shield reset then re-applied, player reset', () => {
    const world = createWorld(1);
    const sys = makeShieldSystem();
    const player = world.createEntity();
    world.store(Shield).add(player, { shield: 6 }); // banked from Defend
    const orc = spawnEnemy(world, ARCHETYPES.orc!, { q: 0, r: 0 });
    world.store(Shield).get(orc)!.shield = 99; // stale
    // The same burst the turn engine emits inside one EndTurn pass, in emission order.
    world.emit({ kind: 'TurnEnded', phase: 'player' });
    world.emit({ kind: 'TurnStarted', phase: 'enemy' });
    world.emit({ kind: 'TurnEnded', phase: 'enemy' });
    world.emit({ kind: 'TurnStarted', phase: 'player', actor: player });
    sys(world);
    expect(world.store(Shield).get(orc)?.shield).toBe(ARCHETYPES.orc!.selfShield); // 99 -> 0 -> 3
    expect(world.store(Shield).get(player)?.shield).toBe(0); // banked block wiped at turn start
  });
});
