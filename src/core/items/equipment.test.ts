import { describe, it, expect } from 'vitest';
import {
  createWorld,
  serializeWorld,
  restoreWorld,
  DeckState,
  Card,
  Equipment,
  equipItem,
  unequipItem,
  equipStartingItems,
  itemDef,
  ITEM_DEFS,
  EQUIP_KINDS,
  cardDef,
  resolveKey,
  CombatStats,
  type World,
  type EntityId,
  type DeckStateData,
} from '@core/index';

/** A player entity with an empty deck + empty equipment — the minimum equip/unequip need. */
function makePlayer(world: World): EntityId {
  const player = world.createEntity();
  const deck: DeckStateData = { drawPile: [], hand: [], discardPile: [] };
  world.store(DeckState).add(player, deck);
  world.store(Equipment).add(player, { slots: {} });
  return player;
}

const deckOf = (world: World, player: EntityId): DeckStateData =>
  world.store(DeckState).get(player) as DeckStateData;
const defIds = (world: World, ids: readonly EntityId[]): string[] =>
  ids.map((id) => world.store(Card).get(id)?.defId ?? '');

describe('item content registry', () => {
  it('has an example item for every EquipKind, and every granted card id is a real card def', () => {
    for (const kind of EQUIP_KINDS) {
      expect(ITEM_DEFS.some((i) => i.kind === kind)).toBe(true);
    }
    for (const item of ITEM_DEFS) {
      for (const id of item.grantsCards) expect(cardDef(id)).toBeDefined();
    }
  });

  it('every item declares equipment art that resolves to a registered asset key', () => {
    for (const item of ITEM_DEFS) {
      expect(item.art, `${item.id} has art`).toBeTruthy();
      expect(resolveKey(item.art), `${item.id} art "${item.art}" resolves in the manifest`).toBeDefined();
    }
  });

  it('itemDef resolves known ids and returns undefined for unknown ones', () => {
    expect(itemDef('iron_sword')?.kind).toBe('weapon_melee');
    expect(itemDef('leather_boots')?.grantsCards).toEqual(['jump', 'jump']);
    expect(itemDef('nope')).toBeUndefined();
  });
});

describe('equipItem / unequipItem', () => {
  it('equipping an empty slot instantiates the granted cards into the draw pile and records them on the slot', () => {
    const world = createWorld(1);
    const player = makePlayer(world);
    equipItem(world, player, 'iron_sword'); // weapon_melee -> ['melee','melee']
    const deck = deckOf(world, player);
    expect(deck.drawPile).toHaveLength(2);
    expect(defIds(world, deck.drawPile)).toEqual(['melee', 'melee']);
    const slot = world.store(Equipment).get(player)?.slots['weapon_melee'];
    expect(slot?.defId).toBe('iron_sword');
    expect(slot?.grantedCards).toEqual(deck.drawPile);
  });

  it('replacing a same-kind item destroys the old grants (from EVERY pile + the entities) and adds the new ones', () => {
    const world = createWorld(2);
    const player = makePlayer(world);
    equipItem(world, player, 'iron_sword');
    const deck = deckOf(world, player);
    const old = [...deck.drawPile];
    // Move one granted card to the hand and one to the discard to prove the search covers all piles.
    deck.hand.push(deck.drawPile.pop() as EntityId);
    deck.discardPile.push(deck.drawPile.pop() as EntityId);
    equipItem(world, player, 'iron_sword'); // same kind -> replace (unequip the old grants first)
    for (const inst of old) expect(world.isAlive(inst)).toBe(false); // old instances destroyed
    expect(deck.hand).toHaveLength(0);
    expect(deck.discardPile).toHaveLength(0);
    expect(deck.drawPile).toHaveLength(2); // two FRESH instances
    expect(defIds(world, deck.drawPile)).toEqual(['melee', 'melee']);
  });

  it('unequip removes the slot grants from whichever pile holds them and clears the slot', () => {
    const world = createWorld(3);
    const player = makePlayer(world);
    equipItem(world, player, 'short_bow'); // weapon_ranged -> 2 rangedshot
    const deck = deckOf(world, player);
    deck.discardPile.push(deck.drawPile.pop() as EntityId); // one in discard, one in draw
    const granted = [...(world.store(Equipment).get(player)?.slots['weapon_ranged']?.grantedCards ?? [])];
    expect(granted).toHaveLength(2);
    unequipItem(world, player, 'weapon_ranged');
    for (const inst of granted) expect(world.isAlive(inst)).toBe(false);
    expect(deck.drawPile).toHaveLength(0);
    expect(deck.discardPile).toHaveLength(0);
    expect(world.store(Equipment).get(player)?.slots['weapon_ranged']).toBeUndefined();
  });
});

