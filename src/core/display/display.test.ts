import { describe, it, expect } from 'vitest';
import {
  s,
  setScaleFactor,
  getScaleFactor,
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
  it('s(n) multiplies by the current factor (rounded); getScaleFactor reflects it', () => {
    setScaleFactor(1);
    expect(getScaleFactor()).toBe(1);
    expect(s(10)).toBe(10);
    expect(s(0)).toBe(0);

    setScaleFactor(2);
    expect(getScaleFactor()).toBe(2);
    expect(s(10)).toBe(20);
    expect(s(33)).toBe(66);
    expect(s(BASE_WIDTH)).toBe(1920);
    expect(s(BASE_HEIGHT)).toBe(1080);

    setScaleFactor(1); // reset so the shared module state stays at the default
  });

  it('scaleFactorFor maps the resolution to a factor', () => {
    expect(scaleFactorFor('ipad')).toBe(1);
    expect(scaleFactorFor('desktop')).toBe(2);
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
