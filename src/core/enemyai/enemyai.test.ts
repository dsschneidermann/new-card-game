import { describe, it, expect } from 'vitest';
import {
  createWorld,
  advance,
  serializeWorld,
  restoreWorld,
  SAVE_VERSION,
  HexGrid,
  HexPosition,
  FacingState,
  Player,
  Enemy,
  Health,
  CombatStats,
  Shield,
  Attack,
  AttackCooldowns,
  TurnState,
  ResourcePool,
  MovementBudget,
  spawnEnemy,
  ARCHETYPES,
  attackPatternHexes,
  makeTurnSystem,
  makeMovementSystem,
  makeShieldSystem,
  makeEnemyTurnSystem,
  decideEnemy,
  PlannedAttack,
  hexAdd,
  hexEquals,
  hexDistance,
  HEX_DIRECTIONS,
  type Hex,
  type EnemyDef,
  type HexLayout,
  type World,
  type EntityId,
} from '@core/index';

const LAYOUT: HexLayout = { width: 64, height: 48, rowPitch: 36, originX: 192, originY: 76 };

// A player roughly in the middle of a comfortably large grid; small axial offsets from here stay in bounds.
const PLAYER: Hex = { q: 8, r: 8 };
const E = HEX_DIRECTIONS[0]!; // the +q direction ({1,0}); a straight line of in-bounds hexes from the player
const adjacent = (h: Hex): Hex => hexAdd(h, E);
const along = (h: Hex, n: number): Hex => {
  let out = h;
  for (let i = 0; i < n; i += 1) out = hexAdd(out, E);
  return out;
};

/** A world with just a player (combatant) + grid, for the pure decideEnemy tests. Enemies added per test. */
function decideWorld(seed = 1): { world: World; grid: HexGrid; player: EntityId } {
  const grid = new HexGrid(24, 24);
  const world = createWorld(seed);
  const player = world.createEntity();
  world.store(Player).add(player, { isPlayer: true });
  world.store(HexPosition).add(player, { hex: PLAYER });
  world.store(Health).add(player, { hp: 30, maxHp: 30 });
  world.store(CombatStats).add(player, { armor: 0, baseArmor: 0 });
  world.store(Shield).add(player, { shield: 0 });
  return { world, grid, player };
}

/**
 * A world wired with ONLY the enemy turn (a trigger that emits TurnStarted{enemy} + the enemy-turn system +
 * the movement system). Each advance() is therefore one enemy phase: resolve pending telegraphs, then move +
 * re-telegraph every enemy. Lets the telegraph lifecycle be driven without the full turn engine.
 */
function enemyPhaseWorld(seed = 1): { world: World; grid: HexGrid; player: EntityId } {
  const grid = new HexGrid(24, 24);
  const world = createWorld(seed);
  world.addSystem((w) => w.emit({ kind: 'TurnStarted', phase: 'enemy' }));
  world.addSystem(makeEnemyTurnSystem(grid));
  world.addSystem(makeMovementSystem(grid, LAYOUT));
  const player = world.createEntity();
  world.store(Player).add(player, { isPlayer: true });
  world.store(HexPosition).add(player, { hex: PLAYER });
  world.store(Health).add(player, { hp: 30, maxHp: 30 });
  world.store(CombatStats).add(player, { armor: 0, baseArmor: 0 });
  world.store(Shield).add(player, { shield: 0 });
  return { world, grid, player };
}

/** A world wired like WorldScene.installSystems (turn -> enemy-turn -> movement -> shield) for integration. */
function fullTurnWorld(seed = 1): { world: World; grid: HexGrid; player: EntityId } {
  const grid = new HexGrid(24, 24);
  const world = createWorld(seed);
  world.addSystem(makeTurnSystem(grid));
  world.addSystem(makeEnemyTurnSystem(grid));
  world.addSystem(makeMovementSystem(grid, LAYOUT));
  world.addSystem(makeShieldSystem());
  const player = world.createEntity();
  world.store(Player).add(player, { isPlayer: true });
  world.store(HexPosition).add(player, { hex: PLAYER });
  world.store(FacingState).add(player, { facing: 'right' });
  world.store(TurnState).add(player, { phase: 'player', round: 1, activeActor: player });
  world.store(ResourcePool).add(player, { energy: 3, energyMax: 3, mana: 0, manaMax: 5, manaRegen: 1 });
  world.store(MovementBudget).add(player, { remaining: 5, max: 5 });
  world.store(Health).add(player, { hp: 30, maxHp: 30 });
  world.store(CombatStats).add(player, { armor: 0, baseArmor: 0 });
  world.store(Shield).add(player, { shield: 0 });
  return { world, grid, player };
}

