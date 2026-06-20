import Phaser from 'phaser';
import { hasSave, type SavePresence, type StorageAdapter } from '@core/index';
import { ScreenRouter } from '@scenes/ScreenRouter';
import { LocalStorageAdapter } from '@scenes/LocalStorageAdapter';
import { loadDisplaySettings } from '@scenes/displaySettings';

/**
 * Boot/entry scene: constructs the persistence StorageAdapter and the
 * ScreenRouter (app-flow controller), registers both for all scenes, and hands
 * off to the asset PreloadScene, which then enters the main menu. The save
 * adapter is the single source for both save-presence (Resume availability) and
 * the WorldScene autosave/resume (feature 06).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const storage: StorageAdapter = new LocalStorageAdapter();
    this.registry.set('storage', storage);

    // The display scale + viewport are applied in main.ts before the game is created;
    // here we just publish the settings for SettingsScene to read/toggle.
    this.registry.set('display', loadDisplaySettings(storage));

    const save: SavePresence = { hasSave: () => hasSave(storage) };
    const router = new ScreenRouter(this.game, save);
    this.registry.set('router', router);
    this.scene.start('PreloadScene');
  }
}
