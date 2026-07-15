import { describe, it, expect } from 'vitest';
import {
  createWorld,
  advance,
  serializeWorld,
  restoreWorld,
  makeRng,
  HexGrid,
  HexPosition,
  FacingState,
  Player,
  TurnState,
  ResourcePool,
  MovementBudget,
  makeTurnSystem,
  makeMovementSystem,
  makeInteractSystem,
  DeckState,
  Card,
  Equipment,
  equipItem,
  Chest,
  ChestOffer,
  OfferedItem,
  CHEST_CARD_POOL,
  CHEST_ITEM_POOL,
  CHEST_OFFER_SIZE,
  rollChestOffer,
  rollChestRewardOffer,
  spawnChest,
  chestAt,
  unopenedChestAt,
  takeChestReward,
  PendingInteraction,
  interactStopHex,
  Mimic,
  MIMIC_ART,
  spawnMimic,
  disguisedMimicAt,
  revealMimic,
  Enemy,
  Health,
  CombatStats,
  Attack,
  AttackCooldowns,
  Archetype,
  Shield,
  ARCHETYPES,
  enemyOccupiedHexes,
  cardDef,
  itemDef,
  offsetToAxial,
  hexDistance,
  hexKey,
  findPath,
  generateForestObstacles,
  generateForestChests,
  forestMimicIndex,
  forestPropFacing,
  FOREST_CHEST_MIN,
  FOREST_CHEST_MAX,
  type World,
  type EntityId,
  type Hex,
  type HexLayout,
  type GameEvent,
  type DeckStateData,
} from '@core/index';

/** An owner entity with an empty deck + empty equipment (the chest reward lands in its discard / its slots). */
function makeOwner(world: World): EntityId {
  const owner = world.createEntity();
  world.store(DeckState).add(owner, { drawPile: [], hand: [], discardPile: [] } as DeckStateData);
  world.store(Equipment).add(owner, { slots: {} });
  return owner;
}

/** Count card vs item options in a rolled offer. */
function classify(world: World, options: readonly EntityId[]): { cards: number; items: number } {
  let cards = 0;
  let items = 0;
  for (const o of options) {
    if (world.store(Card).get(o) !== undefined) cards += 1;
    else if (world.store(OfferedItem).get(o) !== undefined) items += 1;
  }
  return { cards, items };
}

/** A stable signature of a rolled offer (card defIds + item defIds) for determinism comparisons. */
function offerSignature(world: World, chest: EntityId): string[] {
  const options = world.store(ChestOffer).get(chest)?.options ?? [];
  return options
    .map((o) => {
      const card = world.store(Card).get(o);
      if (card !== undefined) return `card:${card.defId}`;
      return `item:${world.store(OfferedItem).get(o)?.defId ?? '?'}`;
    })
    .sort();
}

describe('rollChestOffer', () => {
  it('returns 3 distinct ids from the pool and is deterministic for a fixed seed', () => {
    const a = rollChestOffer(makeRng(7), CHEST_CARD_POOL);
    const b = rollChestOffer(makeRng(7), CHEST_CARD_POOL);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    for (const id of a) expect(CHEST_CARD_POOL).toContain(id);
  });

  it('clamps to the pool size with no duplicates when the pool is smaller than n', () => {
    const out = rollChestOffer(makeRng(1), ['quickdraw', 'recall'], 3);
    expect([...out].sort()).toEqual(['quickdraw', 'recall']);
  });
});

