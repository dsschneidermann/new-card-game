import { describe, it, expect } from 'vitest';
import {
  createWorld,
  serializeWorld,
  restoreWorld,
  HexGrid,
  HexPosition,
  Enemy,
  AssetKeys,
  ARCHETYPES,
  computeDamage,
  resolveAttack,
  spawnEnemy,
  inAttackRange,
  hasAttackLineOfSight,
  Health,
  CombatStats,
  Attack,
  Archetype,
  type AttackProfile,
  type World,
  type EntityId,
} from '@core/index';

/** A melee-ish attack profile with overridable fields, for the pure-math tests. */
const profile = (over: Partial<AttackProfile> = {}): AttackProfile => ({
  name: 'test',
  minRange: 1,
  maxRange: 1,
  requiresLineOfSight: false,
  baseDamage: 6,
  ...over,
});

const ranged = (over: Partial<AttackProfile> = {}): AttackProfile =>
  profile({ name: 'shot', minRange: 2, maxRange: 5, requiresLineOfSight: true, baseDamage: 5, ...over });

const noBlock = (): boolean => false;

describe('computeDamage (ADR-007)', () => {
  it('subtracts flat armour from base damage', () => {
    expect(computeDamage(profile({ baseDamage: 10 }), 3, 0).hpLost).toBe(7);
  });

  it('never deals less than 1 — armour at or above the damage still deals the floor of 1', () => {
    expect(computeDamage(profile({ baseDamage: 4 }), 10, 0)).toMatchObject({ afterArmor: 1, hpLost: 1 });
  });

  it('shield absorbs before HP; HP is untouched until the shield is depleted', () => {
    expect(computeDamage(profile({ baseDamage: 6 }), 0, 4)).toMatchObject({
      afterArmor: 6,
      shieldAbsorbed: 4,
      hpLost: 2,
    });
    expect(computeDamage(profile({ baseDamage: 6 }), 0, 10)).toMatchObject({ shieldAbsorbed: 6, hpLost: 0 });
  });

  it('pierce reduces effective armour before the floor is applied', () => {
    expect(computeDamage(profile({ baseDamage: 6, pierce: 3 }), 5, 0).hpLost).toBe(4);
    expect(computeDamage(profile({ baseDamage: 6, pierce: 99 }), 5, 0).hpLost).toBe(6);
  });
});

describe('attack range & line-of-sight predicates on the hex grid (ADR-006 / ADR-007)', () => {
  it('melee (maxRange 1) reaches an adjacent tile but not a range-2 tile', () => {
    const melee = profile();
    expect(inAttackRange(melee, { q: 0, r: 0 }, { q: 1, r: 0 })).toBe(true);
    expect(inAttackRange(melee, { q: 0, r: 0 }, { q: 2, r: 0 })).toBe(false);
  });

  it('a ranged attack reaches within its range band but not closer than minRange or past maxRange', () => {
    const shot = ranged(); // minRange 2, maxRange 5
    expect(inAttackRange(shot, { q: 0, r: 0 }, { q: 1, r: 0 })).toBe(false); // inside minRange
    expect(inAttackRange(shot, { q: 0, r: 0 }, { q: 3, r: 0 })).toBe(true);
    expect(inAttackRange(shot, { q: 0, r: 0 }, { q: 6, r: 0 })).toBe(false); // beyond maxRange
  });

  it('a line-of-sight attack is blocked by a wall strictly between attacker and target, clear otherwise', () => {
    const grid = new HexGrid(10, 10);
    grid.setBlocksSight({ q: 1, r: 0 }, true); // a sight-blocker between {0,0} and {2,0}
    const shot = ranged();
    expect(hasAttackLineOfSight(shot, { q: 0, r: 0 }, { q: 2, r: 0 }, (h) => grid.blocksSight(h))).toBe(false);
    expect(hasAttackLineOfSight(shot, { q: 0, r: 0 }, { q: 2, r: 0 }, noBlock)).toBe(true);
  });

  it('a melee attack (requiresLineOfSight false) ignores sight-blockers', () => {
    const grid = new HexGrid(10, 10);
    grid.setBlocksSight({ q: 1, r: 0 }, true);
    expect(hasAttackLineOfSight(profile(), { q: 0, r: 0 }, { q: 1, r: 0 }, (h) => grid.blocksSight(h))).toBe(true);
  });
});

