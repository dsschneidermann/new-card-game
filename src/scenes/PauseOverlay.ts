import Phaser from 'phaser';
import { AssetKeys } from '@core/index';
import type { ScreenRouter } from '@scenes/ScreenRouter';
import { makeButton, type Button } from '@scenes/MenuButton';

/**
 * In-level pause overlay (launched over a paused WorldScene). Offers Resume,
 * Restart Level, and Abandon; Abandon swaps to a local confirm panel (the
 * AbandonConfirm state) before clearing the run.
 */
export class PauseOverlay extends Phaser.Scene {
  private mainButtons: Button[] = [];
  private confirmButtons: Button[] = [];
  private confirmLabel?: Phaser.GameObjects.Text;

  constructor() {
    super('PauseOverlay');
  }

  create(): void {
    const router = this.registry.get('router') as ScreenRouter;
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);
    // Dialog panel from the Asset Preload system (ui.panel placeholder for now).
    this.add.image(width / 2, height / 2, AssetKeys.uiPanel).setDisplaySize(width * 0.5, height * 0.62);
    this.add
      .text(width / 2, height * 0.22, 'Paused', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#e0e0e0',
      })
      .setOrigin(0.5);

    this.mainButtons = [
      makeButton(this, width / 2, height * 0.42, 'Resume', () => router.dispatch('Resume')),
      makeButton(this, width / 2, height * 0.55, 'Restart Level', () => router.dispatch('RestartLevel')),
      makeButton(this, width / 2, height * 0.68, 'Abandon', () => {
        router.dispatch('RequestAbandon');
        this.setConfirm(true);
      }),
    ];

    this.confirmLabel = this.add
      .text(width / 2, height * 0.4, 'Abandon the run? Progress will be lost.', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#f0a0a0',
      })
      .setOrigin(0.5);
    this.confirmButtons = [
      makeButton(this, width / 2, height * 0.56, 'Yes, abandon', () => router.dispatch('ConfirmAbandon')),
      makeButton(this, width / 2, height * 0.69, 'Cancel', () => {
        router.dispatch('CancelAbandon');
        this.setConfirm(false);
      }),
    ];

    this.setConfirm(false);
  }

  private setConfirm(showConfirm: boolean): void {
    for (const b of this.mainButtons) b.setVisible(!showConfirm);
    this.confirmLabel?.setVisible(showConfirm);
    for (const b of this.confirmButtons) b.setVisible(showConfirm);
  }
}