describe('rollChestRewardOffer (open-time mixed offer)', () => {
  it('rolls CHEST_OFFER_SIZE distinct option entities with a guaranteed mix of >=1 card and >=1 item', () => {
    const world = createWorld(2);
    const owner = makeOwner(world);
    const chest = spawnChest(world, { q: 0, r: 0 });
    rollChestRewardOffer(world, owner, chest);
    const options = world.store(ChestOffer).get(chest)?.options ?? [];
    expect(options).toHaveLength(CHEST_OFFER_SIZE);
    expect(new Set(options).size).toBe(CHEST_OFFER_SIZE);
    const { cards, items } = classify(world, options);
    expect(cards).toBeGreaterThanOrEqual(1);
    expect(items).toBeGreaterThanOrEqual(1);
    expect(cards + items).toBe(CHEST_OFFER_SIZE);
  });

  it('never offers an item whose def is already equipped on the owner', () => {
    const world = createWorld(3);
    const owner = makeOwner(world);
    equipItem(world, owner, 'rusty_dagger'); // a CHEST_ITEM_POOL item
    const chest = spawnChest(world, { q: 0, r: 0 });
    for (let i = 0; i < 40; i += 1) {
      rollChestRewardOffer(world, owner, chest);
      for (const o of world.store(ChestOffer).get(chest)?.options ?? []) {
        expect(world.store(OfferedItem).get(o)?.defId).not.toBe('rusty_dagger');
      }
    }
  });

  it('same-kind items share a slot, so equipping every pool item still leaves items eligible', () => {
    const world = createWorld(4);
    const owner = makeOwner(world);
    // Equip every pool item. The distinct-kind gear all sticks, but the three amulets share ONE slot and the
    // dagger + potion share the backup slot, so several items can never be worn at once — those un-equipped
    // items remain eligible, so the offer is NOT forced to all-cards. (A single-kind pool would exhaust items.)
    for (const id of CHEST_ITEM_POOL) equipItem(world, owner, id);
    const chest = spawnChest(world, { q: 0, r: 0 });
    rollChestRewardOffer(world, owner, chest);
    const options = world.store(ChestOffer).get(chest)?.options ?? [];
    const { cards, items } = classify(world, options);
    expect(items).toBeGreaterThan(0); // the un-equipped amulets + backup item stay eligible
    expect(cards + items).toBe(CHEST_OFFER_SIZE);
  });

  it('is deterministic for a fixed rng state', () => {
    const a = createWorld(9);
    const b = createWorld(9);
    const oa = makeOwner(a);
    const ob = makeOwner(b);
    const ca = spawnChest(a, { q: 0, r: 0 });
    const cb = spawnChest(b, { q: 0, r: 0 });
    rollChestRewardOffer(a, oa, ca);
    rollChestRewardOffer(b, ob, cb);
    expect(offerSignature(a, ca)).toEqual(offerSignature(b, cb));
  });

  it('destroys the previous offer when re-rolled (no leaked option entities)', () => {
    const world = createWorld(5);
    const owner = makeOwner(world);
    const chest = spawnChest(world, { q: 0, r: 0 });
    rollChestRewardOffer(world, owner, chest);
    const first = [...(world.store(ChestOffer).get(chest)?.options ?? [])];
    rollChestRewardOffer(world, owner, chest);
    for (const o of first) expect(world.isAlive(o)).toBe(false);
    expect(world.store(ChestOffer).get(chest)?.options ?? []).toHaveLength(CHEST_OFFER_SIZE);
  });
});

