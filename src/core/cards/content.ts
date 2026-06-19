import type { CardDef, SpellDef } from './types';

/**
 * The static starter card & spell content (feature 09). No mechanical effects
 * yet (feature 12); costs and targeting are real. Each definition IS a type,
 * keyed by id; art is keyed by id (card.art.<id> / spell.icon.<id>).
 */
export const CARD_DEFS: readonly CardDef[] = [
  {
    id: 'melee',
    name: 'Melee Strike',
    cost: 1,
    art: 'card.art.melee',
    effectText: 'Deal damage to an adjacent enemy.',
    target: { kind: 'singleHex' },
  },
  {
    id: 'ranged',
    name: 'Ranged Shot',
    cost: 1,
    art: 'card.art.ranged',
    effectText: 'Deal damage to a target in line of sight.',
    target: { kind: 'lineOfSight' },
  },
  {
    id: 'defend',
    name: 'Defend',
    cost: 1,
    art: 'card.art.defend',
    effectText: 'Gain Block.',
    target: { kind: 'self' },
  },
  {
    id: 'jump',
    name: 'Jump',
    cost: 0,
    art: 'card.art.jump',
    effectText: 'Refund your movement points.',
    target: { kind: 'self' },
  },
];

export const SPELL_DEFS: readonly SpellDef[] = [
  {
    id: 'blizzard',
    name: 'Blizzard',
    cost: 3,
    art: 'spell.icon.blizzard',
    effectText: 'Frost damage in a 3-hex area.',
    target: { kind: 'areaOfEffect', radius: 1 },
  },
  {
    id: 'heal',
    name: 'Self Heal',
    cost: 2,
    art: 'spell.icon.heal',
    effectText: 'Heal yourself.',
    target: { kind: 'self' },
  },
  {
    id: 'teleport',
    name: 'Teleport',
    cost: 2,
    art: 'spell.icon.teleport',
    effectText: 'Teleport a target enemy to a chosen hex.',
    target: { kind: 'twoStep', first: { kind: 'singleHex' }, second: { kind: 'singleHex' } },
  },
];

/** The static starter deck: a multiset of card ids (duplicates are copies). */
export const STARTER_COLLECTION: readonly string[] = [
  'melee',
  'melee',
  'ranged',
  'ranged',
  'defend',
  'defend',
  'jump',
];

const CARD_BY_ID = new Map<string, CardDef>(CARD_DEFS.map((c) => [c.id, c]));
const SPELL_BY_ID = new Map<string, SpellDef>(SPELL_DEFS.map((s) => [s.id, s]));

export function cardDef(id: string): CardDef | undefined {
  return CARD_BY_ID.get(id);
}
export function spellDef(id: string): SpellDef | undefined {
  return SPELL_BY_ID.get(id);
}
