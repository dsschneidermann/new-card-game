import Phaser from 'phaser';
import type { SavePresence } from '@core/index';
import { ScreenRouter } from '@scenes/ScreenRouter';

/**
 * Boot/entry scene: constructs the ScreenRouter (the app-flow controller),
 * registers it for all scenes, and hands off to the main menu. Real asset
 * preloading will live here when the Asset Preload feature (03) lands; real
 * save-presence arrives with Persistence (feature 12).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const save: SavePresence = { hasSave: () => false }; // no persistence yet (feature 12)
    const router = new ScreenRouter(this.game, save);
    this.registry.set('router', router);
    this.scene.start('MainMenuScene');
  }
}
