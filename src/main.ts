import Phaser from 'phaser';
import { BASE_WIDTH, BASE_HEIGHT, s, setScaleFactor, scaleFactorFor, viewportScaleMode } from '@core/index';
import { LocalStorageAdapter } from '@scenes/LocalStorageAdapter';
import { loadDisplaySettings } from '@scenes/displaySettings';
import { BootScene } from '@scenes/BootScene';
import { PreloadScene } from '@scenes/PreloadScene';
import { MainMenuScene } from '@scenes/MainMenuScene';
import { SettingsScene } from '@scenes/SettingsScene';
import { WorldScene } from '@scenes/WorldScene';
import { PauseOverlay } from '@scenes/PauseOverlay';

// Apply the persisted display scale BEFORE creating the game, so the canvas is sized
// natively (s(BASE) x s(BASE)) and every scene lays out at the right factor from boot.
const display = loadDisplaySettings(new LocalStorageAdapter());
setScaleFactor(scaleFactorFor(display.resolution));

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: s(BASE_WIDTH),
  height: s(BASE_HEIGHT),
  backgroundColor: '#0e0e12',
  scale: {
    mode: viewportScaleMode(display.viewport) === 'none' ? Phaser.Scale.NONE : Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, PreloadScene, MainMenuScene, SettingsScene, WorldScene, PauseOverlay],
};

new Phaser.Game(config);
