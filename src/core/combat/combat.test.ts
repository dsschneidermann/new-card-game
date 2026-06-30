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
  applyDamage,
  applyHeal,
  resolveAttack,
  resolveCardAttack,
  spawnEnemy,
  inAttackRange,
  hasAttackLineOfSight,
  Player,
  Health,
  CombatStats,
  Attack,
  Archetype,
  Shield,
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
    world.store(CombatStats).add(target, { armor: 3, baseArmor: 3 });

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
    world.store(CombatStats).add(target, { armor: 0, baseArmor: 0 });

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
    world.store(CombatStats).add(target, { armor: 0, baseArmor: 0 });

    resolveAttack(world, a, target);
    expect(world.isAlive(target)).toBe(false);
    expect(world.store(Health).get(target)).toBeUndefined(); // purged on destroy
    expect(world.events()).toContainEqual({ kind: 'EntityDied', entity: target });
  });
});

describe('shield absorbs before HP and is spent down (Defense & Shielding, ADR-008)', () => {
  it('applyDamage decrements the target shield by shieldAbsorbed AND HP by hpLost', () => {
    const world = createWorld(1);
    const target = world.createEntity();
    world.store(Health).add(target, { hp: 20, maxHp: 20 });
    world.store(Shield).add(target, { shield: 4 });
    // base 6, armour 0 -> afterArmor 6; shield 4 soaks 4, 2 reaches HP.
    applyDamage(world, target, computeDamage(profile({ baseDamage: 6 }), 0, 4));
    expect(world.store(Shield).get(target)?.shield).toBe(0); // pool spent
    expect(world.store(Health).get(target)?.hp).toBe(18); // 20 - 2
  });

  it('a hit fully soaked by shield leaves HP untouched and never drives the pool negative', () => {
    const world = createWorld(1);
    const target = world.createEntity();
    world.store(Health).add(target, { hp: 20, maxHp: 20 });
    world.store(Shield).add(target, { shield: 10 });
    applyDamage(world, target, computeDamage(profile({ baseDamage: 6 }), 0, 10));
    expect(world.store(Shield).get(target)?.shield).toBe(4); // 10 - 6
    expect(world.store(Health).get(target)?.hp).toBe(20); // untouched
  });

  it('resolveAttack reads the target Shield component: shield soaks first, then HP, reporting shieldAbsorbed', () => {
    const world = createWorld(1);
    const a = world.createEntity();
    world.store(Attack).add(a, { profiles: [profile({ name: 'cleave', baseDamage: 9 })] });
    const target = world.createEntity();
    world.store(Health).add(target, { hp: 20, maxHp: 20 });
    world.store(CombatStats).add(target, { armor: 1, baseArmor: 1 });
    world.store(Shield).add(target, { shield: 5 });
    // base 9 - armour 1 = 8; shield 5 soaks 5; 3 to HP.
    const result = resolveAttack(world, a, target);
    expect(result).toMatchObject({ afterArmor: 8, shieldAbsorbed: 5, hpLost: 3 });
    expect(world.store(Shield).get(target)?.shield).toBe(0);
    expect(world.store(Health).get(target)?.hp).toBe(17);
    expect(world.events().find((e) => e.kind === 'AttackResolved')).toMatchObject({ shieldAbsorbed: 5, lethal: false });
  });
});

describe('spawnEnemy attaches a Shield pool + the self-shield stat (Defense & Shielding)', () => {
  it('every spawned enemy starts unshielded (Shield 0)', () => {
    const world = createWorld(1);
    const e = spawnEnemy(world, ARCHETYPES.goblin!, { q: 0, r: 0 });
    expect(world.store(Shield).get(e)).toEqual({ shield: 0 });
  });

  it('materialises CombatStats.selfShield from the def — an Orc self-shields, a Goblin does not', () => {
    const world = createWorld(1);
    const orc = spawnEnemy(world, ARCHETYPES.orc!, { q: 0, r: 0 });
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, { q: 1, r: 0 });
    expect(world.store(CombatStats).get(orc)?.selfShield).toBe(ARCHETYPES.orc!.selfShield);
    expect(world.store(CombatStats).get(orc)?.selfShield).toBeGreaterThan(0);
    expect(world.store(CombatStats).get(goblin)?.selfShield).toBeUndefined();
  });
});