const enemyHex = (world: World, e: EntityId): Hex => world.store(HexPosition).get(e)!.hex;
const playerHp = (world: World, p: EntityId): number => world.store(Health).get(p)!.hp;

/** The base damage of the attack an enemy actually telegraphed — reads its PlannedAttack + the chosen profile.
 *  Enemies now pick randomly between two attacks, so damage assertions read what was telegraphed rather than
 *  hard-coding one attack. */
const telegraphedDamage = (world: World, e: EntityId): number =>
  world.store(Attack).get(e)!.profiles[world.store(PlannedAttack).get(e)!.attackIndex]!.baseDamage;

/** A one-attack melee enemy def, so a telegraph is deterministic (no random pick) — for tests that need a
 *  fixed attack. `baseDamage` is the single claw's damage; movement 4 lets it close a few tiles. */
const singleAttackDef = (baseDamage: number): EnemyDef => ({
  id: 'test_melee',
  name: 'Test Melee',
  spriteKey: 'enemy_goblin_1',
  maxHp: 20,
  armor: 0,
  movement: 4,
  attacks: [{ name: 'jab', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage }],
});

describe('decideEnemy — greedy per-enemy utility (pure, deterministic)', () => {
  it('a melee enemy three tiles away moves to an adjacent hex (not onto the player) and telegraphs', () => {
    const { world, grid } = decideWorld();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, along(PLAYER, 3)); // movement 4, range 1
    const d = decideEnemy(world, grid, goblin, new Set());
    expect(d.kind).toBe('Act');
    if (d.kind !== 'Act') return;
    expect(hexDistance(d.dest, PLAYER)).toBe(1); // ends adjacent, in attack range
    expect(hexEquals(d.dest, PLAYER)).toBe(false); // never onto the player
    expect(d.attackChoices).toEqual([0, 1]); // both attacks (claw + pounce) are usable at range 1
  });

  it('a melee enemy already adjacent stays put and telegraphs (no wasted move)', () => {
    const { world, grid } = decideWorld();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER));
    const d = decideEnemy(world, grid, goblin, new Set());
    expect(d.kind).toBe('Act');
    if (d.kind !== 'Act') return;
    expect(hexEquals(d.dest, adjacent(PLAYER))).toBe(true); // stayed on its own hex
  });

  it('a pure-ranged enemy adjacent to the player kites back to its range band before telegraphing', () => {
    const { world, grid } = decideWorld();
    const queen = spawnEnemy(world, ARCHETYPES.elf_queen!, adjacent(PLAYER)); // both attacks minRange 2
    const d = decideEnemy(world, grid, queen, new Set());
    expect(d.kind).toBe('Act');
    if (d.kind !== 'Act') return;
    expect(hexDistance(d.dest, PLAYER)).toBeGreaterThanOrEqual(2); // moved out to where it can shoot
  });

  it('is deterministic — identical inputs give an identical decision (no RNG)', () => {
    const a = decideWorld(1);
    const goblinA = spawnEnemy(a.world, ARCHETYPES.goblin!, along(PLAYER, 3));
    const b = decideWorld(999); // a different seed must not change a pure decision
    const goblinB = spawnEnemy(b.world, ARCHETYPES.goblin!, along(PLAYER, 3));
    expect(decideEnemy(a.world, a.grid, goblinA, new Set())).toEqual(
      decideEnemy(b.world, b.grid, goblinB, new Set()),
    );
  });

  it('never ends on a blocked hex — a reserved destination forces a different choice', () => {
    const { world, grid } = decideWorld();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, along(PLAYER, 2));
    const free = decideEnemy(world, grid, goblin, new Set());
    expect(free.kind).toBe('Act');
    if (free.kind !== 'Act') return;
    const blocked = new Set<string>([`${free.dest.q},${free.dest.r}`]);
    const d = decideEnemy(world, grid, goblin, blocked);
    if (d.kind !== 'Wait') expect(hexEquals(d.dest, free.dest)).toBe(false); // avoided the blocked hex
  });

  it('excludes an attack that is on cooldown from attackChoices, keeping the available one', () => {
    const { world, grid } = decideWorld();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER)); // claw(0) + pounce(1)
    world.store(AttackCooldowns).get(goblin)!.remaining[1] = 2; // pounce on cooldown
    const d = decideEnemy(world, grid, goblin, new Set());
    expect(d.kind).toBe('Act');
    if (d.kind !== 'Act') return;
    expect(d.attackChoices).toEqual([0]); // only the off-cooldown basic remains selectable
  });

  it('reads cooldowns but never mutates them (still pure)', () => {
    const { world, grid } = decideWorld();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER));
    world.store(AttackCooldowns).get(goblin)!.remaining[1] = 2;
    const before = [...world.store(AttackCooldowns).get(goblin)!.remaining];
    decideEnemy(world, grid, goblin, new Set());
    expect(world.store(AttackCooldowns).get(goblin)!.remaining).toEqual(before); // unchanged by a decision
  });
});

