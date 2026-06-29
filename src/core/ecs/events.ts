import type { EntityId } from './entity';
import type { Hex } from '../hex/hex';

/**
 * Domain events emitted by systems during a step and drained at the end for
 * rendering/replay (decision Q2: events are an output log). Features extend
 * this union with their own event kinds.
 */
export type GameEvent =
  // cardEntity (when present) is the played card-instance entity, echoed from the PlayCard command
  // so the card system can move it to the discard pile + resolve its effect, and the renderer can
  // animate that exact card out of the hand. cardTargets (when present) are picked card instances
  // echoed for the effect (e.g. Recall's chosen discard card). targets (when present) are the aimed
  // hex(es) — forwarded from the command so an attack card can damage the enemies standing on them.
  | { kind: 'CardPlayed'; entity: EntityId; cardId: string; cardEntity?: EntityId; cardTargets?: readonly EntityId[]; targets?: readonly Hex[] }
  | { kind: 'SpellCast'; entity: EntityId; spellId?: string }
  | { kind: 'DamageDealt'; target: EntityId; amount: number }
  | { kind: 'EntityDied'; entity: EntityId }
  // Combat (Enemy Archetypes, ADR-007). DamageDealt above is the source-agnostic "target lost N HP" event
  // (a future poison/DoT reuses it); AttackResolved adds the attack-specific breakdown — who struck whom,
  // with which named attack, how much shield soaked it, and whether it was lethal — so the scene can
  // animate the specific attack and hit.
  | { kind: 'AttackResolved'; attacker: EntityId; target: EntityId; attack: string; hpLost: number; shieldAbsorbed: number; lethal: boolean }
  // A player attack CARD asks combat to resolve damage (Defense & Shielding): the card system emits this
  // from the card's Attack effect, carrying everything the resolver needs (attacker, the aimed hexes, the
  // card's damage/pierce and its id as the attack name) so combat resolves it WITHOUT importing the cards
  // module. A combat system reacts the same step and produces the AttackResolved / DamageDealt outcome.
  | { kind: 'AttackRequested'; attacker: EntityId; hexes: readonly Hex[]; damage: number; pierce: number; attack: string }
  | { kind: 'EntityStepped'; entity: EntityId; q: number; r: number }
  // Movement Resolution: a whole move resolves in ONE advance as a bracketed hop-log. MovementStarted
  // carries the planned path (start..end); a render MoveAnimator replays it over real time so the sprite
  // lags the committed position. interruptIndex (set by a future Trap/Status system that truncates the
  // path) marks where the move halts. MovementEnded fires on the last/halted hop -> once-per-intent settle.
  | { kind: 'MovementStarted'; entity: EntityId; path: readonly Hex[]; interruptIndex?: number }
  | { kind: 'MovementEnded'; entity: EntityId; at: Hex; interrupted: boolean }
  // Card system (Card Entities, Deck Cycle & Stat Effects). HandDealt: the whole hand was replaced at
  // turn start (old hand discarded, fresh hand drawn) -> the scene discards every card and deals the
  // new hand in. HandChanged: an effect drew a card or changed a cost mid-turn -> the scene refreshes
  // the fan incrementally. CardDiscarded: a single card left the hand for the discard pile (a play)
  // -> the scene animates that instance out.
  | { kind: 'HandDealt'; entity: EntityId }
  | { kind: 'HandChanged'; entity: EntityId }
  | { kind: 'CardDiscarded'; entity: EntityId; instance: EntityId; defId: string }
  // Turn engine (feature 07). Phase is the literal 'player' | 'enemy' (kept inline
  // so events.ts has no dependency on the turn module).
  | { kind: 'RoundStarted'; round: number }
  | { kind: 'TurnStarted'; phase: 'player' | 'enemy'; actor?: EntityId }
  | { kind: 'TurnEnded'; phase: 'player' | 'enemy' }
  | { kind: 'ResourceChanged'; entity: EntityId }
  | { kind: 'ActionRejected'; reason: string }
  // Approach-Interact Core System. ChestInteractReady: the player has reached the chest's stop hex (or was
  // already adjacent) and its reward offer has been rolled — the scene plays the opening animation + a short
  // beat, then opens the picker (presentation timing). ChestOpened: a pick was applied (chosen reward taken,
  // chest marked opened) — the scene holds the opened art and refreshes pile counts. MimicRevealed: a
  // disguised mimic was reached and woke — the scene swaps it from its chest disguise to its monster animation.
  | { kind: 'ChestInteractReady'; entity: EntityId; chest: EntityId }
  | { kind: 'ChestOpened'; chest: EntityId }
  | { kind: 'MimicRevealed'; mimic: EntityId };
