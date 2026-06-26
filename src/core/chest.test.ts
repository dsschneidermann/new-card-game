import { describe, it, expect } from 'vitest';
import {
  createWorld,
  serializeWorld,
  restoreWorld,
  makeRng,
  DeckState,
  Card,
  Chest,
  CHEST_CARD_POOL,
  rollChestOffer,
  spawnChest,
  chestAt,
  takeChestCard,
  cardDef,
  type World,
  type EntityId,
  type Hex,
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

  it('takeChestCard moves the chosen card to the discard pile and destroys the chest + unchosen cards', () => {
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
    expect(world.isAlive(chest)).toBe(false);
    for (const inst of offered) if (inst !== chosen) expect(world.isAlive(inst)).toBe(false);
  });

  it('takeChestCard with a card NOT among the offered set is a no-op (chest intact, nothing taken)', () => {
    const world = createWorld(4);
    const owner = makeOwner(world);
    const chest = spawnChest(world, { q: 0, r: 0 });
    const stranger = world.createEntity();
    takeChestCard(world, owner, chest, stranger);
    expect(world.isAlive(chest)).toBe(true);
    expect((world.store(DeckState).get(owner) as DeckStateData).discardPile).toHaveLength(0);
    expect(world.store(Chest).get(chest)?.offered).toHaveLength(3);
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
