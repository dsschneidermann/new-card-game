import { describe, it, expect } from 'vitest';
import {
  createWorld,
  spawnEnemy,
  ARCHETYPES,
  Enemy,
  Health,
  Shield,
  HexPosition,
  type Hex,
} from '@core/index';
import { enemyHealthBarData, healthBarTicks } from '@render/enemyHealthBar';

describe('enemyHealthBarData — visibility gate', () => {
  it('returns null for the player (Health but no Enemy marker), hovered or not', () => {
    const world = createWorld(1);
    const hex: Hex = { q: 0, r: 0 };
    const player = world.createEntity();
    world.store(Health).add(player, { hp: 20, maxHp: 30 }); // even though "damaged"
    world.store(HexPosition).add(player, { hex });
    expect(enemyHealthBarData(world, player, null)).toBeNull();
    expect(enemyHealthBarData(world, player, hex)).toBeNull(); // hovering the player still shows nothing
  });

  it('returns null for a disguised mimic (Enemy marker but no Health)', () => {
    const world = createWorld(1);
    const hex: Hex = { q: 0, r: 0 };
    const mimic = world.createEntity();
    world.store(Enemy).add(mimic, { isEnemy: true, art: 'enemy_mimic_1' });
    world.store(HexPosition).add(mimic, { hex });
    expect(enemyHealthBarData(world, mimic, null)).toBeNull();
    expect(enemyHealthBarData(world, mimic, hex)).toBeNull();
  });

  it('returns null for a full-HP enemy that is not hovered', () => {
    const world = createWorld(1);
    const hex: Hex = { q: 0, r: 0 };
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, hex); // hp === maxHp === 12
    expect(enemyHealthBarData(world, goblin, null)).toBeNull();
    expect(enemyHealthBarData(world, goblin, { q: 9, r: 9 })).toBeNull(); // a different hex is hovered
  });

  it('shows a full-HP enemy when hovered (hover overrides the damaged gate)', () => {
    const world = createWorld(1);
    const hex: Hex = { q: 1, r: -1 };
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, hex);
    expect(enemyHealthBarData(world, goblin, hex)).toEqual({ hp: 12, maxHp: 12, shield: 0 });
  });

  it('shows a damaged enemy when not hovered', () => {
    const world = createWorld(1);
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, { q: 0, r: 0 });
    const health = world.store(Health).get(goblin);
    if (health === undefined) throw new Error('spawned enemy missing Health');
    health.hp = 5;
    expect(enemyHealthBarData(world, goblin, null)).toEqual({ hp: 5, maxHp: 12, shield: 0 });
  });
});

describe('enemyHealthBarData — shield read', () => {
  it('surfaces Shield.shield and defaults to 0 when the enemy has no Shield component', () => {
    const world = createWorld(1);
    const knight = spawnEnemy(world, ARCHETYPES.knight!, { q: 0, r: 0 }); // spawns with a Shield component
    const shield = world.store(Shield).get(knight);
    const health = world.store(Health).get(knight);
    if (shield === undefined || health === undefined) throw new Error('spawned enemy missing components');
    shield.shield = 7;
    health.hp = 20; // damaged, so the bar shows without hover
    expect(enemyHealthBarData(world, knight, null)).toMatchObject({ shield: 7 });

    // An enemy shape with NO Shield component -> shield defaults to 0.
    const noShield = world.createEntity();
    world.store(Enemy).add(noShield, { isEnemy: true, art: 'enemy_x' });
    world.store(Health).add(noShield, { hp: 3, maxHp: 8 });
    world.store(HexPosition).add(noShield, { hex: { q: 0, r: 0 } });
    expect(enemyHealthBarData(world, noShield, null)).toEqual({ hp: 3, maxHp: 8, shield: 0 });
  });
});

describe('healthBarTicks', () => {
  it('returns the interior multiples of 10 strictly below maxHp', () => {
    expect(healthBarTicks(45)).toEqual([10, 20, 30, 40]);
    expect(healthBarTicks(30)).toEqual([10, 20]); // no tick at the maxHp edge
    expect(healthBarTicks(10)).toEqual([]);
    expect(healthBarTicks(8)).toEqual([]);
    expect(healthBarTicks(100)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });
});