describe('spawnEnemy — data-driven roster bundle tied to real sprites (ADR-007)', () => {
  it('materialises each roster enemy with its HP / armour / attacks / definition id', () => {
    const world = createWorld(1);
    for (const def of Object.values(ARCHETYPES)) {
      const e = spawnEnemy(world, def, { q: 0, r: 0 });
      expect(world.store(Enemy).get(e)?.art).toBe(def.spriteKey);
      expect(world.store(Health).get(e)).toEqual({ hp: def.maxHp, maxHp: def.maxHp });
      expect(world.store(CombatStats).get(e)?.armor).toBe(def.armor);
      expect(world.store(Attack).get(e)?.profiles).toEqual(def.attacks);
      expect(world.store(Archetype).get(e)).toEqual({ defId: def.id, movement: def.movement });
    }
  });

  it('every definition is tied to a real roster sprite (its idle key is registered)', () => {
    const idleKeys = new Set<string>(Object.values(AssetKeys));
    for (const def of Object.values(ARCHETYPES)) {
      expect(idleKeys.has(`${def.spriteKey}.idle`)).toBe(true);
    }
  });

  it('definitions span different stats — a lava golem is slow and armoured, a goblin is fast and fragile', () => {
    const world = createWorld(1);
    const golem = spawnEnemy(world, ARCHETYPES.lava_golem!, { q: 0, r: 0 });
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, { q: 1, r: 0 });
    expect(world.store(Archetype).get(golem)!.movement).toBeLessThan(world.store(Archetype).get(goblin)!.movement);
    expect(world.store(CombatStats).get(golem)!.armor).toBeGreaterThan(world.store(CombatStats).get(goblin)!.armor);
    expect(world.store(Health).get(goblin)!.maxHp).toBeLessThan(world.store(Health).get(golem)!.maxHp);
  });

  it('enemies can have multiple attacks', () => {
    const world = createWorld(1);
    const dragon = spawnEnemy(world, ARCHETYPES.dragon!, { q: 0, r: 0 });
    expect(world.store(Attack).get(dragon)!.profiles.length).toBeGreaterThan(1);
  });
});

describe('resolveAttack (ADR-007)', () => {
  /** An attacker carrying the given attack profiles. */
  function attacker(world: World, ...profiles: AttackProfile[]): EntityId {
    const e = world.createEntity();
    world.store(Attack).add(e, { profiles });
    return e;
  }

  it('applies armour-reduced damage and emits DamageDealt + AttackResolved with the attack name', () => {
    const world = createWorld(1);
    const a = attacker(world, profile({ name: 'cleave', baseDamage: 10 }));
    const target = world.createEntity();
    world.store(Health).add(target, { hp: 20, maxHp: 20 });
    world.store(CombatStats).add(target, { armor: 3 });

    const result = resolveAttack(world, a, target);
    expect(result?.hpLost).toBe(7);
    expect(world.store(Health).get(target)?.hp).toBe(13);
    const resolved = world.events().find((e) => e.kind === 'AttackResolved');
    expect(resolved).toMatchObject({ attacker: a, target, attack: 'cleave', hpLost: 7, lethal: false });
    expect(world.events().some((e) => e.kind === 'DamageDealt')).toBe(true);
  });

  it('attackIndex selects which of several attacks is used', () => {
    const world = createWorld(1);
    const a = attacker(world, profile({ name: 'jab', baseDamage: 4 }), profile({ name: 'smash', baseDamage: 12 }));
    const target = world.createEntity();
    world.store(Health).add(target, { hp: 30, maxHp: 30 });
    world.store(CombatStats).add(target, { armor: 0 });

    resolveAttack(world, a, target, 1); // the second attack
    expect(world.store(Health).get(target)?.hp).toBe(18); // 30 - 12
    expect(world.events().find((e) => e.kind === 'AttackResolved')).toMatchObject({ attack: 'smash' });
  });

  it('returns undefined for an out-of-range attack index', () => {
    const world = createWorld(1);
    const a = attacker(world, profile());
    const target = world.createEntity();
    world.store(Health).add(target, { hp: 10, maxHp: 10 });
    expect(resolveAttack(world, a, target, 5)).toBeUndefined();
  });

  it('removes the entity and emits EntityDied when HP reaches 0', () => {
    const world = createWorld(1);
    const a = attacker(world, profile({ baseDamage: 10 }));
    const target = world.createEntity();
    world.store(Health).add(target, { hp: 6, maxHp: 30 });
    world.store(CombatStats).add(target, { armor: 0 });

    resolveAttack(world, a, target);
    expect(world.isAlive(target)).toBe(false);
    expect(world.store(Health).get(target)).toBeUndefined(); // purged on destroy
    expect(world.events()).toContainEqual({ kind: 'EntityDied', entity: target });
  });
});

describe('combat state persists across save/resume (ADR-010 round-trip)', () => {
  it('a multi-attack enemy survives serialize -> restore with HP, armour, attacks, definition and position', () => {
    const world = createWorld(7);
    const e = spawnEnemy(world, ARCHETYPES.dragon!, { q: 3, r: -1 });
    world.store(Health).get(e)!.hp = 41; // a mid-combat HP, not full, to prove the live value round-trips

    const restored = restoreWorld(serializeWorld(world));

    expect(restored.isAlive(e)).toBe(true);
    expect(restored.store(Health).get(e)).toEqual({ hp: 41, maxHp: ARCHETYPES.dragon!.maxHp });
    expect(restored.store(CombatStats).get(e)?.armor).toBe(ARCHETYPES.dragon!.armor);
    expect(restored.store(Attack).get(e)?.profiles).toEqual(ARCHETYPES.dragon!.attacks);
    expect(restored.store(Archetype).get(e)).toEqual({ defId: 'dragon', movement: ARCHETYPES.dragon!.movement });
    expect(restored.store(Enemy).get(e)?.art).toBe(ARCHETYPES.dragon!.spriteKey);
    expect(restored.store(HexPosition).get(e)).toEqual({ hex: { q: 3, r: -1 } });
  });
});
