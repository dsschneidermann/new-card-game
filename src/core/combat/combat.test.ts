import { describe, it, expect } from 'vitest';
import {
  createWorld,
  serializeWorld,
  restoreWorld,
  HexGrid,
  HexPosition,
  Enemy,
  ARCHETYPES,
  computeDamage,
  resolveAttack,
  spawnEnemy,
  selectTarget,
  inAttackRange,
  Health,
  CombatStats,
  Attack,
  Archetype,
  type AttackProfile,
  type Hex,
  type World,
  type EntityId,
} from '@core/index';

/** A melee-ish attack profile with overridable fields, for the pure-math tests. */
const profile = (over: Partial<AttackProfile> = {}): AttackProfile => ({
  minRange: 1,
  maxRange: 1,
  requiresLineOfSight: false,
  targetRule: 'nearest',
  baseDamage: 6,
  ...over,
});

const noBlock = (): boolean => false;

describe('computeDamage (ADR-007)', () => {
  it('subtracts flat armour from base damage', () => {
    expect(computeDamage(profile({ baseDamage: 10 }), 3, 0).hpLost).toBe(7);
  });

  it('never deals less than 1 — armour at or above the damage still deals the floor of 1', () => {
    expect(computeDamage(profile({ baseDamage: 4 }), 10, 0)).toMatchObject({ afterArmor: 1, hpLost: 1 });
  });

  it('shield absorbs before HP; HP is untouched until the shield is depleted', () => {
    // 6 through 0 armour against a 4 shield: the shield soaks 4, only 2 reaches HP.
    expect(computeDamage(profile({ baseDamage: 6 }), 0, 4)).toMatchObject({
      afterArmor: 6,
      shieldAbsorbed: 4,
      hpLost: 2,
    });
    // A shield bigger than the hit soaks all of it — nothing reaches HP.
    expect(computeDamage(profile({ baseDamage: 6 }), 0, 10)).toMatchObject({ shieldAbsorbed: 6, hpLost: 0 });
  });

  it('pierce reduces effective armour before the floor is applied', () => {
    // Armour 5, pierce 3 -> effective armour 2; 6 - 2 = 4.
    expect(computeDamage(profile({ baseDamage: 6, pierce: 3 }), 5, 0).hpLost).toBe(4);
    // Pierce beyond the armour just zeroes it — damage caps at base (6), never above.
    expect(computeDamage(profile({ baseDamage: 6, pierce: 99 }), 5, 0).hpLost).toBe(6);
  });
});

describe('attack range & line of sight on the hex grid (ADR-006 / ADR-007)', () => {
  const melee = ARCHETYPES.melee!.attack;
  const ranged = ARCHETYPES.ranged!.attack;

  /** Place a damageable target at `hex` with `hp`; returns its entity id. */
  function placeTarget(world: World, hex: Hex, hp = 20): EntityId {
    const e = world.createEntity();
    world.store(HexPosition).add(e, { hex });
    world.store(Health).add(e, { hp, maxHp: hp });
    world.store(CombatStats).add(e, { armor: 0 });
    return e;
  }

  it('melee (maxRange 1) reaches an adjacent tile but not a range-2 tile', () => {
    expect(inAttackRange(melee, { q: 0, r: 0 }, { q: 1, r: 0 })).toBe(true);
    expect(inAttackRange(melee, { q: 0, r: 0 }, { q: 2, r: 0 })).toBe(false);
  });

  it('a ranged target is rejected when a wall lies on the line of sight', () => {
    const world = createWorld(1);
    const target = placeTarget(world, { q: 2, r: 0 });
    const grid = new HexGrid(10, 10);
    grid.setBlocksSight({ q: 1, r: 0 }, true); // a sight-blocker strictly between {0,0} and {2,0}
    const pick = selectTarget(world, ranged, { q: 0, r: 0 }, [target], (h) => grid.blocksSight(h));
    expect(pick).toBeUndefined();
  });

  it('a ranged target within maxRange with clear LOS is accepted', () => {
    const world = createWorld(1);
    const target = placeTarget(world, { q: 2, r: 0 });
    expect(selectTarget(world, ranged, { q: 0, r: 0 }, [target], noBlock)).toBe(target);
  });

  it('selectTarget honours targetRule: nearest picks the closest, lowestHp the weakest', () => {
    const world = createWorld(1);
    const near = placeTarget(world, { q: 2, r: 0 }, 20); // distance 2
    const far = placeTarget(world, { q: 4, r: 0 }, 5); // distance 4
    expect(selectTarget(world, ranged, { q: 0, r: 0 }, [far, near], noBlock)).toBe(near);
    const lowestHp: AttackProfile = { ...ranged, targetRule: 'lowestHp' };
    expect(selectTarget(world, lowestHp, { q: 0, r: 0 }, [far, near], noBlock)).toBe(far);
  });
});