describe('enemy turn — telegraph plan & deferred resolution', () => {
  it('plans a telegraph and deals NO immediate damage', () => {
    const { world, player } = enemyPhaseWorld();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER));
    const evs = advance(world); // one enemy phase
    const plan = world.store(PlannedAttack).get(goblin);
    expect(plan).toBeDefined();
    expect([0, 1]).toContain(plan!.attackIndex); // one of the goblin's two attacks
    expect(plan!.hexes.some((h) => hexEquals(h, PLAYER))).toBe(true); // the pattern always covers the aim
    expect(evs.some((e) => e.kind === 'AttackPlanned')).toBe(true);
    expect(playerHp(world, player)).toBe(30); // attack is deferred, not applied now
  });

  it('moves a distant enemy toward the player within its movement budget', () => {
    const { world } = enemyPhaseWorld();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, along(PLAYER, 3));
    advance(world);
    expect(hexDistance(enemyHex(world, goblin), PLAYER)).toBe(1); // closed to attack range this turn
  });

  it('resolves last turn’s telegraph against the player still standing on the locked hex', () => {
    const { world, player } = enemyPhaseWorld();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER)); // armour 0
    advance(world); // phase 1: plan onto the player's hex
    const dmg = telegraphedDamage(world, goblin); // claw (4) or pounce (5) — whichever was rolled
    advance(world); // phase 2: resolve it (player did not move), then re-plan
    expect(playerHp(world, player)).toBe(30 - dmg);
  });

  it('a player who steps off the locked hex DODGES — the telegraph misses', () => {
    const { world, player } = enemyPhaseWorld();
    spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER));
    advance(world); // phase 1: plan onto PLAYER
    world.store(HexPosition).get(player)!.hex = along(PLAYER, 5); // the player moves away on their turn
    advance(world); // phase 2: resolve — nobody on the locked hex
    expect(playerHp(world, player)).toBe(30); // no damage
  });

  it('a killed enemy’s telegraph is cancelled (no damage)', () => {
    const { world, player } = enemyPhaseWorld();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER));
    advance(world); // phase 1: plan
    world.destroyEntity(goblin); // the player kills it during their turn
    advance(world); // phase 2: nothing to resolve
    expect(playerHp(world, player)).toBe(30);
  });

  it('the player’s Shield soaks a telegraphed hit before HP', () => {
    const { world, player } = enemyPhaseWorld();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER));
    advance(world); // plan
    const dmg = telegraphedDamage(world, goblin); // 4 or 5, both > the 2 shield
    world.store(Shield).get(player)!.shield = 2; // a Defend played that turn
    advance(world); // resolve: shield 2 soaks 2 -> (dmg - 2) to HP
    expect(world.store(Shield).get(player)?.shield).toBe(0);
    expect(playerHp(world, player)).toBe(30 - (dmg - 2));
  });

  it('a telegraph CAN kill the player — HP hits 0, PlayerDefeated fires, the player entity survives (Core Gaps)', () => {
    const { world, player } = enemyPhaseWorld();
    spawnEnemy(world, ARCHETYPES.dragon!, adjacent(PLAYER)); // bite 12
    world.store(Health).get(player)!.hp = 5;
    advance(world); // plan (bite, the highest-damage in-range attack)
    const evs = advance(world); // resolve: a lethal telegraphed hit (no survive-at-1 floor any more)
    expect(playerHp(world, player)).toBe(0);
    // The player entity is NOT destroyed (it owns TurnState/DeckState/etc.) — the run-lifecycle branch in
    // applyDamage emits PlayerDefeated instead of EntityDied, and the scene opens the defeat screen.
    expect(world.isAlive(player)).toBe(true);
    expect(evs.some((e) => e.kind === 'PlayerDefeated' && e.entity === player)).toBe(true);
    expect(evs.some((e) => e.kind === 'EntityDied' && e.entity === player)).toBe(false);
  });

  it('two enemies never stack and never land on the player', () => {
    const { world, player } = enemyPhaseWorld();
    const a = spawnEnemy(world, ARCHETYPES.goblin!, along(PLAYER, 2));
    const b = spawnEnemy(world, ARCHETYPES.goblin!, along(PLAYER, 3));
    advance(world);
    const ha = enemyHex(world, a);
    const hb = enemyHex(world, b);
    expect(hexEquals(ha, hb)).toBe(false);
    expect(hexEquals(ha, PLAYER)).toBe(false);
    expect(hexEquals(hb, PLAYER)).toBe(false);
  });

  it('never ends its move on a Health-less prop (chest / disguised mimic) — props are reserved too', () => {
    // Discover where the goblin chooses to stand with the tile FREE...
    const free = enemyPhaseWorld();
    const freeGoblin = spawnEnemy(free.world, ARCHETYPES.goblin!, along(PLAYER, 2));
    advance(free.world);
    const chosen = enemyHex(free.world, freeGoblin);

    // ...then drop a Health-less prop on that exact hex. A chest / disguised mimic has a HexPosition but NO
    // Health; before the occupancy fix it was invisible to the no-stacking set, so the enemy stacked on it.
    const { world } = enemyPhaseWorld();
    const prop = world.createEntity();
    world.store(HexPosition).add(prop, { hex: chosen });
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, along(PLAYER, 2));
    advance(world);
    expect(hexEquals(enemyHex(world, goblin), chosen)).toBe(false); // did NOT stack on the prop
    expect(hexDistance(enemyHex(world, goblin), PLAYER)).toBe(1); // still closed to attack range elsewhere
  });

  it('a telegraph never hits another enemy — only the player (no friendly fire)', () => {
    const { world } = enemyPhaseWorld();
    const attacker = spawnEnemy(world, ARCHETYPES.goblin!, along(PLAYER, 6));
    const bystander = spawnEnemy(world, ARCHETYPES.goblin!, along(PLAYER, 8));
    const before = world.store(Health).get(bystander)!.hp;
    // Hand-plant a telegraph from `attacker` locked onto the bystander's hex (NOT the player's). The enemy
    // phase resolves pending telegraphs first; with player-only resolution the enemy must take no damage.
    world.store(PlannedAttack).add(attacker, { attackIndex: 0, hexes: [enemyHex(world, bystander)] });
    advance(world);
    expect(world.store(Health).get(bystander)!.hp).toBe(before);
  });
});

