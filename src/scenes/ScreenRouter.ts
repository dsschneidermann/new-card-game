import Phaser from 'phaser';
import {
  transition,
  INITIAL_SCREEN,
  type ScreenEvent,
  type ScreenState,
  type SavePresence,
} from '@core/index';

/**
 * Presentation-side router: holds the current ScreenState, validates every
 * navigation through the pure core `transition()`, and drives Phaser scene
 * changes. Scenes call `dispatch(event)` and never branch on their own.
 */
export class ScreenRouter {
  private state: ScreenState = INITIAL_SCREEN;

  constructor(
    private readonly game: Phaser.Game,
    private readonly save: SavePresence,
  ) {}

  get current(): ScreenState {
    return this.state;
  }

  hasSave(): boolean {
    return this.save.hasSave();
  }

  /** Returns true if the event was accepted and applied. */
  dispatch(event: ScreenEvent): boolean {
    const result = transition(this.state, event, { hasSave: this.save.hasSave() });
    if (!result.ok) {
      console.warn(`[flow] rejected "${event}" from "${this.state}": ${result.reason}`);
      return false;
    }
    const from = this.state;
    this.state = result.next;
    this.applyScene(from, result.next, event);
    return true;
  }

  private applyScene(from: ScreenState, to: ScreenState, event: ScreenEvent): void {
    const mgr = this.game.scene;
    switch (to) {
      case 'Title':
      case 'MainMenu':
        mgr.stop('WorldScene');
        mgr.stop('PauseOverlay');
        mgr.stop('SettingsScene');
        mgr.start('MainMenuScene');
        break;
      case 'Settings':
        mgr.stop('MainMenuScene');
        mgr.start('SettingsScene');
        break;
      case 'InLevel':
        if (from === 'Paused') {
          mgr.stop('PauseOverlay');
          if (event === 'RestartLevel') {
            mgr.stop('WorldScene');
            mgr.start('WorldScene');
          } else {
            mgr.resume('WorldScene');
          }
        } else {
          mgr.stop('MainMenuScene');
          mgr.stop('SettingsScene');
          mgr.start('WorldScene');
        }
        break;
      case 'Paused':
        if (from === 'InLevel') {
          mgr.pause('WorldScene');
          mgr.start('PauseOverlay'); // runs in parallel with the paused WorldScene (overlay)
        }
        break;
      case 'AbandonConfirm':
        // The PauseOverlay shows its confirm UI locally; no scene change here.
        break;
    }
  }
}
