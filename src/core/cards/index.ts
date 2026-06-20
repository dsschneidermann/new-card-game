/** Cards, deck & spell definitions + targeting (feature 09). */
export type { CardDef, SpellDef, TargetSpec, Highlight } from './types';
export type { DeckStateData } from './deck';
export { DeckState, drawHand } from './deck';
export { CARD_DEFS, SPELL_DEFS, STARTER_COLLECTION, cardDef, spellDef, isAttackCard } from './content';
export { resolveTargeting, targetMaxRange } from './targeting';
