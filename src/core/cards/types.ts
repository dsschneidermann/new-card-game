import type { Hex } from '../hex/hex';

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
  | { kind: 'twoStep'; first: TargetSpec; second: TargetSpec };

/**
 * A card definition. Each CardDef IS a card type, identified by id; the deck
 * holds ids (duplicates = copies). Art is keyed by id (card.art.<id>). No
 * mechanical effect yet — effectText is display-only until feature 12.
 */
export interface CardDef {
  readonly id: string;
  readonly name: string;
  readonly cost: number; // energy
  readonly art: string; // asset key, conventionally card.art.<id>
  readonly effectText: string;
  readonly target: TargetSpec;
  /** Attack cards (melee/ranged) trigger the player's attack animation when played. */
  readonly attack?: boolean;
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
