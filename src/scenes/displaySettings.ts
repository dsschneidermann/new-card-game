import Phaser from 'phaser';
import {
  planScale,
  parseDisplaySettings,
  serializeDisplaySettings,
  DISPLAY_SETTINGS_KEY,
  type DisplaySettings,
  type ScalePlan,
  type StorageAdapter,
} from '@core/index';

/**
 * Scene-side glue for the display settings (feature: Display Settings). Translates
 * the pure ScalePlan to the Phaser ScaleManager and persists settings via the
 * StorageAdapter. Only this file (and the scenes using it) touch Phaser scaling.
 */

/** Apply a neutral scale plan to the Phaser ScaleManager — takes effect immediately. */
export function applyScalePlan(scale: Phaser.Scale.ScaleManager, plan: ScalePlan): void {
  scale.scaleMode = plan.mode === 'none' ? Phaser.Scale.NONE : Phaser.Scale.FIT;
  scale.setZoom(plan.zoom);
  scale.refresh();
}

/** Apply a settings object's scale plan to the ScaleManager. */
export function applyDisplaySettings(scale: Phaser.Scale.ScaleManager, settings: DisplaySettings): void {
  applyScalePlan(scale, planScale(settings));
}

export function loadDisplaySettings(storage: StorageAdapter): DisplaySettings {
  return parseDisplaySettings(storage.get(DISPLAY_SETTINGS_KEY));
}

export function saveDisplaySettings(storage: StorageAdapter, settings: DisplaySettings): void {
  storage.set(DISPLAY_SETTINGS_KEY, serializeDisplaySettings(settings));
}
