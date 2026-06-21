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
    target: { kind: 'singleHex', maxRange: 1 },
    attack: true,
  },
  {
    id: 'longstrike',
    name: 'Long Strike',
    cost: 1,
    art: 'card.art.longstrike',
    effectText: 'Deal damage to an enemy up to 2 hexes away.',
    target: { kind: 'singleHex', maxRange: 2 },
    attack: true,
  },
  {
    id: 'ranged',
    name: 'Ranged Shot',
    cost: 1,
    art: 'card.art.ranged',
    effectText: 'Deal damage to a target in line of sight (up to 5 hexes).',
    target: { kind: 'lineOfSight', maxRange: 5 },
    attack: true,
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
  {
    // Demonstrator: a TEMPORARY effect — draws a card and frees it (cost 0, shown green) until it
    // is played or discarded. Always draws via the deck's cycling draw (reshuffles if needed).
    id: 'quickdraw',
    name: 'Quick Draw',
    cost: 1,
    art: 'card.art.quickdraw',
    effectText: 'Draw a card. It costs 0 this turn.',
    target: { kind: 'self' },
    effect: { kind: 'DrawAndFree' },
  },
  {
    // Demonstrator: a PERMANENT effect — lowers a random OTHER in-hand card that still costs energy
    // by 1 for the rest of the run (shown yellow, the normal cost colour). Skips already-0-cost
    // cards and fizzles if none qualify.
    id: 'sharpen',
    name: 'Sharpen',
    cost: 1,
    art: 'card.art.sharpen',
    effectText: 'Permanently lower a random other card that still costs energy by 1.',
    target: { kind: 'self' },
    effect: { kind: 'ReduceRandomOtherCost', amount: 1 },
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

/**
 * The static starter deck: a multiset of card ids. At deck-build each id becomes its own
 * card-instance entity (duplicates are distinct instances that can carry different modifiers).
 */
export const STARTER_COLLECTION: readonly string[] = [
  'melee',
  'melee',
  'melee',
  'longstrike',
  'longstrike',
  'ranged',
  'ranged',
  'ranged',
  'defend',
  'defend',
  'jump',
  'jump',
  'quickdraw',
  'quickdraw',
  'sharpen',
  'sharpen',
];

const CARD_BY_ID = new Map<string, CardDef>(CARD_DEFS.map((c) => [c.id, c]));
const SPELL_BY_ID = new Map<string, SpellDef>(SPELL_DEFS.map((s) => [s.id, s]));

export function cardDef(id: string): CardDef | undefined {
  return CARD_BY_ID.get(id);
}

/** True for attack cards (melee/ranged) — they trigger the player's attack animation. */
export function isAttackCard(id: string): boolean {
  return CARD_BY_ID.get(id)?.attack === true;
}
export function spellDef(id: string): SpellDef | undefined {
  return SPELL_BY_ID.get(id);
}