describe('takeChestReward', () => {
  it('taking a CARD option moves it to the discard, destroys the rest, and marks the chest opened', () => {
    const world = createWorld(11);
    const owner = makeOwner(world);
    const chest = spawnChest(world, { q: 0, r: 0 });
    rollChestRewardOffer(world, owner, chest);
    const options = [...(world.store(ChestOffer).get(chest)?.options ?? [])];
    const chosen = options.find((o) => world.store(Card).get(o) !== undefined) as EntityId;
    takeChestReward(world, owner, chest, chosen);
    const deck = world.store(DeckState).get(owner) as DeckStateData;
    expect(deck.discardPile).toEqual([chosen]);
    expect(world.isAlive(chosen)).toBe(true);
    for (const o of options) if (o !== chosen) expect(world.isAlive(o)).toBe(false);
    expect(world.store(Chest).get(chest)?.opened).toBe(true);
    expect(world.store(ChestOffer).get(chest)).toBeUndefined();
  });

  it('taking an ITEM option equips it, destroys the rest, and marks the chest opened', () => {
    const world = createWorld(12);
    const owner = makeOwner(world);
    const chest = spawnChest(world, { q: 0, r: 0 });
    rollChestRewardOffer(world, owner, chest);
    const options = [...(world.store(ChestOffer).get(chest)?.options ?? [])];
    const chosen = options.find((o) => world.store(OfferedItem).get(o) !== undefined) as EntityId;
    const defId = world.store(OfferedItem).get(chosen)?.defId as string;
    const kind = itemDef(defId)?.kind;
    takeChestReward(world, owner, chest, chosen);
    expect(kind).toBeDefined();
    expect(world.store(Equipment).get(owner)?.slots[kind!]?.defId).toBe(defId);
    for (const o of options) expect(world.isAlive(o)).toBe(false); // chosen OfferedItem consumed + others destroyed
    expect(world.store(Chest).get(chest)?.opened).toBe(true);
    expect(world.store(ChestOffer).get(chest)).toBeUndefined();
  });

  it('taking a chosen id not in the offer is a no-op (chest stays closed, offer intact)', () => {
    const world = createWorld(13);
    const owner = makeOwner(world);
    const chest = spawnChest(world, { q: 0, r: 0 });
    rollChestRewardOffer(world, owner, chest);
    const stranger = world.createEntity();
    takeChestReward(world, owner, chest, stranger);
    expect(world.store(Chest).get(chest)?.opened).toBeFalsy();
    expect(world.store(ChestOffer).get(chest)?.options).toHaveLength(CHEST_OFFER_SIZE);
    expect((world.store(DeckState).get(owner) as DeckStateData).discardPile).toHaveLength(0);
  });
});

describe('chest + mimic queries', () => {
  it('chestAt / unopenedChestAt match by exact hex and skip opened chests', () => {
    const world = createWorld(6);
    const owner = makeOwner(world);
    const chest = spawnChest(world, { q: 0, r: 0 });
    expect(chestAt(world, { q: 0, r: 0 })).toBe(chest);
    expect(unopenedChestAt(world, { q: 0, r: 0 })).toBe(chest);
    expect(unopenedChestAt(world, { q: 1, r: 0 })).toBeUndefined();
    rollChestRewardOffer(world, owner, chest);
    const chosen = world.store(ChestOffer).get(chest)?.options[0] as EntityId;
    takeChestReward(world, owner, chest, chosen);
    expect(chestAt(world, { q: 0, r: 0 })).toBe(chest); // still on the map
    expect(unopenedChestAt(world, { q: 0, r: 0 })).toBeUndefined(); // opened: no longer a target
  });

});

describe('mimic helpers', () => {
  it('spawnMimic creates an Enemy + disguised Mimic at the hex; disguisedMimicAt finds it; revealMimic wakes it', () => {
    const world = createWorld(8);
    const mimic = spawnMimic(world, { q: 3, r: 1 });
    expect(world.store(Enemy).get(mimic)?.art).toBe(MIMIC_ART);
    expect(world.store(Mimic).get(mimic)?.revealed).toBeFalsy();
    expect(disguisedMimicAt(world, { q: 3, r: 1 })).toBe(mimic);
    revealMimic(world, mimic);
    expect(world.store(Mimic).get(mimic)?.revealed).toBe(true);
    expect(disguisedMimicAt(world, { q: 3, r: 1 })).toBeUndefined();
  });

  it('revealMimic wakes the disguised mimic into a full combat enemy — gains the archetype bundle and now blocks the player', () => {
    const world = createWorld(9);
    const player = world.createEntity();
    world.store(Player).add(player, { isPlayer: true });
    world.store(HexPosition).add(player, { hex: { q: 0, r: 0 } });
    world.store(Health).add(player, { hp: 30, maxHp: 30 });

    const mimicHex: Hex = { q: 3, r: 1 };
    const mimic = spawnMimic(world, mimicHex);
    // Disguised: a hollow Enemy with no Health, so it reads as the chest it imitates and never blocks the
    // player (the "can still be moved on top of" symptom before the fix).
    expect(world.store(Health).get(mimic)).toBeUndefined();
    expect(enemyOccupiedHexes(world).has(hexKey(mimicHex))).toBe(false);

    revealMimic(world, mimic);

    const def = ARCHETYPES.mimic!;
    expect(world.store(Health).get(mimic)).toEqual({ hp: def.maxHp, maxHp: def.maxHp });
    expect(world.store(Attack).get(mimic)?.profiles).toEqual(def.attacks);
    expect(world.store(AttackCooldowns).get(mimic)?.remaining).toEqual(def.attacks.map(() => 0));
    expect(world.store(Archetype).get(mimic)?.defId).toBe('mimic');
    expect(world.store(CombatStats).get(mimic)?.armor).toBe(def.armor);
    expect(world.store(Shield).get(mimic)?.shield).toBe(0);
    // A living enemy now: its hex is a low obstacle the player must route around, and it is a combat target.
    expect(enemyOccupiedHexes(world).has(hexKey(mimicHex))).toBe(true);
  });

  it('revealMimic is idempotent — a second wake does not re-roll an already-woken mimic back to full HP', () => {
    const world = createWorld(9);
    const mimic = spawnMimic(world, { q: 3, r: 1 });
    revealMimic(world, mimic);
    world.store(Health).get(mimic)!.hp = 5; // it took damage after waking
    revealMimic(world, mimic); // waking again must NOT re-materialise it
    expect(world.store(Health).get(mimic)?.hp).toBe(5);
  });
});

