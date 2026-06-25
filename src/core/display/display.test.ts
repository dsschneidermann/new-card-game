import { describe, it, expect } from 'vitest';
import {
  s,
  setScaleFactor,
  scaleFactorFor,
  viewportScaleMode,
  parseDisplaySettings,
  serializeDisplaySettings,
  DEFAULT_DISPLAY_SETTINGS,
  BASE_WIDTH,
  BASE_HEIGHT,
  type DisplaySettings,
} from '@core/index';

describe('scale helper', () => {
  it('s(n) multiplies by the current factor (rounded)', () => {
    setScaleFactor(1); // Desktop (base): every pixel literal renders 1:1
    expect(s(10)).toBe(10);
    expect(s(0)).toBe(0);
    expect(s(BASE_WIDTH)).toBe(1920);
    expect(s(BASE_HEIGHT)).toBe(1080);

    setScaleFactor(0.5); // iPad: half the base, rounded to a whole pixel
    expect(s(10)).toBe(5);
    expect(s(BASE_WIDTH)).toBe(960);
    expect(s(BASE_HEIGHT)).toBe(540);
    expect(s(15)).toBe(8); // an odd base value rounds to the nearest pixel (7.5 -> 8)

    setScaleFactor(1); // reset so the shared module state stays at the default
  });

  it('scaleFactorFor maps the resolution to a factor', () => {
    expect(scaleFactorFor('desktop')).toBe(1);
    expect(scaleFactorFor('ipad')).toBe(0.5);
  });

  it('viewportScaleMode maps the viewport to the renderer mode', () => {
    expect(viewportScaleMode('fit')).toBe('fit');
    expect(viewportScaleMode('actual')).toBe('none');
  });
});

describe('display settings persistence', () => {
  it('round-trips a valid settings through serialize/parse', () => {
    const v: DisplaySettings = { viewport: 'actual', resolution: 'desktop' };
    expect(parseDisplaySettings(serializeDisplaySettings(v))).toEqual(v);
  });

  it('is total: null / malformed / out-of-range fall back to the default', () => {
    expect(parseDisplaySettings(null)).toEqual(DEFAULT_DISPLAY_SETTINGS);
    expect(parseDisplaySettings('nope{')).toEqual(DEFAULT_DISPLAY_SETTINGS);
    expect(parseDisplaySettings('42')).toEqual(DEFAULT_DISPLAY_SETTINGS);
    expect(parseDisplaySettings('{"viewport":"x","resolution":"y"}')).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });
});
