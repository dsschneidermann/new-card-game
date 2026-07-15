import type { CardDef, SpellDef } from './types';
import { AssetKeys } from '../assets/keys';

/**
 * The static starter card & spell content (feature 09). No mechanical effects
 * yet (feature 12); costs and targeting are real. Each definition IS a type,
 * keyed by id; a card's `art` is the registered AssetKey of its per-card art
 * (read by makeCardFace) and a spell's `art` is the registered AssetKey of its
 * sidebar icon (read by buildSpellSidebar).
 */
export const CARD_DEFS: readonly CardDef[] = [
  {
    id: 'melee',
    name: 'Melee Strike',
    cost: 1,
    art: AssetKeys.cardArtMelee,
    effectText: 'Deal 6 damage to an adjacent enemy.',
    target: { kind: 'singleHex', maxRange: 1 },
    attack: true,
    effect: { kind: 'Attack', damage: 6 },
  },
  {
    id: 'longstrike',
    name: 'Long Strike',
    cost: 1,
    art: AssetKeys.cardArtLongstrike,
    effectText: 'Deal 7 damage to an enemy up to 2 hexes away.',
    target: { kind: 'singleHex', maxRange: 2 },
    attack: true,
    heavyAttack: true,
    effect: { kind: 'Attack', damage: 7 },
  },
  {
    id: 'rangedshot',
    name: 'Ranged Shot',
    cost: 1,
    art: AssetKeys.cardArtRangedshot,
    effectText: 'Deal 5 damage to a target in line of sight (up to 5 hexes).',
    target: { kind: 'lineOfSight', maxRange: 5 },
    attack: true,
    effect: { kind: 'Attack', damage: 5 },
  },
  {
    id: 'defend',
    name: 'Defend',
    cost: 1,
    art: AssetKeys.cardArtDefend,
    effectText: 'Gain 5 Shield.',
    target: { kind: 'self' },
    effect: { kind: 'GainShield', amount: 5 },
  },
  {
    id: 'jump',
    name: 'Jump',
    cost: 0,
    art: AssetKeys.cardArtJump,
    effectText: 'Refund your movement points.',
    target: { kind: 'self' },
    effect: { kind: 'RefundMovement' },
  },
  {
    // Demonstrator: a TEMPORARY effect — draws a card and frees it (cost 0, shown green) until it
    // is played or discarded. Always draws via the deck's cycling draw (reshuffles if needed).
    id: 'quickdraw',
    name: 'Quick Draw',
    cost: 1,
    art: AssetKeys.cardArtQuickdraw,
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
    art: AssetKeys.cardArtSharpen,
    effectText: 'Permanently lower a random other card that still costs energy by 1.',
    target: { kind: 'self' },
    effect: { kind: 'ReduceRandomOtherCost', amount: 1 },
  },
  {
    // A self-centered AOE melee: hits every hex around the player up to distance 2. Fixed targeting
    // (selfAoe) — no range outline and no specific hex to aim; the surrounding hexes are the target.
    id: 'whirlwind',
    name: 'Whirlwind',
    cost: 2,
    art: AssetKeys.cardArtWhirlwind,
    effectText: 'Deal 5 damage to all enemies within 2 hexes.',
    target: { kind: 'selfAoe', radius: 2 },
    attack: true,
    heavyAttack: true,
    effect: { kind: 'Attack', damage: 5 },
  },
  {
    // Demonstrator: a card-PICK skill — opens the discard pile as a picker and returns the chosen card
    // to hand. target 'self' (same visual); pickFrom 'discard' drives the picker; the effect resolves
    // the picked card (cardTargets) by moving it from the discard pile back to the hand.
    id: 'recall',
    name: 'Recall',
    cost: 1,
    art: AssetKeys.cardArtRecall,
    effectText: 'Return a chosen card from your discard pile to your hand.',
    target: { kind: 'self' },
    pickFrom: { pile: 'discard' },
    effect: { kind: 'MoveToHand' },
  },
];

export const SPELL_DEFS: readonly SpellDef[] = [
  {
    id: 'blizzard',
    name: 'Blizzard',
    cost: 3,
    art: AssetKeys.spellArtBlizzard,
    effectArt: AssetKeys.spellEffectBlizzard, // file-per-frame cast effect played over the player
    effectText: 'Deal 6 frost damage to enemies in a 1-hex radius.',
    target: { kind: 'areaOfEffect', radius: 1 },
    effect: { kind: 'Attack', damage: 6 },
  },
  {
    id: 'selfheal',
    name: 'Self Heal',
    cost: 2,
    art: AssetKeys.spellArtSelfheal,
    effectText: 'Heal yourself for 8 HP.',
    target: { kind: 'self' },
    effect: { kind: 'Heal', amount: 8 },
  },
  {
    id: 'teleport',
    name: 'Teleport',
    cost: 2,
    art: AssetKeys.spellArtTeleport,
    effectText: 'Teleport a target enemy to a chosen hex.',
    target: { kind: 'twoStep', first: { kind: 'singleHex' }, second: { kind: 'singleHex' } },
    effect: { kind: 'TeleportEnemy' },
  },
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

/** True for heavy attacks — they play the attack2 (heavier) animation instead of the default attack1. */
export function isHeavyAttack(id: string): boolean {
  return CARD_BY_ID.get(id)?.heavyAttack === true;
}
export function spellDef(id: string): SpellDef | undefined {
  return SPELL_BY_ID.get(id);
}