describe('equipStartingItems (derived starting deck)', () => {
  it('yields exactly the four basics grants (8 cards) and nothing else', () => {
    const world = createWorld(4);
    const player = makePlayer(world);
    equipStartingItems(world, player);
    const deck = deckOf(world, player);
    expect(deck.drawPile).toHaveLength(8);
    expect(deck.hand).toHaveLength(0);
    expect(deck.discardPile).toHaveLength(0);
    expect(defIds(world, deck.drawPile).sort()).toEqual([
      'defend',
      'defend',
      'jump',
      'jump',
      'melee',
      'melee',
      'rangedshot',
      'rangedshot',
    ]);
  });

  it('the deck piles stay a clean partition after equips (no instance duplicated or dropped)', () => {
    const world = createWorld(5);
    const player = makePlayer(world);
    equipStartingItems(world, player);
    const deck = deckOf(world, player);
    const all = [...deck.drawPile, ...deck.hand, ...deck.discardPile];
    expect(new Set(all).size).toBe(all.length); // no duplicates
    for (const inst of all) expect(world.store(Card).get(inst)).toBeDefined(); // every id is a live card instance
  });
});

describe('item armor (Defense & Shielding)', () => {
  /** A player that is also a combatant (has CombatStats), so armour bonuses are observable. */
  function combatPlayer(world: World, baseArmor = 0): EntityId {
    const player = makePlayer(world);
    world.store(CombatStats).add(player, { armor: baseArmor, baseArmor });
    return player;
  }

  it('equipping an item with armour raises CombatStats.armor; unequip takes the bonus back', () => {
    const world = createWorld(1);
    const player = combatPlayer(world, 0);
    equipItem(world, player, 'wooden_shield'); // armour 2
    expect(world.store(CombatStats).get(player)?.armor).toBe(2);
    unequipItem(world, player, 'shield');
    expect(world.store(CombatStats).get(player)?.armor).toBe(0);
  });

  it('adds onto a non-zero base and stacks across several equipped items', () => {
    const world = createWorld(2);
    const player = combatPlayer(world, 1);
    equipItem(world, player, 'wooden_shield'); // +2 -> 3
    equipItem(world, player, 'leather_cap'); // +1 -> 4
    expect(world.store(CombatStats).get(player)?.armor).toBe(4);
  });

  it('equipStartingItems sums the starters armour (Wooden Shield 2 + Leather Boots 1) onto the base', () => {
    const world = createWorld(3);
    const player = combatPlayer(world, 0);
    equipStartingItems(world, player);
    expect(world.store(CombatStats).get(player)?.armor).toBe(3); // sword + bow add 0
  });

  it('recomputes from the full loadout — re-equipping the same kind never double-counts (no drift)', () => {
    const world = createWorld(6);
    const player = combatPlayer(world, 1);
    equipItem(world, player, 'wooden_shield'); // base 1 + 2 = 3
    expect(world.store(CombatStats).get(player)?.armor).toBe(3);
    equipItem(world, player, 'wooden_shield'); // same kind -> replace, recompute -> still 3 (not 5)
    equipItem(world, player, 'wooden_shield');
    expect(world.store(CombatStats).get(player)?.armor).toBe(3); // idempotent regardless of repeats
  });

  it('a weapon with no armour leaves CombatStats.armor unchanged', () => {
    const world = createWorld(4);
    const player = combatPlayer(world, 2);
    equipItem(world, player, 'iron_sword');
    expect(world.store(CombatStats).get(player)?.armor).toBe(2);
  });

  it('is a safe no-op when the equipping entity has no CombatStats', () => {
    const world = createWorld(5);
    const player = makePlayer(world); // no CombatStats
    expect(() => equipItem(world, player, 'wooden_shield')).not.toThrow();
    expect(world.store(CombatStats).get(player)).toBeUndefined();
  });
});

describe('persistence (round-trip)', () => {
  it('Equipment slots + granted instances round-trip through serialize / restore', () => {
    const world = createWorld(6);
    const player = makePlayer(world);
    equipStartingItems(world, player);
    const before = deckOf(world, player).drawPile.length;

    const restored = restoreWorld(serializeWorld(world));
    const eq = restored.store(Equipment).get(player);
    expect(Object.keys(eq?.slots ?? {}).sort()).toEqual(['boots', 'shield', 'weapon_melee', 'weapon_ranged']);
    expect((restored.store(DeckState).get(player) as DeckStateData).drawPile).toHaveLength(before);
    const granted = eq?.slots['weapon_melee']?.grantedCards[0] as EntityId;
    expect(restored.store(Card).get(granted)?.defId).toBe('melee');
  });
});
