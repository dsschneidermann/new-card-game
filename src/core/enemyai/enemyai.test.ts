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
  TurnState,
  ResourcePool,
  MovementBudget,
  spawnEnemy,
  ARCHETYPES,
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

describe('decideEnemy — greedy per-enemy utility (pure, deterministic)', () => {
  it('a melee enemy three tiles away moves to an adjacent hex (not onto the player) and telegraphs', () => {
    const { world, grid } = decideWorld();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, along(PLAYER, 3)); // movement 4, range 1
    const d = decideEnemy(world, grid, goblin, new Set());
    expect(d.kind).toBe('Act');
    if (d.kind !== 'Act') return;
    expect(hexDistance(d.dest, PLAYER)).toBe(1); // ends adjacent, in attack range
    expect(hexEquals(d.dest, PLAYER)).toBe(false); // never onto the player
    expect(d.targetHexes).toEqual([PLAYER]); // the telegraph targets the player's current hex
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
});

describe('enemy turn — telegraph plan & deferred resolution', () => {
  it('plans a telegraph and deals NO immediate damage', () => {
    const { world, player } = enemyPhaseWorld();
    const goblin = spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER));
    const evs = advance(world); // one enemy phase
    expect(world.store(PlannedAttack).get(goblin)).toMatchObject({ attackIndex: 0, hexes: [PLAYER] });
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
    spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER)); // claw 4, armour 0
    advance(world); // phase 1: plan onto the player's hex
    advance(world); // phase 2: resolve it (player did not move), then re-plan
    expect(playerHp(world, player)).toBe(26); // 30 - claw 4
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
    spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER));
    advance(world); // plan
    world.store(Shield).get(player)!.shield = 2; // a Defend played that turn
    advance(world); // resolve: claw 4, shield 2 soaks 2 -> 2 to HP
    expect(world.store(Shield).get(player)?.shield).toBe(0);
    expect(playerHp(world, player)).toBe(28);
  });

  it('a telegraph never kills the player — HP is floored at 1 (loss condition deferred, ADR-010)', () => {
    const { world, player } = enemyPhaseWorld();
    spawnEnemy(world, ARCHETYPES.dragon!, adjacent(PLAYER)); // bite 12
    world.store(Health).get(player)!.hp = 5;
    advance(world); // plan (bite, the highest-damage in-range attack)
    const evs = advance(world); // resolve: 12 damage would kill, but is floored
    expect(playerHp(world, player)).toBe(1);
    expect(world.isAlive(player)).toBe(true);
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
    spawnEnemy(world, ARCHETYPES.goblin!, adjacent(PLAYER)); // claw 4
    advance(world, [{ kind: 'EndTurn', entity: player }]); // plan (and the shield system wipes shield at player-turn start)
    world.store(Shield).get(player)!.shield = 3; // the player Defends during their turn
    advance(world, [{ kind: 'EndTurn', entity: player }]); // resolve: claw 4 - shield 3 = 1 to HP, then shield wiped
    expect(playerHp(world, player)).toBe(29);
    expect(world.store(Shield).get(player)?.shield).toBe(0);
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

  it('SAVE_VERSION is 15 (telegraphs added to the persisted shape)', () => {
    expect(SAVE_VERSION).toBe(15);
  });
});