describe('spawnEnemy — data-driven archetype bundle (ADR-007)', () => {
  it('materialises each archetype with its catalogue HP / armour / attack', () => {
    const world = createWorld(1);
    for (const def of Object.values(ARCHETYPES)) {
      const e = spawnEnemy(world, def, { q: 0, r: 0 });
      expect(world.store(Enemy).has(e)).toBe(true);
      expect(world.store(Health).get(e)).toEqual({ hp: def.maxHp, maxHp: def.maxHp });
      expect(world.store(CombatStats).get(e)?.armor).toBe(def.armor);
      expect(world.store(Attack).get(e)?.profile).toEqual(def.attack);
      expect(world.store(Archetype).get(e)).toEqual({ defId: def.id, movement: def.movement, tags: def.tags });
    }
  });

  it('armored is slow and heavily armoured while ranged is fragile', () => {
    const world = createWorld(1);
    const armored = spawnEnemy(world, ARCHETYPES.armored!, { q: 0, r: 0 });
    const ranged = spawnEnemy(world, ARCHETYPES.ranged!, { q: 1, r: 0 });
    expect(world.store(Archetype).get(armored)!.movement).toBeLessThan(world.store(Archetype).get(ranged)!.movement);
    expect(world.store(CombatStats).get(armored)!.armor).toBeGreaterThan(world.store(CombatStats).get(ranged)!.armor);
    expect(world.store(Health).get(ranged)!.maxHp).toBeLessThan(world.store(Health).get(armored)!.maxHp);
  });
});

describe('resolveAttack (ADR-007)', () => {
  /** A bare attacker carrying `baseDamage`. */
  function attacker(world: World, baseDamage: number): EntityId {
    const e = world.createEntity();
    world.store(Attack).add(e, { profile: profile({ baseDamage }) });
    return e;
  }

  it('applies armour-reduced damage and emits DamageDealt + AttackResolved (no death)', () => {
    const world = createWorld(1);
    const a = attacker(world, 10);
    const target = world.createEntity();
    world.store(Health).add(target, { hp: 20, maxHp: 20 });
    world.store(CombatStats).add(target, { armor: 3 });

    const result = resolveAttack(world, a, target);
    expect(result?.hpLost).toBe(7);
    expect(world.store(Health).get(target)?.hp).toBe(13);
    const kinds = world.events().map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['DamageDealt', 'AttackResolved']));
    expect(kinds).not.toContain('EntityDied');
  });

  it('removes the entity and emits EntityDied when HP reaches 0', () => {
    const world = createWorld(1);
    const a = attacker(world, 10);
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
  it('an enemy survives serialize -> restore with its HP, armour, attack, archetype and position intact', () => {
    const world = createWorld(7);
    const e = spawnEnemy(world, ARCHETYPES.spellcaster!, { q: 3, r: -1 });
    world.store(Health).get(e)!.hp = 9; // a mid-combat HP, not full, to prove the live value round-trips

    const restored = restoreWorld(serializeWorld(world));

    expect(restored.isAlive(e)).toBe(true);
    expect(restored.store(Health).get(e)).toEqual({ hp: 9, maxHp: ARCHETYPES.spellcaster!.maxHp });
    expect(restored.store(CombatStats).get(e)?.armor).toBe(ARCHETYPES.spellcaster!.armor);
    expect(restored.store(Attack).get(e)?.profile).toEqual(ARCHETYPES.spellcaster!.attack);
    expect(restored.store(Archetype).get(e)?.defId).toBe('spellcaster');
    expect(restored.store(HexPosition).get(e)).toEqual({ hex: { q: 3, r: -1 } });
  });
});
