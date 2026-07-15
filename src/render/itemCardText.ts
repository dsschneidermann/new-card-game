import { cardDef, spellDef, type ItemDef } from '@core/index';

/**
 * The human-readable EFFECT lines for an item (Items Redo), derived from its content fields — the text shown in
 * the item rectangle's lower half (buildItemCard). Pure and Phaser-free (ADR-002) so the exact wording is
 * unit-testable without a Phaser harness, like enemyCardData: card grants are listed by NAME with a count
 * ('Melee Strike x2'), then flat armour, then resource +max bonuses, then a spellbook's spell names. An item
 * that does nothing yields ['no effect'] — replacing the old 'no bonus yet' / 'grants N cards' placeholders.
 */
export function itemEffectLines(def: ItemDef): string[] {
  const lines: string[] = [];

  // Card grants -> the card NAMES grouped with a count, in first-seen order (e.g. 'Melee Strike x2').
  const cardCounts = new Map<string, number>();
  for (const id of def.grantsCards) cardCounts.set(id, (cardCounts.get(id) ?? 0) + 1);
  for (const [id, n] of cardCounts) {
    const name = cardDef(id)?.name ?? id;
    lines.push(n > 1 ? `${name} x${n}` : name);
  }

  if ((def.armor ?? 0) > 0) lines.push(`Armor +${def.armor}`);
  if ((def.energyBonus ?? 0) > 0) lines.push(`Energy +${def.energyBonus}`);
  if ((def.manaBonus ?? 0) > 0) lines.push(`Mana +${def.manaBonus}`);
  if ((def.movementBonus ?? 0) > 0) lines.push(`Move +${def.movementBonus}`);
  for (const id of def.grantsSpells ?? []) lines.push(spellDef(id)?.name ?? id);

  return lines.length > 0 ? lines : ['no effect'];
}
