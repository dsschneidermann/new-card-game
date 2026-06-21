import Phaser from 'phaser';
import { BASE_WIDTH, BASE_HEIGHT } from '@core/index';
import { BootScene } from '@scenes/BootScene';
import { PreloadScene } from '@scenes/PreloadScene';
import { MainMenuScene } from '@scenes/MainMenuScene';
import { SettingsScene } from '@scenes/SettingsScene';
import { WorldScene } from '@scenes/WorldScene';
import { PauseOverlay } from '@scenes/PauseOverlay';

// Static bootstrap only. The canvas is created at the base size; BootScene then runs
// applyDisplaySettings to configure the manual scale factor, native canvas size, and
// scale mode from the persisted settings — the single, canonical flow shared with
// every later settings change. BootScene runs before any scene lays out, so the scale
// factor is in place in time.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: BASE_WIDTH,
  height: BASE_HEIGHT,
  backgroundColor: '#0e0e12',
  render: {
    // Snap sprites to integer device pixels so the position tween (SceneSync) never leaves a
    // sub-pixel seam at the top edge of a moving sprite's frame (bug mqo2118o, trying empirically).
    roundPixels: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, PreloadScene, MainMenuScene, SettingsScene, WorldScene, PauseOverlay],
};

new Phaser.Game(config);