const LAYOUT: HexLayout = { width: 32, height: 24, rowPitch: 18, originX: 24, originY: 28 };
const kinds = (evs: readonly GameEvent[]): string[] => evs.map((e) => e.kind);
const playerHex = (world: World, player: EntityId): Hex => (world.store(HexPosition).get(player) as { hex: Hex }).hex;

/** A world wired like WorldScene.installSystems (interact -> turn -> movement) with a player who has a deck + equipment. */
function setup(opts?: { budget?: number; seed?: number }): { world: World; grid: HexGrid; player: EntityId } {
  const grid = new HexGrid(12, 12);
  const world = createWorld(opts?.seed ?? 1);
  world.addSystem(makeInteractSystem(grid)); // FIRST: its RequestMove must reach the turn system the same step
  world.addSystem(makeTurnSystem(grid));
  world.addSystem(makeMovementSystem(grid, LAYOUT));
  const player = world.createEntity();
  world.store(Player).add(player, { isPlayer: true });
  world.store(HexPosition).add(player, { hex: offsetToAxial({ col: 5, row: 5 }) });
  world.store(FacingState).add(player, { facing: 'right' });
  world.store(TurnState).add(player, { phase: 'player', round: 1, activeActor: player });
  world.store(ResourcePool).add(player, { energy: 3, energyMax: 3, mana: 1, manaMax: 5, manaRegen: 1 });
  world.store(MovementBudget).add(player, { remaining: opts?.budget ?? 4, max: 4 });
  world.store(DeckState).add(player, { drawPile: [], hand: [], discardPile: [] } as DeckStateData);
  world.store(Equipment).add(player, { slots: {} });
  return { world, grid, player };
}

describe('interactStopHex', () => {
  const grid = new HexGrid(12, 12);
  const from = offsetToAxial({ col: 5, row: 5 });

  it('returns the hex before the target for a target 2+ away, and `from` when already adjacent', () => {
    const far = offsetToAxial({ col: 8, row: 5 });
    const path = findPath(grid, from, far);
    expect(path.length).toBeGreaterThan(2);
    expect(interactStopHex(grid, from, far)).toEqual(path[path.length - 2]);
    const adjacent = path[1] as Hex;
    expect(interactStopHex(grid, from, adjacent)).toEqual(from);
  });

  it('returns `from` for an unreachable target (caller must gate on reachability)', () => {
    expect(interactStopHex(grid, from, { q: 999, r: 999 })).toEqual(from);
  });

  it('routes the approach around a blocked hex on the direct line to the prop (low-obstacle enemy)', () => {
    const target = offsetToAxial({ col: 9, row: 5 });
    const wall = findPath(grid, from, target)[2] as Hex; // a hex partway along the unblocked approach
    const blocked = new Set([hexKey(wall)]);
    const stop = interactStopHex(grid, from, target, blocked);
    expect(hexDistance(stop, target)).toBe(1); // still stops on a tile adjacent to the prop (interact resolves)
    const route = findPath(grid, from, stop, blocked);
    expect(route.length).toBeGreaterThan(0); // reachable around the blocker
    expect(route.some((h) => hexKey(h) === hexKey(wall))).toBe(false); // the approach never crosses it
  });
});

