import type { AssetKey } from '../assets/keys';

/**
 * Items & equipment (Card, Item & Spell Pickups feature). An ItemDef is plain, engine-agnostic data
 * identified by id; its `kind` is the equipment slot it fills (the player equips at most one item per
 * kind). `grantsCards` are the CardDef ids the item instantiates into the deck when equipped (and
 * destroys when replaced) — this is how the player's basic deck is built from the starting items.
 * `grantsSpells` is reserved for spellbook items and is NOT consumed yet (spellbooks are deferred:
 * there is no player-spell collection, so it is illustrative data only for now).
 */

/**
 * The ten equipment slot kinds. One item of each kind may be equipped at a time. `boots` (feet) is the
 * home for the Jump cards; `spellbook` is a placeholder whose spell-granting is deferred (TBD).
 */
export type EquipKind =
  | 'weapon_melee'
  | 'weapon_ranged'
  | 'weapon_backup'
  | 'shield'
  | 'armor_head'
  | 'armor_body'
  | 'cape'
  | 'amulet'
  | 'boots'
  | 'spellbook';

/** The ten kinds as a runtime list (used by tests + any "equip one of each" iteration). */
export const EQUIP_KINDS: readonly EquipKind[] = [
  'weapon_melee',
  'weapon_ranged',
  'weapon_backup',
  'shield',
  'armor_head',
  'armor_body',
  'cape',
  'amulet',
  'boots',
  'spellbook',
];

/** A single item definition. Each ItemDef IS an item type, keyed by id. */
export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly kind: EquipKind;
  /** CardDef ids granted while equipped: instantiated on equip, destroyed on replace/unequip. */
  readonly grantsCards: readonly string[];
  /** SpellDef ids a spellbook would grant — DEFERRED (not consumed yet; spellbooks are TBD). */
  readonly grantsSpells?: readonly string[];
  /** Flat armour added to the player's CombatStats.armor while equipped (Defense & Shielding): added on
   *  equip, removed on unequip/replace. Absent means 0 — weapons grant none. */
  readonly armor?: number;
  /** Registered AssetKey of this item's equipment art (e.g. AssetKeys.itemArtIronSword): shown in the
   *  item rectangle's top half and in the equipped-items overlay slot. Mirrors CardDef.art / SpellDef.art. */
  readonly art: AssetKey;
}
