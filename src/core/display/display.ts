/**
 * Display settings (browser pixel clarity): how the fixed 960x540 game canvas is
 * presented. Phaser-free (ADR-002) — a neutral model plus a pure mapping the
 * scenes apply to the Phaser ScaleManager. The game's coordinate space never
 * changes; only the canvas scale mode and an integer zoom do, so the hex grid
 * cols/rows and every hex / sprite / UI aspect are preserved automatically.
 */

/** Fit the canvas to the browser viewport (current default) vs show it at 1:1 actual pixels. */
export type ViewportMode = 'fit' | 'actual';

/** iPad = base 960x540 (zoom 1); desktop = integer 2x (1920x1080). */
export type ResolutionTier = 'ipad' | 'desktop';

export interface DisplaySettings {
  readonly viewport: ViewportMode;
  readonly resolution: ResolutionTier;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = { viewport: 'fit', resolution: 'ipad' };

/** Storage key for the persisted display settings (separate from the run save). */
export const DISPLAY_SETTINGS_KEY = 'new-card-game/display';

/** Integer canvas zoom for the larger desktop resolution. */
export const DESKTOP_ZOOM = 2;

/**
 * A neutral, Phaser-free scale plan: `mode` maps to Phaser.Scale.FIT/NONE and
 * `zoom` to the ScaleManager zoom. Integer zoom keeps pixels aligned.
 */
export interface ScalePlan {
  readonly mode: 'fit' | 'none';
  readonly zoom: number;
}

export function planScale(s: DisplaySettings): ScalePlan {
  return {
    mode: s.viewport === 'actual' ? 'none' : 'fit',
    zoom: s.resolution === 'desktop' ? DESKTOP_ZOOM : 1,
  };
}

export function serializeDisplaySettings(s: DisplaySettings): string {
  return JSON.stringify({ viewport: s.viewport, resolution: s.resolution });
}

/**
 * Total parse: an absent, malformed, or out-of-range value never throws and never
 * yields an invalid setting — each field falls back to its default independently.
 */
export function parseDisplaySettings(raw: string | null): DisplaySettings {
  if (raw === null) return DEFAULT_DISPLAY_SETTINGS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
  if (typeof data !== 'object' || data === null) return DEFAULT_DISPLAY_SETTINGS;
  const obj = data as Record<string, unknown>;
  return {
    viewport: obj.viewport === 'actual' ? 'actual' : 'fit',
    resolution: obj.resolution === 'desktop' ? 'desktop' : 'ipad',
  };
}
