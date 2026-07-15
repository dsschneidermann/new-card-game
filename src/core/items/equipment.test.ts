import { describe, it, expect } from 'vitest';
import {
  createWorld,
  serializeWorld,
  restoreWorld,
  DeckState,
  Card,
  Equipment,
  KnownSpells,
  equipItem,
  unequipItem,
  equipStartingItems,
  itemDef,
  ITEM_DEFS,
  EQUIP_KINDS,
  CHEST_ITEM_POOL,
  cardDef,
  resolveKey,
  CombatStats,
  ResourcePool,
  MovementBudget,
  PLAYER_BASE_ENERGY_MAX,
  PLAYER_BASE_MANA_MAX,
  PLAYER_BASE_MANA_REGEN,
  PLAYER_BASE_MOVEMENT,
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

  it('the four card-granting basics are obtainable from chests (in CHEST_ITEM_POOL)', () => {
    expect(CHEST_ITEM_POOL).toEqual(
      expect.arrayContaining(['iron_sword', 'wooden_shield', 'short_bow', 'leather_boots']),
    );
  });

  it('every defensive wearable gives exactly +1 armour; weapons/spellbook/amulets give none', () => {
    for (const id of ['wooden_shield', 'leather_cap', 'leather_tunic', 'travelers_cape', 'leather_boots']) {
      expect(itemDef(id)?.armor, `${id} armour`).toBe(1);
    }
    for (const id of ['iron_sword', 'short_bow', 'rusty_dagger', 'apprentice_spellbook', 'mana_amulet']) {
      expect(itemDef(id)?.armor ?? 0, `${id} armour`).toBe(0);
    }
  });
});

describe('equipItem / unequipItem', () => {
  it('equipping an empty slot instantiates the granted cards into the DISCARD pile and records them on the slot', () => {
    const world = createWorld(1);
    const player = makePlayer(world);
    equipItem(world, player, 'iron_sword'); // weapon_melee -> ['melee','melee']
    const deck = deckOf(world, player);
    expect(deck.discardPile).toHaveLength(2); // granted cards land in the discard pile, cycling in on the next reshuffle
    expect(deck.drawPile).toHaveLength(0);
    expect(defIds(world, deck.discardPile)).toEqual(['melee', 'melee']);
    const slot = world.store(Equipment).get(player)?.slots['weapon_melee'];
    expect(slot?.defId).toBe('iron_sword');
    expect(slot?.grantedCards).toEqual(deck.discardPile);
  });

  it('replacing a same-kind item destroys the old grants (from EVERY pile + the entities) and adds the new ones', () => {
    const world = createWorld(2);
    const player = makePlayer(world);
    equipItem(world, player, 'iron_sword');
    const deck = deckOf(world, player);
    const old = [...deck.discardPile]; // both granted cards start in the discard pile
    // Spread the two granted cards across the hand and the draw pile, to prove the destroy search covers every pile.
    deck.hand.push(deck.discardPile.pop() as EntityId);
    deck.drawPile.push(deck.discardPile.pop() as EntityId);
    equipItem(world, player, 'iron_sword'); // same kind -> replace (unequip the old grants first)
    for (const inst of old) expect(world.isAlive(inst)).toBe(false); // old instances destroyed
    expect(deck.hand).toHaveLength(0);
    expect(deck.drawPile).toHaveLength(0);
    expect(deck.discardPile).toHaveLength(2); // two FRESH instances land in the discard pile
    expect(defIds(world, deck.discardPile)).toEqual(['melee', 'melee']);
  });

  it('unequip removes the slot grants from whichever pile holds them and clears the slot', () => {
    const world = createWorld(3);
    const player = makePlayer(world);
    equipItem(world, player, 'short_bow'); // weapon_ranged -> 2 rangedshot (into the discard pile)
    const deck = deckOf(world, player);
    deck.drawPile.push(deck.discardPile.pop() as EntityId); // one in draw, one stays in discard
    const granted = [...(world.store(Equipment).get(player)?.slots['weapon_ranged']?.grantedCards ?? [])];
    expect(granted).toHaveLength(2);
    unequipItem(world, player, 'weapon_ranged');
    for (const inst of granted) expect(world.isAlive(inst)).toBe(false);
    expect(deck.drawPile).toHaveLength(0);
    expect(deck.discardPile).toHaveLength(0);
    expect(world.store(Equipment).get(player)?.slots['weapon_ranged']).toBeUndefined();
  });
});