describe('makeInteractSystem (chest)', () => {
  it('RequestInteract on a chest 2+ away moves to the stop hex and marks pending, not yet ready', () => {
    const { world, grid, player } = setup();
    const from = playerHex(world, player);
    const chestHex = offsetToAxial({ col: 8, row: 5 });
    const chest = spawnChest(world, chestHex);
    const stop = interactStopHex(grid, from, chestHex);
    const evs = advance(world, [{ kind: 'RequestInteract', entity: player, target: chest }]);
    expect(kinds(evs)).not.toContain('ChestInteractReady');
    expect(playerHex(world, player)).toEqual(stop);
    const pending = world.store(PendingInteraction).get(player);
    expect(pending?.target).toBe(chest);
    expect(pending?.stopHex).toEqual(stop);
  });

  it('on the next advance, arrival rolls the offer, emits ChestInteractReady once, and clears pending', () => {
    const { world, player } = setup();
    const chest = spawnChest(world, offsetToAxial({ col: 8, row: 5 }));
    advance(world, [{ kind: 'RequestInteract', entity: player, target: chest }]); // step 1: travel + pending
    const evs = advance(world); // step 2: arrival
    const ready = evs.filter((e) => e.kind === 'ChestInteractReady');
    expect(ready).toHaveLength(1);
    expect((ready[0] as { chest: EntityId }).chest).toBe(chest);
    expect(world.store(ChestOffer).get(chest)?.options).toHaveLength(CHEST_OFFER_SIZE); // offer rolled at open
    expect(world.store(PendingInteraction).get(player)).toBeUndefined();
    expect(kinds(advance(world))).not.toContain('ChestInteractReady'); // not re-emitted
  });

  it('RequestInteract on an adjacent chest is ready at once (offer rolled), with no move and no pending', () => {
    const { world, player } = setup();
    const from = playerHex(world, player);
    const adjacent = offsetToAxial({ col: 6, row: 5 });
    expect(hexDistance(from, adjacent)).toBe(1);
    const chest = spawnChest(world, adjacent);
    const evs = advance(world, [{ kind: 'RequestInteract', entity: player, target: chest }]);
    expect(kinds(evs)).toContain('ChestInteractReady');
    expect(kinds(evs)).not.toContain('EntityStepped');
    expect(playerHex(world, player)).toEqual(from);
    expect(world.store(ChestOffer).get(chest)?.options).toHaveLength(CHEST_OFFER_SIZE);
    expect(world.store(PendingInteraction).get(player)).toBeUndefined();
  });

  it('a pending interaction whose entity is NOT at the stop hex is cleared without resolving', () => {
    const { world, grid, player } = setup();
    const from = playerHex(world, player);
    const chestHex = offsetToAxial({ col: 8, row: 5 });
    const chest = spawnChest(world, chestHex);
    const stop = interactStopHex(grid, from, chestHex);
    world.store(PendingInteraction).add(player, { target: chest, stopHex: stop }); // but the player stays at `from`
    const evs = advance(world);
    expect(kinds(evs)).not.toContain('ChestInteractReady');
    expect(world.store(ChestOffer).get(chest)).toBeUndefined();
    expect(world.store(PendingInteraction).get(player)).toBeUndefined();
  });

  it('RequestInteract on an opened chest is rejected: no move, no pending, no ready', () => {
    const { world, player } = setup();
    const from = playerHex(world, player);
    const chest = spawnChest(world, offsetToAxial({ col: 8, row: 5 }));
    (world.store(Chest).get(chest) as { opened?: boolean }).opened = true;
    const evs = advance(world, [{ kind: 'RequestInteract', entity: player, target: chest }]);
    expect(kinds(evs)).not.toContain('ChestInteractReady');
    expect(playerHex(world, player)).toEqual(from);
    expect(world.store(PendingInteraction).get(player)).toBeUndefined();
  });

  it('TakeChestReward applies the pick and emits ChestOpened', () => {
    const { world, player } = setup();
    const chest = spawnChest(world, offsetToAxial({ col: 6, row: 5 }));
    advance(world, [{ kind: 'RequestInteract', entity: player, target: chest }]); // adjacent -> ready, offer rolled
    const options = [...(world.store(ChestOffer).get(chest)?.options ?? [])];
    const chosen = options.find((o) => world.store(Card).get(o) !== undefined) as EntityId;
    const evs = advance(world, [{ kind: 'TakeChestReward', entity: player, chest, chosen }]);
    expect(kinds(evs)).toContain('ChestOpened');
    expect((world.store(DeckState).get(player) as DeckStateData).discardPile).toEqual([chosen]);
    expect(world.store(Chest).get(chest)?.opened).toBe(true);
  });

  it('re-opening an un-taken chest reuses the SAME persisted offer (no re-roll)', () => {
    const { world, player } = setup();
    const chest = spawnChest(world, offsetToAxial({ col: 6, row: 5 })); // adjacent -> opens at once
    advance(world, [{ kind: 'RequestInteract', entity: player, target: chest }]); // first open: rolls the offer
    const first = [...(world.store(ChestOffer).get(chest)?.options ?? [])];
    expect(first).toHaveLength(CHEST_OFFER_SIZE);
    // The player dismissed the picker (no command); re-approaching the still-unopened chest re-opens it.
    const evs = advance(world, [{ kind: 'RequestInteract', entity: player, target: chest }]);
    expect(kinds(evs)).toContain('ChestInteractReady');
    const second = [...(world.store(ChestOffer).get(chest)?.options ?? [])];
    expect(second).toEqual(first); // identical option entities — not re-rolled
  });
});

