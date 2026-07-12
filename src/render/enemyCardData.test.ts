import { describe, it, expect } from 'vitest';
import {
  createWorld,
  spawnEnemy,
  ARCHETYPES,
  Enemy,
  Health,
  Shield,
  CombatStats,
  Archetype,
  HexPosition,
  PlannedAttack,
  type Hex,
} from '@core/index';
import { enemyCardData, enemyCardAt } from '@render/enemyCardData';

describe('enemyCardData', () => {
  it('derives name / hp / shield / armor / portrait from a spawned enemy', () => {
    const world = createWorld(1);
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, { q: 0, r: 0 });

    expect(enemyCardData(world, goblin)).toEqual({
      name: 'Goblin',
      hp: 12,
      maxHp: 12,
      shield: 0,
      armor: 0,
      attackName: null, // no active telegraph on a freshly spawned enemy
      portraitTexture: `${ARCHETYPES.goblin!.spriteKey}.idle`,
    });
  });

  it('surfaces the currently-telegraphed attack name, and null when there is no telegraph', () => {
    const world = createWorld(1);
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, { q: 0, r: 0 });

    expect(enemyCardData(world, goblin)?.attackName).toBeNull(); // no PlannedAttack yet
    // Telegraph the goblin's second attack (index 1 = 'pounce'); the card names it so the player can learn it.
    world.store(PlannedAttack).add(goblin, { attackIndex: 1, hexes: [{ q: 0, r: 0 }] });
    expect(enemyCardData(world, goblin)?.attackName).toBe(ARCHETYPES.goblin!.attacks[1]!.name);
  });

  it('reflects live HP / shield / armor changes', () => {
    const world = createWorld(1);
    const knight = spawnEnemy(world, ARCHETYPES.knight!, { q: 0, r: 0 }); // armor 5, maxHp 34

    const health = world.store(Health).get(knight);
    const shield = world.store(Shield).get(knight);
    if (health === undefined || shield === undefined) throw new Error('spawned enemy missing components');
    health.hp = 20;
    shield.shield = 7;

    const data = enemyCardData(world, knight);
    expect(data).toMatchObject({ hp: 20, maxHp: 34, shield: 7, armor: 5 });
  });

  it('returns null for an Enemy with no Health (a disguised-mimic shape)', () => {
    const world = createWorld(1);
    const mimic = world.createEntity();
    world.store(Enemy).add(mimic, { isEnemy: true, art: 'enemy_mimic_1' });
    world.store(HexPosition).add(mimic, { hex: { q: 0, r: 0 } });

    expect(enemyCardData(world, mimic)).toBeNull();
  });

  it('returns null for a non-Enemy entity (the player)', () => {
    const world = createWorld(1);
    const player = world.createEntity();
    world.store(Health).add(player, { hp: 30, maxHp: 30 });
    world.store(Shield).add(player, { shield: 0 });
    world.store(CombatStats).add(player, { armor: 0, baseArmor: 0 });

    expect(enemyCardData(world, player)).toBeNull();
  });

  it('falls back to the defId, then "Enemy", when the roster / Archetype is missing', () => {
    const world = createWorld(1);

    // Enemy + Health + an Archetype whose defId is not in ARCHETYPES -> the raw defId.
    const unknown = world.createEntity();
    world.store(Enemy).add(unknown, { isEnemy: true, art: 'enemy_x' });
    world.store(Health).add(unknown, { hp: 5, maxHp: 5 });
    world.store(Archetype).add(unknown, { defId: 'not_in_roster', movement: 1 });
    expect(enemyCardData(world, unknown)?.name).toBe('not_in_roster');

    // Enemy + Health but NO Archetype -> the generic 'Enemy'.
    const nameless = world.createEntity();
    world.store(Enemy).add(nameless, { isEnemy: true, art: 'enemy_y' });
    world.store(Health).add(nameless, { hp: 5, maxHp: 5 });
    expect(enemyCardData(world, nameless)?.name).toBe('Enemy');
  });
});

describe('enemyCardAt', () => {
  it('returns the living enemy on a hex and null for an empty hex', () => {
    const world = createWorld(1);
    const hex: Hex = { q: 2, r: -1 };
    spawnEnemy(world, ARCHETYPES.goblin!, hex);

    expect(enemyCardAt(world, hex)?.name).toBe('Goblin');
    expect(enemyCardAt(world, { q: 5, r: 5 })).toBeNull();
  });

  it('skips a no-Health enemy sharing the hex and prefers the living one', () => {
    const world = createWorld(1);
    const hex: Hex = { q: 0, r: 0 };

    // A disguised-mimic shape (Enemy, no Health) alone on the hex -> not inspectable.
    const mimic = world.createEntity();
    world.store(Enemy).add(mimic, { isEnemy: true, art: 'enemy_mimic_1' });
    world.store(HexPosition).add(mimic, { hex });
    expect(enemyCardAt(world, hex)).toBeNull();

    // Add a living enemy on the same hex -> that one is returned.
    spawnEnemy(world, ARCHETYPES.slime!, hex);
    expect(enemyCardAt(world, hex)?.name).toBe('Slime');
  });
});
