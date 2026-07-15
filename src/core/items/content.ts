import type { ItemDef } from './types';
import { AssetKeys } from '../assets/keys';

/**
 * The static item content (Card, Item & Spell Pickups). The four BASIC items grant the cards that form the
 * player's starting deck (see STARTER_EQUIPMENT). Reward items add mechanical effects: defensive pieces grant
 * flat armour, the spellbook grants spells, and the amulets/potion grant resource bonuses (Amulet & Potion
 * Items) — a passive +max while an amulet is equipped, or a one-time energy burst when the potion is drunk.
 * Adding an item is data only (no code change).
 */
export const ITEM_DEFS: readonly ItemDef[] = [
  // The four basic starting items: each grants two basic cards. Their combined grants ARE the opening deck.
  // Defensive pieces add a little flat armour (Defense & Shielding); the two weapons grant none.
  { id: 'iron_sword', name: 'Iron Sword', kind: 'weapon_melee', grantsCards: ['melee', 'melee'], art: AssetKeys.itemArtIronSword },
  { id: 'wooden_shield', name: 'Wooden Shield', kind: 'shield', grantsCards: ['defend', 'defend'], armor: 2, art: AssetKeys.itemArtWoodenShield },
  { id: 'short_bow', name: 'Short Bow', kind: 'weapon_ranged', grantsCards: ['rangedshot', 'rangedshot'], art: AssetKeys.itemArtShortBow },
  { id: 'leather_boots', name: 'Leather Boots', kind: 'boots', grantsCards: ['jump', 'jump'], armor: 1, art: AssetKeys.itemArtLeatherBoots },

  // One placeholder example per remaining kind (no card grants yet). Armour pieces add a small flat bonus.
  { id: 'rusty_dagger', name: 'Rusty Dagger', kind: 'weapon_backup', grantsCards: [], art: AssetKeys.itemArtRustyDagger },
  { id: 'leather_cap', name: 'Leather Cap', kind: 'armor_head', grantsCards: [], armor: 1, art: AssetKeys.itemArtLeatherCap },
  { id: 'leather_tunic', name: 'Leather Tunic', kind: 'armor_body', grantsCards: [], armor: 1, art: AssetKeys.itemArtLeatherTunic },
  { id: 'travelers_cape', name: "Traveler's Cape", kind: 'cape', grantsCards: [], armor: 1, art: AssetKeys.itemArtTravelersCape },
  // The spellbook grants the player's spells (Core Gaps: spellbook-granted spells). Equipping it makes its
  // grantsSpells castable (derived into KnownSpells); the player starts with no spellbook and so no spells.
  // The apprentice book teaches the full starter kit so one pickup demonstrates every spell effect.
  { id: 'apprentice_spellbook', name: 'Apprentice Spellbook', kind: 'spellbook', grantsCards: [], grantsSpells: ['blizzard', 'selfheal', 'teleport'], art: AssetKeys.itemArtApprenticeSpellbook },

  // Reward items with resource EFFECTS (Amulet & Potion Items): a passive +max recomputed while equipped. The
  // three amulets share the single 'amulet' slot (wear one at a time); the energy potion is a permanent item in
  // the backup ('weapon_backup') slot, so its +energy stacks with a worn amulet. All numbers are tunable content.
  { id: 'mana_amulet', name: 'Amulet of Mana', kind: 'amulet', grantsCards: [], manaBonus: 3, art: AssetKeys.itemArtManaAmulet },
  { id: 'movement_amulet', name: 'Amulet of Swiftness', kind: 'amulet', grantsCards: [], movementBonus: 2, art: AssetKeys.itemArtMovementAmulet },
  { id: 'energy_amulet', name: 'Amulet of Energy', kind: 'amulet', grantsCards: [], energyBonus: 1, art: AssetKeys.itemArtEnergyAmulet },
  { id: 'energy_potion', name: 'Energy Potion', kind: 'weapon_backup', grantsCards: [], energyBonus: 1, art: AssetKeys.itemArtEnergyPotion },
];

/**
 * The player's starting equipment: the item ids equipped at run start. Their grants ARE the opening
 * deck — sword -> 2 Melee Strike, shield -> 2 Defend, bow -> 2 Ranged Shot, boots -> 2 Jump (8 cards).
 */
export const STARTER_EQUIPMENT: readonly string[] = ['iron_sword', 'wooden_shield', 'short_bow', 'leather_boots'];

const ITEM_BY_ID = new Map<string, ItemDef>(ITEM_DEFS.map((i) => [i.id, i]));

/** The item definition for an id, or undefined if unknown. */
export function itemDef(id: string): ItemDef | undefined {
  return ITEM_BY_ID.get(id);
}