describe('equipStartingItems (basic four-item kit utility)', () => {
  it('yields exactly the four basics grants (8 cards, into the discard pile) and nothing else', () => {
    const world = createWorld(4);
    const player = makePlayer(world);
    equipStartingItems(world, player);
    const deck = deckOf(world, player);
    expect(deck.discardPile).toHaveLength(8); // every equip's granted cards land in the discard pile
    expect(deck.hand).toHaveLength(0);
    expect(deck.drawPile).toHaveLength(0);
    expect(defIds(world, deck.discardPile).sort()).toEqual([
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
    equipItem(world, player, 'wooden_shield'); // armour 1
    expect(world.store(CombatStats).get(player)?.armor).toBe(1);
    unequipItem(world, player, 'shield');
    expect(world.store(CombatStats).get(player)?.armor).toBe(0);
  });

  it('adds onto a non-zero base and stacks across several equipped items', () => {
    const world = createWorld(2);
    const player = combatPlayer(world, 1);
    equipItem(world, player, 'wooden_shield'); // +1 -> 2
    equipItem(world, player, 'leather_cap'); // +1 -> 3
    expect(world.store(CombatStats).get(player)?.armor).toBe(3);
  });

  it('equipStartingItems sums the starters armour (Wooden Shield 1 + Leather Boots 1) onto the base', () => {
    const world = createWorld(3);
    const player = combatPlayer(world, 0);
    equipStartingItems(world, player);
    expect(world.store(CombatStats).get(player)?.armor).toBe(2); // sword + bow add 0; shield 1 + boots 1
  });

  it('recomputes from the full loadout — re-equipping the same kind never double-counts (no drift)', () => {
    const world = createWorld(6);
    const player = combatPlayer(world, 1);
    equipItem(world, player, 'wooden_shield'); // base 1 + 1 = 2
    expect(world.store(CombatStats).get(player)?.armor).toBe(2);
    equipItem(world, player, 'wooden_shield'); // same kind -> replace, recompute -> still 2 (not 3)
    equipItem(world, player, 'wooden_shield');
    expect(world.store(CombatStats).get(player)?.armor).toBe(2); // idempotent regardless of repeats
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

describe('KnownSpells (spellbook-granted spells, derived from the loadout)', () => {
  const known = (world: World, player: EntityId): string[] =>
    world.store(KnownSpells).get(player)?.spellIds ?? [];

  it('the starter equipment grants no spells (no spellbook -> empty)', () => {
    const world = createWorld(1);
    const player = makePlayer(world);
    equipStartingItems(world, player);
    expect(known(world, player)).toEqual([]);
  });

  it('equipping the apprentice spellbook makes its grantsSpells available', () => {
    const world = createWorld(2);
    const player = makePlayer(world);
    equipItem(world, player, 'apprentice_spellbook');
    expect(known(world, player).sort()).toEqual(itemDef('apprentice_spellbook')!.grantsSpells!.slice().sort());
  });

  it('unequipping the spellbook clears the granted spells (derived from the live loadout)', () => {
    const world = createWorld(3);
    const player = makePlayer(world);
    equipItem(world, player, 'apprentice_spellbook');
    expect(known(world, player).length).toBeGreaterThan(0);
    unequipItem(world, player, 'spellbook');
    expect(known(world, player)).toEqual([]);
  });

  it('round-trips through serialize / restore', () => {
    const world = createWorld(4);
    const player = makePlayer(world);
    equipItem(world, player, 'apprentice_spellbook');
    const restored = restoreWorld(serializeWorld(world));
    expect(restored.store(KnownSpells).get(player)?.spellIds.slice().sort()).toEqual(known(world, player).slice().sort());
  });
});

describe('item resource bonuses & consumables (Amulet & Potion Items)', () => {
  /** A player carrying the resource pools, so amulet/potion effects on the maxima are observable. */
  function resourcePlayer(world: World): EntityId {
    const player = makePlayer(world);
    world.store(ResourcePool).add(player, {
      energy: PLAYER_BASE_ENERGY_MAX,
      energyMax: PLAYER_BASE_ENERGY_MAX,
      mana: 0,
      manaMax: PLAYER_BASE_MANA_MAX,
      manaRegen: PLAYER_BASE_MANA_REGEN,
    });
    world.store(MovementBudget).add(player, { remaining: PLAYER_BASE_MOVEMENT, max: PLAYER_BASE_MOVEMENT });
    return player;
  }
  const pool = (world: World, p: EntityId) => world.store(ResourcePool).get(p)!;
  const move = (world: World, p: EntityId) => world.store(MovementBudget).get(p)!;

  it('the base constants match the player spawn defaults (energy 2 / mana 3 / regen 1 / movement 2)', () => {
    expect([
      PLAYER_BASE_ENERGY_MAX,
      PLAYER_BASE_MANA_MAX,
      PLAYER_BASE_MANA_REGEN,
      PLAYER_BASE_MOVEMENT,
    ]).toEqual([2, 3, 1, 2]);
  });

  it('the four new items resolve with the expected kind + effect fields, and are all in the chest pool', () => {
    expect(itemDef('mana_amulet')).toMatchObject({ kind: 'amulet', manaBonus: 3 });
    expect(itemDef('movement_amulet')).toMatchObject({ kind: 'amulet', movementBonus: 2 });
    expect(itemDef('energy_amulet')).toMatchObject({ kind: 'amulet', energyBonus: 1 });
    expect(itemDef('energy_potion')).toMatchObject({ kind: 'weapon_backup', energyBonus: 1 });
    expect(CHEST_ITEM_POOL).toEqual(
      expect.arrayContaining(['mana_amulet', 'movement_amulet', 'energy_amulet', 'energy_potion']),
    );
  });

  it('each amulet raises ONLY its own max (base + bonus); the others stay at base', () => {
    const world = createWorld(1);
    const player = resourcePlayer(world);
    equipItem(world, player, 'mana_amulet');
    expect(pool(world, player).manaMax).toBe(PLAYER_BASE_MANA_MAX + 3);
    expect(pool(world, player).energyMax).toBe(PLAYER_BASE_ENERGY_MAX); // untouched
    expect(move(world, player).max).toBe(PLAYER_BASE_MOVEMENT); // untouched

    const w2 = createWorld(2);
    const p2 = resourcePlayer(w2);
    equipItem(w2, p2, 'energy_amulet');
    expect(pool(w2, p2).energyMax).toBe(PLAYER_BASE_ENERGY_MAX + 1);

    const w3 = createWorld(3);
    const p3 = resourcePlayer(w3);
    equipItem(w3, p3, 'movement_amulet');
    expect(move(w3, p3).max).toBe(PLAYER_BASE_MOVEMENT + 2);
  });

  it('unequip returns the max to base and re-equipping the same kind never drifts (idempotent)', () => {
    const world = createWorld(4);
    const player = resourcePlayer(world);
    equipItem(world, player, 'mana_amulet');
    equipItem(world, player, 'mana_amulet'); // same-kind replace -> still base + 3, not + 6
    expect(pool(world, player).manaMax).toBe(PLAYER_BASE_MANA_MAX + 3);
    unequipItem(world, player, 'amulet');
    expect(pool(world, player).manaMax).toBe(PLAYER_BASE_MANA_MAX);
  });

  it('the three amulets share ONE slot — equipping a second swaps the first, only the last applies', () => {
    const world = createWorld(5);
    const player = resourcePlayer(world);
    equipItem(world, player, 'mana_amulet'); // manaMax + 3
    equipItem(world, player, 'energy_amulet'); // replaces the amulet slot
    expect(pool(world, player).manaMax).toBe(PLAYER_BASE_MANA_MAX); // mana amulet gone
    expect(pool(world, player).energyMax).toBe(PLAYER_BASE_ENERGY_MAX + 1); // energy amulet on
  });

  it('the recompute is a safe no-op when the entity has no ResourcePool / MovementBudget', () => {
    const world = createWorld(6);
    const player = makePlayer(world); // no ResourcePool / MovementBudget
    expect(() => equipItem(world, player, 'mana_amulet')).not.toThrow();
    expect(world.store(ResourcePool).get(player)).toBeUndefined();
  });

  it('the energy potion is a permanent backup-slot item: +1 energy max, and it stacks with an energy amulet', () => {
    const world = createWorld(7);
    const player = resourcePlayer(world);
    equipItem(world, player, 'energy_potion'); // weapon_backup slot, +1 energyMax
    expect(pool(world, player).energyMax).toBe(PLAYER_BASE_ENERGY_MAX + 1);
    expect(world.store(Equipment).get(player)?.slots['weapon_backup']?.defId).toBe('energy_potion');
    equipItem(world, player, 'energy_amulet'); // different slot -> both bonuses apply
    expect(pool(world, player).energyMax).toBe(PLAYER_BASE_ENERGY_MAX + 2);
    unequipItem(world, player, 'weapon_backup'); // remove the potion -> back to just the amulet's +1
    expect(pool(world, player).energyMax).toBe(PLAYER_BASE_ENERGY_MAX + 1);
  });

  it('the starter loadout leaves every resource max at base (no starter grants a resource bonus)', () => {
    const world = createWorld(8);
    const player = resourcePlayer(world);
    equipStartingItems(world, player);
    expect(pool(world, player).energyMax).toBe(PLAYER_BASE_ENERGY_MAX);
    expect(pool(world, player).manaMax).toBe(PLAYER_BASE_MANA_MAX);
    expect(move(world, player).max).toBe(PLAYER_BASE_MOVEMENT);
  });
});

describe('persistence (round-trip)', () => {
  it('Equipment slots + granted instances round-trip through serialize / restore', () => {
    const world = createWorld(6);
    const player = makePlayer(world);
    equipStartingItems(world, player);
    const before = deckOf(world, player).discardPile.length; // equip-granted cards live in the discard pile

    const restored = restoreWorld(serializeWorld(world));
    const eq = restored.store(Equipment).get(player);
    expect(Object.keys(eq?.slots ?? {}).sort()).toEqual(['boots', 'shield', 'weapon_melee', 'weapon_ranged']);
    expect((restored.store(DeckState).get(player) as DeckStateData).discardPile).toHaveLength(before);
    const granted = eq?.slots['weapon_melee']?.grantedCards[0] as EntityId;
    expect(restored.store(Card).get(granted)?.defId).toBe('melee');
  });
});
