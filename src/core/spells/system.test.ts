import { describe, it, expect } from 'vitest';
import {
  createWorld,
  advance,
  HexGrid,
  HexPosition,
  Player,
  TurnState,
  ResourcePool,
  Health,
  makeTurnSystem,
  makeSpellSystem,
  spawnEnemy,
  ARCHETYPES,
  type World,
  type EntityId,
  type Hex,
} from '@core/index';

/** A world with the turn + spell systems and a player able to cast (player phase, ample mana). */
function setup(): { world: World; player: EntityId; grid: HexGrid } {
  const grid = new HexGrid(16, 16);
  const world = createWorld(1);
  world.addSystem(makeTurnSystem(grid));
  world.addSystem(makeSpellSystem(grid));
  const player = world.createEntity();
  world.store(Player).add(player, { isPlayer: true });
  world.store(HexPosition).add(player, { hex: { q: 0, r: 0 } });
  world.store(TurnState).add(player, { phase: 'player', round: 1, activeActor: player });
  world.store(ResourcePool).add(player, { energy: 3, energyMax: 3, mana: 10, manaMax: 10, manaRegen: 1 });
  world.store(Health).add(player, { hp: 10, maxHp: 30 });
  return { world, player, grid };
}

const hpOf = (world: World, e: EntityId): number | undefined => world.store(Health).get(e)?.hp;
const posOf = (world: World, e: EntityId): Hex | undefined => world.store(HexPosition).get(e)?.hex;

describe('Blizzard (areaOfEffect Attack spell)', () => {
  it('damages every enemy within the radius-1 disk of the centre and leaves enemies outside it untouched', () => {
    const { world, player } = setup();
    const centre: Hex = { q: 5, r: 5 };
    const atCentre = spawnEnemy(world, ARCHETYPES.goblin!, centre); // in the disk
    const adjacent = spawnEnemy(world, ARCHETYPES.goblin!, { q: 6, r: 5 }); // distance 1 — in the disk
    const faraway = spawnEnemy(world, ARCHETYPES.goblin!, { q: 8, r: 5 }); // distance 3 — outside
    const startHp = hpOf(world, atCentre)!;

    advance(world, [{ kind: 'PlaySpell', entity: player, spellId: 'blizzard', manaCost: 3, targets: [centre] }]);

    expect(hpOf(world, atCentre)).toBeLessThan(startHp);
    expect(hpOf(world, adjacent)).toBeLessThan(startHp);
    expect(hpOf(world, faraway)).toBe(startHp); // untouched
    // mana was spent by the turn engine
    expect(world.store(ResourcePool).get(player)?.mana).toBe(7);
  });
});

describe('Self Heal (Heal spell)', () => {
  it('restores the caster HP clamped to maxHp', () => {
    const { world, player } = setup(); // player starts at 10/30
    advance(world, [{ kind: 'PlaySpell', entity: player, spellId: 'selfheal', manaCost: 2 }]);
    expect(hpOf(world, player)).toBe(18); // 10 + 8
  });

  it('never overheals past maxHp', () => {
    const { world, player } = setup();
    world.store(Health).get(player)!.hp = 28; // near full
    advance(world, [{ kind: 'PlaySpell', entity: player, spellId: 'selfheal', manaCost: 2 }]);
    expect(hpOf(world, player)).toBe(30);
  });
});

describe('Teleport (TeleportEnemy spell)', () => {
  it('moves the targeted enemy to a free destination hex', () => {
    const { world, player } = setup();
    const from: Hex = { q: 4, r: 4 };
    const to: Hex = { q: 6, r: 6 };
    const enemy = spawnEnemy(world, ARCHETYPES.goblin!, from);
    advance(world, [{ kind: 'PlaySpell', entity: player, spellId: 'teleport', manaCost: 2, targets: [from, to] }]);
    expect(posOf(world, enemy)).toEqual(to);
  });

  it('fizzles when there is no enemy on the first hex', () => {
    const { world, player } = setup();
    const before = [...world.entitiesWith(HexPosition)].map((e) => posOf(world, e));
    advance(world, [
      { kind: 'PlaySpell', entity: player, spellId: 'teleport', manaCost: 2, targets: [{ q: 4, r: 4 }, { q: 6, r: 6 }] },
    ]);
    const after = [...world.entitiesWith(HexPosition)].map((e) => posOf(world, e));
    expect(after).toEqual(before); // nothing moved
  });

  it('fizzles when the destination is occupied', () => {
    const { world, player } = setup();
    const from: Hex = { q: 4, r: 4 };
    const occupied: Hex = { q: 5, r: 4 };
    const mover = spawnEnemy(world, ARCHETYPES.goblin!, from);
    spawnEnemy(world, ARCHETYPES.goblin!, occupied); // another actor blocks the landing hex
    advance(world, [
      { kind: 'PlaySpell', entity: player, spellId: 'teleport', manaCost: 2, targets: [from, occupied] },
    ]);
    expect(posOf(world, mover)).toEqual(from); // did not move
  });

  it('fizzles when the destination is out of bounds or movement-blocked', () => {
    const { world, player, grid } = setup();
    const from: Hex = { q: 4, r: 4 };
    const blocked: Hex = { q: 5, r: 4 };
    grid.setWalkable(blocked, false);
    const mover = spawnEnemy(world, ARCHETYPES.goblin!, from);
    advance(world, [
      { kind: 'PlaySpell', entity: player, spellId: 'teleport', manaCost: 2, targets: [from, blocked] },
    ]);
    expect(posOf(world, mover)).toEqual(from);
  });
});