describe('makeInteractSystem (mimic)', () => {
  it('reveals a disguised mimic on arrival and emits MimicRevealed (not ChestInteractReady)', () => {
    const { world, player } = setup();
    const mimic = spawnMimic(world, offsetToAxial({ col: 8, row: 5 }));
    advance(world, [{ kind: 'RequestInteract', entity: player, target: mimic }]); // travel + pending
    const evs = advance(world); // arrival
    expect(kinds(evs)).toContain('MimicRevealed');
    expect(kinds(evs)).not.toContain('ChestInteractReady');
    expect(world.store(Mimic).get(mimic)?.revealed).toBe(true);
  });

  it('an adjacent disguised mimic reveals at once with no move', () => {
    const { world, player } = setup();
    const from = playerHex(world, player);
    const mimic = spawnMimic(world, offsetToAxial({ col: 6, row: 5 }));
    const evs = advance(world, [{ kind: 'RequestInteract', entity: player, target: mimic }]);
    expect(kinds(evs)).toContain('MimicRevealed');
    expect(playerHex(world, player)).toEqual(from);
    expect(world.store(Mimic).get(mimic)?.revealed).toBe(true);
  });
});

describe('forest reward-prop generation', () => {
  it('generateForestChests places a seed-deterministic count within [MIN, MAX]', () => {
    for (const seed of [1, 2, 3, 42, 777]) {
      const obstacles = generateForestObstacles(seed);
      const a = generateForestChests(seed, obstacles);
      const b = generateForestChests(seed, obstacles);
      expect(a.map((c) => c.hex)).toEqual(b.map((c) => c.hex)); // deterministic
      expect(a.length).toBeGreaterThanOrEqual(FOREST_CHEST_MIN);
      expect(a.length).toBeLessThanOrEqual(FOREST_CHEST_MAX);
    }
  });

  it('forestMimicIndex is deterministic, null-or-in-range, and yields both outcomes across seeds', () => {
    let sawNull = false;
    let sawIndex = false;
    for (let seed = 0; seed < 60; seed += 1) {
      const idx = forestMimicIndex(seed, 5);
      expect(idx).toBe(forestMimicIndex(seed, 5)); // deterministic
      if (idx === null) sawNull = true;
      else {
        sawIndex = true;
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(5);
      }
    }
    expect(sawNull).toBe(true);
    expect(sawIndex).toBe(true);
    expect(forestMimicIndex(7, 0)).toBeNull(); // no positions -> no mimic
  });

  it('forestPropFacing is deterministic and yields both left and right across hexes', () => {
    const seed = 99;
    const facings = new Set<string>();
    for (let col = 0; col < 20; col += 1) {
      const hex = offsetToAxial({ col, row: 3 });
      const f = forestPropFacing(hex, seed);
      expect(f).toBe(forestPropFacing(hex, seed)); // deterministic
      expect(f === 'left' || f === 'right').toBe(true);
      facings.add(f);
    }
    expect(facings.has('left')).toBe(true);
    expect(facings.has('right')).toBe(true);
  });
});

