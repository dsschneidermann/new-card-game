import Phaser from 'phaser';
import type { ScreenRouter } from '@scenes/ScreenRouter';
import { makeButton } from '@scenes/MenuButton';

/** Title / main menu: New Game, Resume (only when a save exists), Settings. */
export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenuScene');
  }

  create(): void {
    const router = this.registry.get('router') as ScreenRouter;
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0e0e12');

    this.add
      .text(width / 2, height * 0.24, 'new-card-game', {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: '#e0e0e0',
      })
      .setOrigin(0.5);

    const canResume = router.hasSave();
    makeButton(this, width / 2, height * 0.48, 'New Game', () => router.dispatch('NewGame'));
    makeButton(
      this,
      width / 2,
      height * 0.61,
      canResume ? 'Resume' : 'Resume (no save)',
      () => router.dispatch('RequestResume'),
      { enabled: canResume },
    );
    makeButton(this, width / 2, height * 0.74, 'Settings', () => router.dispatch('OpenSettings'));
  }
}
