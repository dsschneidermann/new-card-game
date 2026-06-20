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
  type DisplaySettings,
  type StorageAdapter,
} from '@core/index';

/**
 * Scene-side glue for the display settings. Only this file (and the scenes that
 * call it) touch the Phaser ScaleManager.
 *
 * ONE function fully configures the ScaleManager from a DisplaySettings, and it is
 * called identically at boot and on every settings change. It always sets EVERY
 * parameter to its target value for the given settings — it never inspects what
 * changed or applies a partial update. Phaser otherwise derives the aspect mode,
 * the parent bounds, and the canvas-size write once at boot from the config scale
 * mode; re-asserting all of them here is what makes a live change behave exactly
 * like a fresh boot, with no order- or history-dependent state.
 *
 * Resolution = the manual scale factor (s() renders natively at that factor) and
 * the native canvas pixel size. Viewport = the Phaser scale mode (Fit vs 1:1).
 */
export function applyDisplaySettings(scale: Phaser.Scale.ScaleManager, settings: DisplaySettings): void {
  // 1. Resolution -> manual scale factor + native canvas size.
  setScaleFactor(scaleFactorFor(settings.resolution));
  scale.setGameSize(s(BASE_WIDTH), s(BASE_HEIGHT));

  // 2. Viewport -> scale mode, plus the aspect-mode and parent state Phaser ties to
  //    the mode only at boot. FIT must constrain to the game's aspect ratio (parent
  //    bounds attached); NONE must show true pixels (no parent, so it is never
  //    clamped to the window).
  const mode = viewportScaleMode(settings.viewport) === 'none' ? Phaser.Scale.NONE : Phaser.Scale.FIT;
  scale.scaleMode = mode;
  scale.displaySize.setAspectMode(mode);
  if (mode === Phaser.Scale.NONE) {
    scale.displaySize.setParent();
  } else {
    scale.getParentBounds();
    if (scale.parentSize.width > 0 && scale.parentSize.height > 0) {
      scale.displaySize.setParent(scale.parentSize);
    }
  }

  // 3. Recompute + rewrite the canvas size. setZoom raises the ScaleManager's
  //    _resetZoom flag (the only path by which NONE writes the canvas style) and
  //    refreshes. Zoom stays 1 — we scale via s(), never via Phaser zoom.
  scale.setZoom(1);
}

export function loadDisplaySettings(storage: StorageAdapter): DisplaySettings {
  return parseDisplaySettings(storage.get(DISPLAY_SETTINGS_KEY));
}

export function saveDisplaySettings(storage: StorageAdapter, settings: DisplaySettings): void {
  storage.set(DISPLAY_SETTINGS_KEY, serializeDisplaySettings(settings));
}
