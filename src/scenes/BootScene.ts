import Phaser from 'phaser';
import { hasSave, type SavePresence, type StorageAdapter } from '@core/index';
import { ScreenRouter } from '@scenes/ScreenRouter';
import { LocalStorageAdapter } from '@scenes/LocalStorageAdapter';
import { applyDisplaySettings, loadDisplaySettings } from '@scenes/displaySettings';

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

    // Apply the persisted display settings (viewport + resolution) before anything renders.
    const display = loadDisplaySettings(storage);
    this.registry.set('display', display);
    applyDisplaySettings(this.scale, display);

    const save: SavePresence = { hasSave: () => hasSave(storage) };
    const router = new ScreenRouter(this.game, save);
    this.registry.set('router', router);
    this.scene.start('PreloadScene');
  }
}
