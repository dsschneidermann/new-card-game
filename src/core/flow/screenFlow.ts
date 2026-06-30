/**
 * Pure screen-flow state machine for the application shell (feature 04).
 *
 * Phaser-free and deterministic (ADR-002): this is the unit-tested heart of the
 * UI. Phaser scenes are a thin layer that emit events and render the resulting
 * state; they never compute transitions themselves.
 */

export type ScreenState =
  | 'Title'
  | 'MainMenu'
  | 'Settings'
  | 'InLevel'
  | 'Paused'
  | 'AbandonConfirm'
  // The player was defeated (0 HP) mid-level (Core Gaps: player health & defeat). A terminal-for-the-run
  // screen offering Restart Level (replay the same level) or Back to Menu.
  | 'GameOver';

export type ScreenEvent =
  | 'NewGame'
  | 'RequestResume'
  | 'OpenSettings'
  | 'Back'
  | 'Pause'
  | 'Resume'
  | 'RestartLevel'
  | 'RequestAbandon'
  | 'ConfirmAbandon'
  | 'CancelAbandon'
  // Raised by the scene when the player's HP reaches 0 — the only edge into GameOver.
  | 'PlayerDied';

/** Injected query so the flow stays storage- and Phaser-agnostic (feature 12 provides the real one). */
export interface SavePresence {
  hasSave(): boolean;
}

export interface FlowContext {
  readonly hasSave: boolean;
}

export type FlowResult =
  | { readonly ok: true; readonly next: ScreenState }
  | { readonly ok: false; readonly reason: string };

/** The screen shown at boot. */
export const INITIAL_SCREEN: ScreenState = 'Title';

const accept = (next: ScreenState): FlowResult => ({ ok: true, next });
const reject = (reason: string): FlowResult => ({ ok: false, reason });

/**
 * Total, pure transition over (state, event, ctx). An undefined pair returns a
 * typed rejection rather than throwing. Resume requires an existing save.
 */
export function transition(state: ScreenState, event: ScreenEvent, ctx: FlowContext): FlowResult {
  switch (state) {
    case 'Title':
    case 'MainMenu':
      switch (event) {
        case 'NewGame':
          return accept('InLevel');
        case 'RequestResume':
          return ctx.hasSave ? accept('InLevel') : reject('No save available to resume');
        case 'OpenSettings':
          return accept('Settings');
        default:
          return reject(`No transition for "${event}" from "${state}"`);
      }
    case 'Settings':
      return event === 'Back'
        ? accept('MainMenu')
        : reject(`No transition for "${event}" from "Settings"`);
    case 'InLevel':
      switch (event) {
        case 'Pause':
          return accept('Paused');
        case 'PlayerDied':
          return accept('GameOver');
        default:
          return reject(`No transition for "${event}" from "InLevel"`);
      }
    case 'GameOver':
      switch (event) {
        case 'RestartLevel':
          return accept('InLevel');
        case 'Back':
          return accept('MainMenu');
        default:
          return reject(`No transition for "${event}" from "GameOver"`);
      }
    case 'Paused':
      switch (event) {
        case 'Resume':
          return accept('InLevel');
        case 'RestartLevel':
          return accept('InLevel');
        case 'RequestAbandon':
          return accept('AbandonConfirm');
        default:
          return reject(`No transition for "${event}" from "Paused"`);
      }
    case 'AbandonConfirm':
      switch (event) {
        case 'ConfirmAbandon':
          return accept('Title');
        case 'CancelAbandon':
          return accept('Paused');
        default:
          return reject(`No transition for "${event}" from "AbandonConfirm"`);
      }
    default:
      return reject(`Unknown state "${String(state)}"`);
  }
}