describe('enemy turn — integration with the Turn Engine (real wiring)', () => {
  it('one EndTurn moves a distant enemy AND telegraphs it in the same advance', () => {
    const { world, player } = fullTurnWorld();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, along(PLAYER, 3));
    advance(world, [{ kind: 'EndTurn', entity: player }]);
    expect(hexDistance(enemyHex(world, goblin), PLAYER)).toBe(1); // moved this step (MoveTo resolved same advance)
    expect(world.store(PlannedAttack).get(goblin)).toBeDefined(); // and planned its telegraph
    expect(playerHp(world, player)).toBe(30); // nothing resolved yet
  });

  it('the next EndTurn resolves the telegraph, damaging the player', () => {
    const { world, player } = fullTurnWorld();
    spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER));
    advance(world, [{ kind: 'EndTurn', entity: player }]); // plan
    advance(world, [{ kind: 'EndTurn', entity: player }]); // resolve
    expect(playerHp(world, player)).toBeLessThan(30);
  });

  it('resolution reads the player’s live Shield before the shield system wipes it', () => {
    const { world, player } = fullTurnWorld();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER));
    advance(world, [{ kind: 'EndTurn', entity: player }]); // plan (and the shield system wipes shield at player-turn start)
    const dmg = telegraphedDamage(world, goblin); // 4 or 5, both > the 3 shield
    world.store(Shield).get(player)!.shield = 3; // the player Defends during their turn
    advance(world, [{ kind: 'EndTurn', entity: player }]); // resolve: (dmg - shield 3) to HP, then shield wiped
    expect(playerHp(world, player)).toBe(30 - (dmg - 3));
    expect(world.store(Shield).get(player)?.shield).toBe(0);
  });
});

