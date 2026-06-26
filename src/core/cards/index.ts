/** Cards, deck & spell definitions, targeting, and the card-entity deck cycle + stat effects. */
export type { CardDef, SpellDef, TargetSpec, Highlight, CardEffect, CardPick } from './types';
export type { DeckStateData, CardData, CardModsData, TempCardModsData } from './deck';
export {
  DeckState,
  Card,
  CardMods,
  TempCardMods,
  buildCardInstances,
  reshuffle,
  drawOne,
  drawUpTo,
} from './deck';
export { CARD_DEFS, SPELL_DEFS, cardDef, spellDef, isAttackCard, isHeavyAttack } from './content';
export { resolveTargeting, targetMaxRange } from './targeting';
export { makeCardSystem } from './system';
export { effectiveCost, cardEffectiveCost, isTempFree, sortPileForDisplay, pickCandidates } from './queries';
