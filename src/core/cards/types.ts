import type { Hex } from '../hex/hex';
import type { AssetKey } from '../assets/keys';

/**
 * How a card/spell is targeted (feature 09). Extensible: a new shape is one new
 * variant here + one case in resolveTargeting — no per-card branching in the UI.
 */
export type TargetSpec =
  | { kind: 'self' } // any hex; the target is ignored / not stored (resolves on the caster)
  // maxRange (optional): the target hex must be within this many hexes of the caster;
  // omitted = unrestricted. Purely hex distance — no walls / line-of-sight blocking.
  | { kind: 'singleHex'; maxRange?: number }
  | { kind: 'lineOfSight'; maxRange?: number }
  | { kind: 'areaOfEffect'; radius: number }
  // selfAoe: a fixed, self-centered burst — every hex within radius of the caster (minus the
  // caster's own hex), independent of the cursor. No maxRange, so no range outline is drawn.
  | { kind: 'selfAoe'; radius: number }
  | { kind: 'twoStep'; first: TargetSpec; second: TargetSpec };

/**
 * A mechanical card effect resolved by the card system when the card is played (Card Entities,
 * Deck Cycle & Stat Effects). Extensible: a new effect is one variant here + one case in the card
 * system's resolveEffect. DrawAndFree draws an extra card and makes it free this hand (temporary);
 * ReduceRandomOtherCost permanently lowers a random OTHER in-hand card's cost by `amount`.
 */
export type CardEffect =
  | { kind: 'DrawAndFree' }
  | { kind: 'ReduceRandomOtherCost'; amount: number }
  | { kind: 'MoveToHand' }; // moves the picked card (cardTargets[0]) to hand from whichever pile holds it

/**
 * A card's optional card-pick: playing it opens a picker over `pile`, optionally narrowed by `filter`
 * (by card def id, e.g. (id) => isAttackCard(id)). The picked card instance becomes the play's
 * cardTargets, resolved by the card's effect (e.g. MoveToHand). (A list of generated cards to pick
 * from is deferred until a card needs it.)
 */
export type CardPick = { pile: 'draw' | 'hand' | 'discard'; filter?: (defId: string) => boolean };

/**
 * A card definition. Each CardDef IS a card type, identified by id; the deck holds card-instance
 * entities (duplicates = separate instances). `art` is the registered AssetKey of the card's
 * per-card art, read directly by makeCardFace (no longer derived from id). effectText is the
 * display string; `effect` (if present) is the mechanical effect the card system resolves on play.
 */
export interface CardDef {
  readonly id: string;
  readonly name: string;
  readonly cost: number; // energy (base; per-instance modifiers adjust the effective cost)
  readonly art: AssetKey; // registered asset key of the per-card art (e.g. AssetKeys.cardArtMelee)
  readonly effectText: string;
  readonly target: TargetSpec;
  /** Attack cards (melee/ranged) trigger the player's attack animation when played. */
  readonly attack?: boolean;
  /** A heavier attack: plays the attack2 animation instead of the default attack1 (presentation-only). */
  readonly heavyAttack?: boolean;
  /** Mechanical effect resolved by the card system on play (skills like Quick Draw / Sharpen). */
  readonly effect?: CardEffect;
  /** If set, playing this card opens a card-picker on the chosen pile; the picked card becomes the play's cardTargets. */
  readonly pickFrom?: CardPick;
}

/** A spell definition. Each SpellDef IS a spell type, identified by id (spell.icon.<id>). */
export interface SpellDef {
  readonly id: string;
  readonly name: string;
  readonly cost: number; // mana
  readonly art: string; // asset key, conventionally spell.icon.<id>
  readonly effectText: string;
  readonly target: TargetSpec;
}

/** Hexes to tint while targeting: primary (red) and secondary (yellow). */
export interface Highlight {
  readonly primary: Hex[];
  readonly secondary: Hex[];
}
