import Phaser from 'phaser';
import { BootScene } from '@scenes/BootScene';
import { PreloadScene } from '@scenes/PreloadScene';
import { MainMenuScene } from '@scenes/MainMenuScene';
import { SettingsScene } from '@scenes/SettingsScene';
import { WorldScene } from '@scenes/WorldScene';
import { PauseOverlay } from '@scenes/PauseOverlay';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#0e0e12',
  // NEAREST filtering + antialias off + roundPixels, so the integer-zoom (Desktop 2x)
  // upscale is a crisp pixel-double instead of a smoothed/blurry one.
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, PreloadScene, MainMenuScene, SettingsScene, WorldScene, PauseOverlay],
};

new Phaser.Game(config);
