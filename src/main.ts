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
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, PreloadScene, MainMenuScene, SettingsScene, WorldScene, PauseOverlay],
};

new Phaser.Game(config);
