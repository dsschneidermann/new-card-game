import Phaser from 'phaser';
import { AssetKeys, s } from '@core/index';
import type { ScreenRouter } from '@scenes/ScreenRouter';
import { makeButton } from '@scenes/MenuButton';

/**
 * Player-defeat overlay (Core Gaps: player health & defeat), launched over the paused WorldScene when the
 * player reaches 0 HP. Offers two routes through the screen-flow FSM: Restart Level (replay the same level
 * from the start) and Back to Menu. Mirrors PauseOverlay — a dim modal panel + title + MenuButtons that only
 * dispatch screen-flow events; the ScreenRouter performs the actual scene changes.
 */
export class GameOverOverlay extends Phaser.Scene {
  constructor() {
    super('GameOverOverlay');
  }

  create(): void {
    const router = this.registry.get('router') as ScreenRouter;
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    this.add.image(width / 2, height / 2, AssetKeys.uiPanel).setDisplaySize(width * 0.5, height * 0.62);
    this.add
      .text(width / 2, height * 0.26, 'You Died', {
        fontFamily: 'monospace',
        fontSize: `${s(64)}px`,
        color: '#f0a0a0',
      })
      .setOrigin(0.5);

    makeButton(this, width / 2, height * 0.48, 'Restart Level', () => router.dispatch('RestartLevel'));
    makeButton(this, width / 2, height * 0.61, 'Back to Menu', () => router.dispatch('Back'));
  }
}
