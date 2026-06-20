import Phaser from 'phaser';
import {
  parseDisplaySettings,
  serializeDisplaySettings,
  scaleFactorFor,
  setScaleFactor,
  viewportScaleMode,
  s,
  BASE_WIDTH,
  BASE_HEIGHT,
  DISPLAY_SETTINGS_KEY,
  type ViewportMode,
  type ResolutionTier,
  type DisplaySettings,
  type StorageAdapter,
} from '@core/index';

/**
 * Scene-side glue for the display settings. The Resolution drives the manual scale
 * factor (native render at s()-scaled size); the Viewport drives the Phaser scale
 * mode (fit vs 1:1). Only this file and the scenes touch the ScaleManager.
 */

/** Apply the viewport mode (Fit vs 1:1 Actual) to the ScaleManager — immediate, no re-layout. */
export function applyViewport(scale: Phaser.Scale.ScaleManager, viewport: ViewportMode): void {
  scale.scaleMode = viewportScaleMode(viewport) === 'none' ? Phaser.Scale.NONE : Phaser.Scale.FIT;
  scale.refresh();
}

/**
 * Apply the resolution: set the global scale factor and resize the game to the
 * native s()-scaled size. The CALLER must then rebuild the active scene(s) so all
 * s()-based layout re-runs at the new factor (e.g. scene.restart()).
 */
export function applyResolution(scale: Phaser.Scale.ScaleManager, resolution: ResolutionTier): void {
  setScaleFactor(scaleFactorFor(resolution));
  scale.setGameSize(s(BASE_WIDTH), s(BASE_HEIGHT));
}

export function loadDisplaySettings(storage: StorageAdapter): DisplaySettings {
  return parseDisplaySettings(storage.get(DISPLAY_SETTINGS_KEY));
}

export function saveDisplaySettings(storage: StorageAdapter, settings: DisplaySettings): void {
  storage.set(DISPLAY_SETTINGS_KEY, serializeDisplaySettings(settings));
}