describe('persistence', () => {
  it('Chest{opened}, Mimic{revealed} and the mimic Enemy round-trip through serialize / restore', () => {
    const world = createWorld(5);
    const owner = makeOwner(world);
    const chest = spawnChest(world, { q: 2, r: 3 });
    rollChestRewardOffer(world, owner, chest);
    const chosen = world.store(ChestOffer).get(chest)?.options[0] as EntityId;
    takeChestReward(world, owner, chest, chosen); // opened chest
    const mimic = spawnMimic(world, { q: 4, r: 1 });
    revealMimic(world, mimic);

    const restored = restoreWorld(serializeWorld(world));
    const rChest = chestAt(restored, { q: 2, r: 3 }) as EntityId;
    expect(restored.store(Chest).get(rChest)?.opened).toBe(true);
    const rMimic = restored.entitiesWith(Mimic)[0] as EntityId;
    expect(restored.store(Mimic).get(rMimic)?.revealed).toBe(true);
    expect(restored.store(Enemy).get(rMimic)?.art).toBe(MIMIC_ART);
    // The combat bundle a woken mimic gained (SAVE_VERSION 19) must round-trip too, so a resumed run's mimic
    // is still a real enemy rather than reverting to a hollow disguise.
    expect(restored.store(Health).get(rMimic)).toEqual({
      hp: ARCHETYPES.mimic!.maxHp,
      maxHp: ARCHETYPES.mimic!.maxHp,
    });
    expect(restored.store(Archetype).get(rMimic)?.defId).toBe('mimic');
  });

  it('an un-taken offer (ChestOffer + OfferedItem options + card instances) persists; PendingInteraction stays transient', () => {
    const world = createWorld(5);
    const owner = makeOwner(world);
    const chest = spawnChest(world, { q: 2, r: 3 });
    rollChestRewardOffer(world, owner, chest); // a ChestOffer of Card + OfferedItem option entities
    const before = offerSignature(world, chest);
    const options = [...(world.store(ChestOffer).get(chest)?.options ?? [])];
    world.store(PendingInteraction).add(owner, { target: chest, stopHex: { q: 0, r: 0 } });

    const restored = restoreWorld(serializeWorld(world));
    const rChest = chestAt(restored, { q: 2, r: 3 }) as EntityId;
    // The offer round-trips: same option entity ids, each still a live Card or OfferedItem, same defs.
    expect(restored.store(ChestOffer).get(rChest)?.options).toEqual(options);
    expect(offerSignature(restored, rChest)).toEqual(before);
    for (const o of options) {
      const live = restored.store(Card).get(o) !== undefined || restored.store(OfferedItem).get(o) !== undefined;
      expect(live).toBe(true);
    }
    // PendingInteraction is still transient — never serialized.
    expect(restored.entitiesWith(PendingInteraction)).toHaveLength(0);
  });
});
