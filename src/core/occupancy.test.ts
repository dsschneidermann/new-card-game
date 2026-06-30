import { describe, it, expect } from 'vitest';
import {
  createWorld,
  advance,
  HexGrid,
  HexPosition,
  Player,
  Health,
  TurnState,
  MovementBudget,
  spawnEnemy,
  spawnMimic,
  ARCHETYPES,
  makeMovementSystem,
  findPath,
  canMove,
  hasLineOfSight,
  enemyOccupiedHexes,
  playerMoveBlockers,
  hexKey,
  type Hex,
  type HexLayout,
} from '@core/index';

const LAYOUT: HexLayout = { width: 64, height: 48, rowPitch: 36, originX: 192, originY: 76 };
const GOBLIN = ARCHETYPES['goblin']!;

// A pure-+q straight line {6,8} -> {10,8} passes through {8,8}: the only 4-step (shortest) route is four +q
// hops, so an enemy parked on {8,8} forces a strictly longer detour — handy for the blocking assertions.
const FROM: Hex = { q: 6, r: 8 };
const ENEMY_HEX: Hex = { q: 8, r: 8 };
const BEYOND: Hex = { q: 10, r: 8 };

describe('enemyOccupiedHexes', () => {
  it('includes a living revealed enemy; excludes a disguised mimic, a propless prop, a dead enemy, and the player', () => {
    const world = createWorld(1);

    const player = world.createEntity();
    world.store(Player).add(player, { isPlayer: true });
    world.store(HexPosition).add(player, { hex: { q: 0, r: 0 } });
    world.store(Health).add(player, { hp: 30, maxHp: 30 });

    spawnEnemy(world, GOBLIN, ENEMY_HEX); // Enemy + Health -> blocks

    spawnMimic(world, { q: 5, r: 0 }); // disguised: Enemy + HexPosition, NO Health -> excluded

    const chestLikeProp = world.createEntity(); // HexPosition only (no Enemy) -> excluded
    world.store(HexPosition).add(chestLikeProp, { hex: { q: 7, r: 0 } });

    const dead = spawnEnemy(world, GOBLIN, { q: 9, r: 0 });
    world.destroyEntity(dead); // destroyed -> excluded

    const occupied = enemyOccupiedHexes(world);
    expect(occupied.has(hexKey(ENEMY_HEX))).toBe(true);
    expect(occupied.has(hexKey({ q: 5, r: 0 }))).toBe(false); // mimic (no Health)
    expect(occupied.has(hexKey({ q: 7, r: 0 }))).toBe(false); // chest-like prop (no Enemy)
    expect(occupied.has(hexKey({ q: 9, r: 0 }))).toBe(false); // destroyed enemy
    expect(occupied.has(hexKey({ q: 0, r: 0 }))).toBe(false); // player
    expect(occupied.size).toBe(1);
  });
});

describe('playerMoveBlockers (player-only scope)', () => {
  it('returns the enemy hexes for the player but an empty set for an enemy mover', () => {
    const world = createWorld(1);
    const player = world.createEntity();
    world.store(Player).add(player, { isPlayer: true });
    world.store(HexPosition).add(player, { hex: { q: 0, r: 0 } });
    const enemy = spawnEnemy(world, GOBLIN, ENEMY_HEX);

    expect(playerMoveBlockers(world, player).has(hexKey(ENEMY_HEX))).toBe(true);
    expect(playerMoveBlockers(world, enemy).size).toBe(0); // an enemy's own move is never blocked
  });
});

describe('enemies block player movement (low-obstacle resolution)', () => {
  const startedPath = (evs: ReturnType<typeof advance>): readonly Hex[] =>
    (evs.find((e) => e.kind === 'MovementStarted') as { path: readonly Hex[] }).path;

  it('a player MoveTo detours around a living enemy and still reaches the target', () => {
    const grid = new HexGrid(24, 24);
    const world = createWorld(1);
    world.addSystem(makeMovementSystem(grid, LAYOUT, playerMoveBlockers));
    const player = world.createEntity();
    world.store(Player).add(player, { isPlayer: true });
    world.store(HexPosition).add(player, { hex: FROM });
    world.store(Health).add(player, { hp: 30, maxHp: 30 });
    spawnEnemy(world, GOBLIN, ENEMY_HEX); // sits on the straight line to BEYOND

    const path = startedPath(advance(world, [{ kind: 'MoveTo', entity: player, q: BEYOND.q, r: BEYOND.r }]));
    expect(path.some((h) => hexKey(h) === hexKey(ENEMY_HEX))).toBe(false); // never steps onto the enemy
    expect((world.store(HexPosition).get(player) as { hex: Hex }).hex).toEqual(BEYOND); // still arrives
  });

  it('an enemy MoveTo is NOT blocked by another enemy (player-only) — it paths straight through', () => {
    const grid = new HexGrid(24, 24);
    const world = createWorld(1);
    world.addSystem(makeMovementSystem(grid, LAYOUT, playerMoveBlockers));
    const mover = spawnEnemy(world, GOBLIN, FROM);
    spawnEnemy(world, GOBLIN, ENEMY_HEX); // another enemy on the straight line

    const path = startedPath(advance(world, [{ kind: 'MoveTo', entity: mover, q: BEYOND.q, r: BEYOND.r }]));
    expect(path.some((h) => hexKey(h) === hexKey(ENEMY_HEX))).toBe(true); // unchanged: through the other enemy
    expect((world.store(HexPosition).get(mover) as { hex: Hex }).hex).toEqual(BEYOND);
  });

  it('the turn budget reflects the around-route and an enemy hex is never a valid destination', () => {
    const grid = new HexGrid(24, 24);
    const world = createWorld(1);
    const player = world.createEntity();
    world.store(Player).add(player, { isPlayer: true });
    world.store(HexPosition).add(player, { hex: FROM });
    world.store(TurnState).add(player, { phase: 'player', round: 1 });
    world.store(MovementBudget).add(player, { remaining: 99, max: 99 });
    spawnEnemy(world, GOBLIN, ENEMY_HEX);

    const straightCost = findPath(grid, FROM, BEYOND).length - 1;
    const aroundCost = findPath(grid, FROM, BEYOND, enemyOccupiedHexes(world)).length - 1;
    expect(aroundCost).toBeGreaterThan(straightCost); // the enemy forces a longer route

    world.store(MovementBudget).get(player)!.remaining = aroundCost;
    expect(canMove(world, grid, player, BEYOND).ok).toBe(true); // fits when the budget covers the detour

    world.store(MovementBudget).get(player)!.remaining = straightCost;
    expect(canMove(world, grid, player, BEYOND).ok).toBe(false); // the straight-line cost no longer suffices

    world.store(MovementBudget).get(player)!.remaining = 99;
    expect(canMove(world, grid, player, ENEMY_HEX).ok).toBe(false); // cannot stop ON the enemy
  });

  it('an enemy does NOT block line of sight (it is a LOW obstacle, not a TALL one)', () => {
    const grid = new HexGrid(24, 24);
    const world = createWorld(1);
    spawnEnemy(world, GOBLIN, ENEMY_HEX); // directly between FROM and BEYOND
    expect(grid.blocksSight(ENEMY_HEX)).toBe(false); // movement occupancy never touches the sight flags
    expect(hasLineOfSight((h) => grid.blocksSight(h), FROM, BEYOND)).toBe(true); // the ray stays clear
  });
});