describe('enemy attack patterns — random pick, cooldowns & multi-hex telegraphs', () => {
  // A test enemy whose basic (index 0) is out of melee range (minRange 3) and whose special (index 1) is a
  // r1 blast on a 2-turn cooldown: adjacent to the player only the special is usable, so the pick is forced
  // and its cooldown can be watched gate it.
  const specialOnlyDef: EnemyDef = {
    id: 'test_special',
    name: 'Test Special',
    spriteKey: 'enemy_goblin_1',
    maxHp: 20,
    armor: 0,
    movement: 1,
    attacks: [
      { name: 'far_poke', minRange: 3, maxRange: 3, requiresLineOfSight: false, baseDamage: 2 },
      { name: 'nova', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage: 5, pattern: { kind: 'blast', size: 1 }, cooldown: 2 },
    ],
  };

  it('the written telegraph equals the attack pattern clipped to the map and always covers the player', () => {
    const { world, grid } = enemyPhaseWorld();
    const orc = spawnEnemy(world, ARCHETYPES.orc!, adjacent(PLAYER)); // basic single or special blast(1)
    advance(world);
    const plan = world.store(PlannedAttack).get(orc)!;
    const profile = world.store(Attack).get(orc)!.profiles[plan.attackIndex]!;
    const expected = attackPatternHexes(profile.pattern, enemyHex(world, orc), PLAYER).filter((h) =>
      grid.inBounds(h),
    );
    expect(plan.hexes).toEqual(expected);
    expect(plan.hexes.some((h) => hexEquals(h, PLAYER))).toBe(true); // the aim is always threatened
  });

  it('randomly picks among the usable attacks across seeds — both the basic and the special appear', () => {
    const chosen = new Set<number>();
    for (let seed = 1; seed <= 20; seed += 1) {
      const { world } = enemyPhaseWorld(seed);
      const goblin = spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER)); // claw(0) + pounce(1), both r1
      advance(world);
      chosen.add(world.store(PlannedAttack).get(goblin)!.attackIndex);
    }
    expect(chosen.has(0)).toBe(true);
    expect(chosen.has(1)).toBe(true); // selection is randomized, not a fixed highest-damage pick
  });

  it('replays identically for a given seed (the added attack-pick draw is seeded)', () => {
    const run = (): number[] => {
      const { world } = enemyPhaseWorld(7);
      const a = spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER));
      const b = spawnEnemy(world, ARCHETYPES.slime!, along(PLAYER, 1));
      advance(world);
      return [world.store(PlannedAttack).get(a)!.attackIndex, world.store(PlannedAttack).get(b)?.attackIndex ?? -1];
    };
    expect(run()).toEqual(run()); // same seed + inputs -> identical picks
  });

  it('sets a special’s cooldown when telegraphed and does not re-select it until the counter ticks to 0', () => {
    const { world } = enemyPhaseWorld();
    const e = spawnEnemy(world, specialOnlyDef, adjacent(PLAYER));

    advance(world); // turn 1: only the special is usable at range 1 -> telegraphs it
    expect(world.store(PlannedAttack).get(e)!.attackIndex).toBe(1);
    expect(world.store(AttackCooldowns).get(e)!.remaining[1]).toBe(2); // put on cooldown

    advance(world); // turn 2: tick -> 1; special on cooldown and the basic is out of range -> nothing to telegraph
    expect(world.store(AttackCooldowns).get(e)!.remaining[1]).toBe(1);
    expect(world.store(PlannedAttack).get(e)).toBeUndefined();

    advance(world); // turn 3: tick -> 0; special usable again -> telegraphs it (used at most every other turn)
    expect(world.store(AttackCooldowns).get(e)!.remaining[1]).toBe(2);
    expect(world.store(PlannedAttack).get(e)!.attackIndex).toBe(1);
  });

  it('cooldowns tick every enemy turn even for an enemy that only moves (no attack)', () => {
    const { world } = enemyPhaseWorld();
    const golem = spawnEnemy(world, ARCHETYPES.lava_golem!, along(PLAYER, 6)); // movement 1, both attacks r1
    world.store(AttackCooldowns).get(golem)!.remaining[1] = 2;
    advance(world); // too far to attack -> Move; cooldowns still tick
    expect(world.store(PlannedAttack).get(golem)).toBeUndefined(); // did not attack
    expect(world.store(AttackCooldowns).get(golem)!.remaining[1]).toBe(1); // but the counter ticked
  });

  it('a multi-hex telegraph lands when the player is on ANY covered hex, not just the centre', () => {
    const { world, player } = enemyPhaseWorld();
    const orc = spawnEnemy(world, ARCHETYPES.orc!, along(PLAYER, 6)); // far; the hand-planted plan resolves first
    const centre = adjacent(PLAYER); // blast centred one tile off the player, so the player is a non-centre hex
    const hexes = attackPatternHexes({ kind: 'blast', size: 1 }, enemyHex(world, orc), centre);
    expect(hexes.some((h) => hexEquals(h, PLAYER))).toBe(true); // the player IS under the blast (a neighbour)
    world.store(PlannedAttack).add(orc, { attackIndex: 1, hexes });
    advance(world); // resolvePendingTelegraphs fires it before the orc re-plans
    expect(playerHp(world, player)).toBeLessThan(30); // hit on a non-centre covered hex
  });

  it('a player off EVERY covered hex of a multi-hex telegraph takes no damage', () => {
    const { world, player } = enemyPhaseWorld();
    const orc = spawnEnemy(world, ARCHETYPES.orc!, along(PLAYER, 6));
    const centre = along(PLAYER, 3); // blast far from the player — none of its hexes is the player's
    const hexes = attackPatternHexes({ kind: 'blast', size: 1 }, enemyHex(world, orc), centre);
    expect(hexes.some((h) => hexEquals(h, PLAYER))).toBe(false);
    world.store(PlannedAttack).add(orc, { attackIndex: 1, hexes });
    advance(world);
    expect(playerHp(world, player)).toBe(30); // dodged the whole pattern
  });
});

describe('persistence (ADR-010 round-trip)', () => {
  it('a PlannedAttack telegraph survives serialize -> restore', () => {
    const world = createWorld(3);
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, { q: 2, r: 1 });
    world.store(PlannedAttack).add(goblin, { attackIndex: 0, hexes: [{ q: 3, r: 1 }] });

    const restored = restoreWorld(serializeWorld(world));

    expect(restored.store(PlannedAttack).get(goblin)).toEqual({ attackIndex: 0, hexes: [{ q: 3, r: 1 }] });
  });

  it('AttackCooldowns survive serialize -> restore (a mid-cooldown enemy resumes mid-cooldown)', () => {
    const world = createWorld(5);
    const orc = spawnEnemy(world, ARCHETYPES.orc!, { q: 2, r: 1 }); // two attacks -> remaining length 2
    world.store(AttackCooldowns).get(orc)!.remaining[1] = 2;

    const restored = restoreWorld(serializeWorld(world));

    expect(restored.store(AttackCooldowns).get(orc)!.remaining).toEqual([0, 2]);
  });

  it('SAVE_VERSION is at least 18 (AttackCooldowns added to the persisted shape)', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(18);
  });
});
