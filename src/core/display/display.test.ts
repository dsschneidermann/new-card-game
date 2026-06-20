import { describe, it, expect } from 'vitest';
import {
  planScale,
  parseDisplaySettings,
  serializeDisplaySettings,
  DEFAULT_DISPLAY_SETTINGS,
  type DisplaySettings,
} from '@core/index';

describe('planScale', () => {
  it('maps the default (fit/ipad) to FIT + zoom 1', () => {
    expect(planScale({ viewport: 'fit', resolution: 'ipad' })).toEqual({ mode: 'fit', zoom: 1 });
  });

  it('maps actual/desktop to NONE + zoom 2 (crisp true-size desktop)', () => {
    expect(planScale({ viewport: 'actual', resolution: 'desktop' })).toEqual({ mode: 'none', zoom: 2 });
  });

  it('treats the two axes independently', () => {
    expect(planScale({ viewport: 'fit', resolution: 'desktop' })).toEqual({ mode: 'fit', zoom: 2 });
    expect(planScale({ viewport: 'actual', resolution: 'ipad' })).toEqual({ mode: 'none', zoom: 1 });
  });
});

describe('display settings persistence', () => {
  it('round-trips a valid settings through serialize/parse', () => {
    const s: DisplaySettings = { viewport: 'actual', resolution: 'desktop' };
    expect(parseDisplaySettings(serializeDisplaySettings(s))).toEqual(s);
  });

  it('is total: null / malformed / out-of-range all fall back to the default', () => {
    expect(parseDisplaySettings(null)).toEqual(DEFAULT_DISPLAY_SETTINGS);
    expect(parseDisplaySettings('not json{')).toEqual(DEFAULT_DISPLAY_SETTINGS);
    expect(parseDisplaySettings('42')).toEqual(DEFAULT_DISPLAY_SETTINGS);
    expect(parseDisplaySettings('{"viewport":"x","resolution":"y"}')).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });
});
