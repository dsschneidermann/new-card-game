import type { ItemDef } from './types';
import { AssetKeys } from '../assets/keys';

/**
 * The static starter item content (Card, Item & Spell Pickups). One example ItemDef per kind. Today
 * only the four BASIC items grant cards — the player's starting deck is DERIVED from them (see
 * STARTER_EQUIPMENT) — while the rest are placeholders with no mechanical effect until item stat
 * bonuses / spellbooks land. Adding an item is data only (no code change).
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
  { id: 'plain_amulet', name: 'Plain Amulet', kind: 'amulet', grantsCards: [], art: AssetKeys.itemArtPlainAmulet },
  // grantsSpells is illustrative only — spellbook -> spell granting is deferred (no player-spell collection yet).
  { id: 'apprentice_spellbook', name: 'Apprentice Spellbook', kind: 'spellbook', grantsCards: [], grantsSpells: ['blizzard'], art: AssetKeys.itemArtApprenticeSpellbook },
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
