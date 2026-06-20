/**
 * Display settings (browser pixel clarity) + the manual pixel-scale used to render
 * the game crisply at a larger size. Phaser-free (ADR-002).
 *
 * The 'Desktop' resolution is implemented by MULTIPLYING every base (iPad) pixel
 * value by a scale factor and rendering NATIVELY at that size (crisp) — NOT by
 * zooming a fixed frame (which aliases at any non-1:1 scale). s(n) is the single
 * chokepoint: EVERY pixel number that reaches Phaser or a layout calculation must
 * pass through it. The factor is set once (from the Resolution setting) before any
 * scene lays out, so never call s() in a module-level constant — only at use time.
 */

/** Fit the canvas to the browser viewport (default) vs show it at 1:1 actual pixels. */
export type ViewportMode = 'fit' | 'actual';

/** iPad = base scale 1; Desktop = native integer 2x. */
export type ResolutionTier = 'ipad' | 'desktop';

export interface DisplaySettings {
  readonly viewport: ViewportMode;
  readonly resolution: ResolutionTier;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = { viewport: 'fit', resolution: 'ipad' };
export const DISPLAY_SETTINGS_KEY = 'new-card-game/display';

/** Desktop renders at this integer multiple of the base pixel scale, natively. */
export const DESKTOP_SCALE = 2;

/** The base design resolution (iPad / scale 1); s() scales these up for Desktop. */
export const BASE_WIDTH = 960;
export const BASE_HEIGHT = 540;

let scaleFactor = 1; // 1 = iPad (base), 2 = Desktop

export function scaleFactorFor(resolution: ResolutionTier): number {
  return resolution === 'desktop' ? DESKTOP_SCALE : 1;
}

export function setScaleFactor(value: number): void {
  scaleFactor = value;
}

export function getScaleFactor(): number {
  return scaleFactor;
}

/**
 * Scale a base (iPad) pixel value to the current factor, rounded to a whole pixel.
 * EVERY pixel number going into Phaser or a layout calculation must pass through here.
 */
export function s(n: number): number {
  return Math.round(n * scaleFactor);
}

/** Neutral (Phaser-free) scale mode the renderer applies for a viewport mode. */
export function viewportScaleMode(viewport: ViewportMode): 'fit' | 'none' {
  return viewport === 'actual' ? 'none' : 'fit';
}

export function serializeDisplaySettings(settings: DisplaySettings): string {
  return JSON.stringify({ viewport: settings.viewport, resolution: settings.resolution });
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
