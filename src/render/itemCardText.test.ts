import { describe, it, expect } from 'vitest';
import { itemDef } from '@core/index';
import { itemEffectLines } from '@render/itemCardText';

/** itemEffectLines is the pure effect-text derivation shown on the item card (Items Redo). */
describe('itemEffectLines', () => {
  it('shows granted cards by NAME with a count', () => {
    expect(itemEffectLines(itemDef('iron_sword')!)).toEqual(['Melee Strike x2']);
    expect(itemEffectLines(itemDef('short_bow')!)).toEqual(['Ranged Shot x2']);
  });

  it('shows armour, and lists card grants THEN armour for a wearable that does both', () => {
    expect(itemEffectLines(itemDef('leather_cap')!)).toEqual(['Armor +1']);
    expect(itemEffectLines(itemDef('wooden_shield')!)).toEqual(['Defend x2', 'Armor +1']);
    expect(itemEffectLines(itemDef('leather_boots')!)).toEqual(['Jump x2', 'Armor +1']);
  });

  it('shows resource +max bonuses and a spellbook’s spell names', () => {
    expect(itemEffectLines(itemDef('mana_amulet')!)).toEqual(['Mana +3']);
    expect(itemEffectLines(itemDef('movement_amulet')!)).toEqual(['Move +2']);
    expect(itemEffectLines(itemDef('energy_amulet')!)).toEqual(['Energy +1']);
    expect(itemEffectLines(itemDef('energy_potion')!)).toEqual(['Energy +1']);
    expect(itemEffectLines(itemDef('apprentice_spellbook')!)).toEqual(['Blizzard', 'Self Heal', 'Teleport']);
  });

  it("returns ['no effect'] for a genuinely effectless item — never 'no bonus yet'", () => {
    expect(itemEffectLines(itemDef('rusty_dagger')!)).toEqual(['no effect']);
  });
});
