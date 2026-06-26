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
  makeChestSystem,
  DeckState,
  Card,
  Chest,
  CHEST_CARD_POOL,
  rollChestOffer,
  spawnChest,
  chestAt,
  unopenedChestAt,
  takeChestCard,
  chestStopHex,
  PendingChestInteraction,
  cardDef,
  offsetToAxial,
  hexDistance,
  findPath,
  type World,
  type EntityId,
  type Hex,
  type HexLayout,
  type GameEvent,
  type DeckStateData,
} from '@core/index';

/** An owner entity with an empty deck (the chest reward lands in its discard pile). */
function makeOwner(world: World): EntityId {
  const owner = world.createEntity();
  const deck: DeckStateData = { drawPile: [], hand: [], discardPile: [] };
  world.store(DeckState).add(owner, deck);
  return owner;
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

describe('chest entities', () => {
  it('spawnChest creates a chest holding 3 offered card instances at the hex', () => {
    const world = createWorld(2);
    const hex: Hex = { q: 1, r: 1 };
    const chest = spawnChest(world, hex);
    const data = world.store(Chest).get(chest);
    expect(data?.offered).toHaveLength(3);
    for (const inst of data?.offered ?? []) expect(cardDef(world.store(Card).get(inst)?.defId ?? '')).toBeDefined();
    expect(chestAt(world, hex)).toBe(chest);
    expect(chestAt(world, { q: 9, r: 9 })).toBeUndefined();
  });

  it('takeChestCard moves the chosen card to the discard, destroys the unchosen, and marks the chest opened (kept)', () => {
    const world = createWorld(3);
    const owner = makeOwner(world);
    const chest = spawnChest(world, { q: 0, r: 0 });
    const offered = [...(world.store(Chest).get(chest)?.offered ?? [])];
    const chosen = offered[1] as EntityId;
    takeChestCard(world, owner, chest, chosen);
    const deck = world.store(DeckState).get(owner) as DeckStateData;
    expect(deck.discardPile).toEqual([chosen]);
    expect(deck.drawPile).toHaveLength(0);
    expect(world.isAlive(chosen)).toBe(true);
    // The chest entity stays alive as a purely-visual opened chest: marked opened, offered cleared.
    expect(world.isAlive(chest)).toBe(true);
    expect(world.store(Chest).get(chest)?.opened).toBe(true);
    expect(world.store(Chest).get(chest)?.offered).toHaveLength(0);
    for (const inst of offered) if (inst !== chosen) expect(world.isAlive(inst)).toBe(false);
  });

  it('takeChestCard with a card NOT among the offered set is a no-op (chest closed, nothing taken)', () => {
    const world = createWorld(4);
    const owner = makeOwner(world);
    const chest = spawnChest(world, { q: 0, r: 0 });
    const stranger = world.createEntity();
    takeChestCard(world, owner, chest, stranger);
    expect(world.isAlive(chest)).toBe(true);
    expect(world.store(Chest).get(chest)?.opened).toBeFalsy();
    expect((world.store(DeckState).get(owner) as DeckStateData).discardPile).toHaveLength(0);
    expect(world.store(Chest).get(chest)?.offered).toHaveLength(3);
  });

  it('unopenedChestAt matches an unopened chest EXACTLY on the hex, skips neighbours and opened chests', () => {
    const world = createWorld(6);
    const owner = makeOwner(world);
    const chest = spawnChest(world, { q: 0, r: 0 });
    expect(unopenedChestAt(world, { q: 0, r: 0 })).toBe(chest); // exactly on the chest's tile
    expect(unopenedChestAt(world, { q: 1, r: 0 })).toBeUndefined(); // a neighbour is NOT a match (exact hex only)
    // Once opened it is purely visual: no longer an interact target.
    const chosen = world.store(Chest).get(chest)?.offered[0] as EntityId;
    takeChestCard(world, owner, chest, chosen);
    expect(unopenedChestAt(world, { q: 0, r: 0 })).toBeUndefined();
  });

  it('Chest + offered instances round-trip through serialize / restore', () => {
    const world = createWorld(5);
    spawnChest(world, { q: 2, r: 3 });
    const restored = restoreWorld(serializeWorld(world));
    const chest = restored.entitiesWith(Chest)[0] as EntityId;
    const data = restored.store(Chest).get(chest);
    expect(data?.offered).toHaveLength(3);
    for (const inst of data?.offered ?? []) {
      expect(cardDef(restored.store(Card).get(inst)?.defId ?? '')).toBeDefined();
    }
    expect(chestAt(restored, { q: 2, r: 3 })).toBe(chest);
  });
});

const LAYOUT: HexLayout = { width: 32, height: 24, rowPitch: 18, originX: 24, originY: 28 };
const kinds = (evs: readonly GameEvent[]): string[] => evs.map((e) => e.kind);
const playerHex = (world: World, player: EntityId): Hex => (world.store(HexPosition).get(player) as { hex: Hex }).hex;

/** A world wired like WorldScene.installSystems (chest -> turn -> movement) with a player who has a deck. */
function setup(opts?: { budget?: number; seed?: number }): { world: World; grid: HexGrid; player: EntityId } {
  const grid = new HexGrid(12, 12);
  const world = createWorld(opts?.seed ?? 1);
  world.addSystem(makeChestSystem(grid)); // FIRST: its RequestMove must reach the turn system the same step
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
  return { world, grid, player };
}

describe('chestStopHex', () => {
  const grid = new HexGrid(12, 12);
  const from = offsetToAxial({ col: 5, row: 5 });

  it('returns the hex before the chest for a chest 2+ away, and `from` when already adjacent', () => {
    const far = offsetToAxial({ col: 8, row: 5 });
    const path = findPath(grid, from, far);
    expect(path.length).toBeGreaterThan(2);
    expect(chestStopHex(grid, from, far)).toEqual(path[path.length - 2]); // the chest's own last step is free
    const adjacent = path[1] as Hex; // a neighbour of `from`
    expect(chestStopHex(grid, from, adjacent)).toEqual(from); // already adjacent: no travel hex before it
  });

  it('returns `from` for an unreachable chest (caller must gate on reachability)', () => {
    expect(chestStopHex(grid, from, { q: 999, r: 999 })).toEqual(from);
  });
});

describe('makeChestSystem', () => {
  it('RequestChestInteract on a chest 2+ away moves to the stop hex and marks pending, not yet ready', () => {
    const { world, grid, player } = setup();
    const from = playerHex(world, player);
    const chestHex = offsetToAxial({ col: 8, row: 5 });
    const chest = spawnChest(world, chestHex);
    const stop = chestStopHex(grid, from, chestHex);
    const evs = advance(world, [{ kind: 'RequestChestInteract', entity: player, chest }]);
    expect(kinds(evs)).not.toContain('ChestInteractReady'); // ready only on arrival, next step
    expect(playerHex(world, player)).toEqual(stop); // the submitted RequestMove executed the same step
    const pending = world.store(PendingChestInteraction).get(player);
    expect(pending?.chest).toBe(chest);
    expect(pending?.stopHex).toEqual(stop);
  });

  it('on the next advance, arrival at the stop hex emits ChestInteractReady once and clears pending', () => {
    const { world, player } = setup();
    const chest = spawnChest(world, offsetToAxial({ col: 8, row: 5 }));
    advance(world, [{ kind: 'RequestChestInteract', entity: player, chest }]); // step 1: travel + pending
    const evs = advance(world); // step 2: arrival
    const ready = evs.filter((e) => e.kind === 'ChestInteractReady');
    expect(ready).toHaveLength(1);
    expect((ready[0] as { chest: EntityId }).chest).toBe(chest);
    expect(world.store(PendingChestInteraction).get(player)).toBeUndefined();
    expect(kinds(advance(world))).not.toContain('ChestInteractReady'); // not re-emitted
  });

  it('RequestChestInteract on an adjacent chest is ready at once, with no move and no pending', () => {
    const { world, player } = setup();
    const from = playerHex(world, player);
    const adjacent = offsetToAxial({ col: 6, row: 5 });
    expect(hexDistance(from, adjacent)).toBe(1);
    const chest = spawnChest(world, adjacent);
    const evs = advance(world, [{ kind: 'RequestChestInteract', entity: player, chest }]);
    expect(kinds(evs)).toContain('ChestInteractReady');
    expect(kinds(evs)).not.toContain('EntityStepped'); // no travel issued
    expect(playerHex(world, player)).toEqual(from); // didn't move onto the chest
    expect(world.store(PendingChestInteraction).get(player)).toBeUndefined();
  });

  it('a pending interaction whose entity is NOT at the stop hex is cleared without emitting (interrupt/reject)', () => {
    const { world, grid, player } = setup();
    const from = playerHex(world, player);
    const chestHex = offsetToAxial({ col: 8, row: 5 });
    const chest = spawnChest(world, chestHex);
    const stop = chestStopHex(grid, from, chestHex);
    world.store(PendingChestInteraction).add(player, { chest, stopHex: stop }); // but the player stays at `from`
    const evs = advance(world);
    expect(kinds(evs)).not.toContain('ChestInteractReady'); // never reached the stop hex -> no open
    expect(world.store(PendingChestInteraction).get(player)).toBeUndefined(); // marker still cleared
  });

  it('RequestChestInteract on an opened chest is rejected: no move, no pending, no ready', () => {
    const { world, player } = setup();
    const from = playerHex(world, player);
    const chest = spawnChest(world, offsetToAxial({ col: 8, row: 5 }));
    (world.store(Chest).get(chest) as { opened?: boolean }).opened = true;
    const evs = advance(world, [{ kind: 'RequestChestInteract', entity: player, chest }]);
    expect(kinds(evs)).not.toContain('ChestInteractReady');
    expect(playerHex(world, player)).toEqual(from);
    expect(world.store(PendingChestInteraction).get(player)).toBeUndefined();
  });

  it('TakeChestCard applies the pick (chosen->discard, unchosen destroyed, opened) and emits ChestOpened', () => {
    const { world, player } = setup();
    const chest = spawnChest(world, offsetToAxial({ col: 8, row: 5 }));
    const offered = [...(world.store(Chest).get(chest)?.offered ?? [])];
    const chosen = offered[1] as EntityId;
    const evs = advance(world, [{ kind: 'TakeChestCard', entity: player, chest, chosen }]);
    expect(kinds(evs)).toContain('ChestOpened');
    expect((world.store(DeckState).get(player) as DeckStateData).discardPile).toEqual([chosen]);
    expect(world.store(Chest).get(chest)?.opened).toBe(true);
    for (const inst of offered) if (inst !== chosen) expect(world.isAlive(inst)).toBe(false);
  });

  it('TakeChestCard with a stale chosen id is a no-op and emits no ChestOpened', () => {
    const { world, player } = setup();
    const chest = spawnChest(world, offsetToAxial({ col: 8, row: 5 }));
    const stranger = world.createEntity();
    const evs = advance(world, [{ kind: 'TakeChestCard', entity: player, chest, chosen: stranger }]);
    expect(kinds(evs)).not.toContain('ChestOpened');
    expect(world.store(Chest).get(chest)?.opened).toBeFalsy();
    expect((world.store(DeckState).get(player) as DeckStateData).discardPile).toHaveLength(0);
    expect(world.store(Chest).get(chest)?.offered).toHaveLength(3);
  });

  it('PendingChestInteraction is transient: it does not survive serialize / restore (SAVE_VERSION unchanged)', () => {
    const { world, player } = setup();
    const chest = spawnChest(world, offsetToAxial({ col: 8, row: 5 }));
    advance(world, [{ kind: 'RequestChestInteract', entity: player, chest }]);
    expect(world.store(PendingChestInteraction).get(player)).toBeDefined();
    const restored = restoreWorld(serializeWorld(world));
    expect(restored.store(PendingChestInteraction).get(player)).toBeUndefined();
  });
});
