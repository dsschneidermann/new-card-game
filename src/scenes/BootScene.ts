import Phaser from 'phaser';
import type { SavePresence } from '@core/index';
import { ScreenRouter } from '@scenes/ScreenRouter';

/**
 * Boot/entry scene: constructs the ScreenRouter (app-flow controller), registers
 * it for all scenes, and hands off to the asset PreloadScene, which then enters
 * the main menu. Real save-presence arrives with Persistence (feature 12).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const save: SavePresence = { hasSave: () => false }; // no persistence yet (feature 12)
    const router = new ScreenRouter(this.game, save);
    this.registry.set('router', router);
    this.scene.start('PreloadScene');
  }
}
