import Phaser from 'phaser';
import { AssetKeys } from '@core/index';
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

    // Backdrop + wordmark from the Asset Preload system (placeholder art for now).
    this.add.image(width / 2, height / 2, AssetKeys.uiMenuBackground).setDisplaySize(width, height);
    this.add.image(width / 2, height * 0.26, AssetKeys.brandLogo).setDisplaySize(320, 160);

    const canResume = router.hasSave();
    makeButton(this, width / 2, height * 0.52, 'New Game', () => router.dispatch('NewGame'));
    makeButton(
      this,
      width / 2,
      height * 0.65,
      canResume ? 'Resume' : 'Resume (no save)',
      () => router.dispatch('RequestResume'),
      { enabled: canResume },
    );
    makeButton(this, width / 2, height * 0.78, 'Settings', () => router.dispatch('OpenSettings'));
  }
}