describe('resolveCardAttack — player attack cards damage enemies on the aimed hex(es)', () => {
  it('damages the enemy standing on the aimed hex through armour, then shield, then HP', () => {
    const world = createWorld(1);
    const player = world.createEntity();
    const orc = spawnEnemy(world, ARCHETYPES.orc!, { q: 2, r: 0 }); // armour 2
    world.store(Shield).get(orc)!.shield = 3; // pretend it self-shielded this round
    const startHp = world.store(Health).get(orc)!.hp;
    // Long Strike damage 7 - armour 2 = 5; shield 3 soaks 3; 2 to HP.
    resolveCardAttack(world, player, [{ q: 2, r: 0 }], 7);
    expect(world.store(Shield).get(orc)?.shield).toBe(0);
    expect(world.store(Health).get(orc)?.hp).toBe(startHp - 2);
    expect(world.events().find((e) => e.kind === 'AttackResolved')).toMatchObject({ attacker: player, target: orc });
  });

  it('hits every enemy on the passed hexes (a Whirlwind-style burst)', () => {
    const world = createWorld(1);
    const player = world.createEntity();
    const a = spawnEnemy(world, ARCHETYPES.goblin!, { q: 1, r: 0 });
    const b = spawnEnemy(world, ARCHETYPES.goblin!, { q: 0, r: 1 });
    const before = world.store(Health).get(a)!.hp;
    resolveCardAttack(world, player, [{ q: 1, r: 0 }, { q: 0, r: 1 }], 5);
    expect(world.store(Health).get(a)?.hp).toBe(before - 5);
    expect(world.store(Health).get(b)?.hp).toBe(before - 5);
  });

  it('kills an enemy reduced to 0 HP (EntityDied + destroyed)', () => {
    const world = createWorld(1);
    const player = world.createEntity();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, { q: 1, r: 0 }); // 12 HP, 0 armour
    resolveCardAttack(world, player, [{ q: 1, r: 0 }], 99);
    expect(world.isAlive(goblin)).toBe(false);
    expect(world.events()).toContainEqual({ kind: 'EntityDied', entity: goblin });
  });

  it('an aimed hex with no enemy is a harmless no-op', () => {
    const world = createWorld(1);
    const player = world.createEntity();
    spawnEnemy(world, ARCHETYPES.goblin!, { q: 1, r: 0 });
    const results = resolveCardAttack(world, player, [{ q: 5, r: 5 }], 6); // empty tile
    expect(results).toEqual([]);
    expect(world.events().some((e) => e.kind === 'AttackResolved')).toBe(false);
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

  it('an enemy carrying live Shield + selfShield round-trips (Defense & Shielding, v14)', () => {
    const world = createWorld(7);
    const e = spawnEnemy(world, ARCHETYPES.orc!, { q: 1, r: 2 });
    world.store(Shield).get(e)!.shield = 3; // a mid-round shield value, not the spawn default

    const restored = restoreWorld(serializeWorld(world));

    expect(restored.store(Shield).get(e)).toEqual({ shield: 3 });
    expect(restored.store(CombatStats).get(e)?.selfShield).toBe(ARCHETYPES.orc!.selfShield);
  });
});

describe('applyHeal (Self Heal spell) — clamps to maxHp', () => {
  it('restores HP up to maxHp, emits Healed with the amount restored, and never overheals', () => {
    const world = createWorld(1);
    const e = world.createEntity();
    world.store(Health).add(e, { hp: 6, maxHp: 30 });
    expect(applyHeal(world, e, 8)).toBe(14);
    expect(world.store(Health).get(e)?.hp).toBe(14);
    expect(world.events()).toContainEqual({ kind: 'Healed', target: e, amount: 8 });
  });

  it('clamps at maxHp (a near-full target heals only the remainder) and a full target stays put', () => {
    const world = createWorld(1);
    const e = world.createEntity();
    world.store(Health).add(e, { hp: 28, maxHp: 30 });
    expect(applyHeal(world, e, 8)).toBe(30); // only +2
    expect(world.events()).toContainEqual({ kind: 'Healed', target: e, amount: 2 });
    const full = world.createEntity();
    world.store(Health).add(full, { hp: 30, maxHp: 30 });
    expect(applyHeal(world, full, 8)).toBe(30);
    expect(world.events().some((ev) => ev.kind === 'Healed' && ev.target === full)).toBe(false); // no Healed at full
  });

  it('is a no-op (returns 0) on an entity without Health', () => {
    const world = createWorld(1);
    const e = world.createEntity();
    expect(applyHeal(world, e, 8)).toBe(0);
  });
});

describe('player defeat — the player entity is never destroyed at 0 HP (ADR-010)', () => {
  it('emits PlayerDefeated (not EntityDied) and keeps the player entity + its components', () => {
    const world = createWorld(1);
    const player = world.createEntity();
    world.store(Player).add(player, { isPlayer: true });
    world.store(Health).add(player, { hp: 5, maxHp: 30 });
    applyDamage(world, player, computeDamage(profile({ baseDamage: 99 }), 0, 0)); // lethal
    expect(world.isAlive(player)).toBe(true); // NOT destroyed
    expect(world.store(Health).get(player)?.hp).toBe(0); // clamped at 0, still present
    expect(world.events()).toContainEqual({ kind: 'PlayerDefeated', entity: player });
    expect(world.events().some((ev) => ev.kind === 'EntityDied')).toBe(false);
  });

  it('an enemy at 0 HP still dies + is destroyed (no PlayerDefeated)', () => {
    const world = createWorld(1);
    const enemy = spawnEnemy(world, ARCHETYPES.goblin!, { q: 0, r: 0 });
    applyDamage(world, enemy, computeDamage(profile({ baseDamage: 99 }), 0, 0));
    expect(world.isAlive(enemy)).toBe(false);
    expect(world.events()).toContainEqual({ kind: 'EntityDied', entity: enemy });
    expect(world.events().some((ev) => ev.kind === 'PlayerDefeated')).toBe(false);
  });
});
