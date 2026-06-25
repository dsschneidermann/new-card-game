import { describe, it, expect } from 'vitest';
import {
  AssetManifest,
  assetScale,
  spriteOffset,
  frameConfig,
  GAME_ASSETS,
  manifest,
  USED_ASSET_KEYS,
  type AssetDescriptor,
} from '@core/index';

const desc = (key: string, sprite?: { frameCount: number }): AssetDescriptor => ({
  key,
  path: `assets/${key}.png`,
  size: [16, 16],
  style: 's',
  description: 'd',
  ...(sprite ? { sprite } : {}),
});

describe('AssetManifest.resolve', () => {
  it('returns the real source when a real file is registered', () => {
    const m = new AssetManifest([desc('a')], new Set(['a']));
    expect(m.resolve('a')?.kind).toBe('real');
  });

  it('returns the placeholder descriptor when no real file exists', () => {
    const entry = new AssetManifest([desc('a')]).resolve('a');
    expect(entry?.kind).toBe('placeholder');
    expect(entry?.descriptor.key).toBe('a');
  });
});

describe('AssetManifest.validate', () => {
  const m = new AssetManifest([desc('a'), desc('b')]);

  it('reports a used-but-unregistered key as missing', () => {
    expect(m.validate(['a', 'zzz']).missing).toEqual(['zzz']);
  });

  it('reports a registered-but-unused key as unused', () => {
    expect(m.validate(['a']).unused).toEqual(['b']);
  });

  it('is empty for a fully consistent manifest', () => {
    expect(m.validate(['a', 'b'])).toEqual({ missing: [], unused: [] });
  });

  it('reports a gap (used key with no source) as missing', () => {
    expect(m.validate(['ghost']).missing).toContain('ghost');
  });
});

describe('frameConfig', () => {
  it('takes frameCount from the sprite options and the frame size from size', () => {
    expect(frameConfig(desc('s', { frameCount: 4 }))).toEqual({
      frameWidth: 16,
      frameHeight: 16,
      frameCount: 4,
    });
  });

  it('falls back to a single frame at the descriptor size', () => {
    expect(frameConfig(desc('a'))).toEqual({ frameWidth: 16, frameHeight: 16, frameCount: 1 });
  });
});

// The base re-base (Desktop = scale 1.0, iPad = 0.5x) is absorbed into the DISPLAY scale, not into
// size (which stays pinned to the source frame for slicing/generation): assetScale and the sprite
// nudge each carry the constant x2 so on-screen sizes stay pixel-identical at both tiers.
describe('assetScale (x2 for the Desktop re-base)', () => {
  it('doubles the declared display scale: a 0.5-scale asset renders at its native frame size', () => {
    const half: AssetDescriptor = { key: 'h', path: 'assets/h.png', size: [195, 284, 0.5], style: 's', description: 'd' };
    expect(assetScale(half)).toBe(1);
  });

  it('defaults a scale-less descriptor to 2 (native frame at the Desktop base)', () => {
    expect(assetScale(desc('a'))).toBe(2);
  });
});

describe('spriteOffset (x2 for the Desktop re-base)', () => {
  it('doubles the declared forward/down nudge (a base-px offset) for the Desktop re-base', () => {
    const nudged: AssetDescriptor = {
      key: 'n',
      path: 'assets/n.png',
      size: [128, 128],
      sprite: { frameCount: 6, forwardPx: 5, downPx: 3 },
      style: 's',
      description: 'd',
    };
    expect(spriteOffset(nudged)).toEqual({ forwardPx: 10, downPx: 6 });
  });

  it('defaults to no nudge when the sheet declares none', () => {
    expect(spriteOffset(desc('a'))).toEqual({ forwardPx: 0, downPx: 0 });
  });
});

describe('the game manifest', () => {
  it('has unique keys', () => {
    const keys = GAME_ASSETS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every descriptor has positive size and an in-range origin if present', () => {
    for (const d of GAME_ASSETS) {
      expect(d.size[0]).toBeGreaterThan(0);
      expect(d.size[1]).toBeGreaterThan(0);
      if (d.origin) {
        expect(d.origin[0]).toBeGreaterThanOrEqual(0);
        expect(d.origin[0]).toBeLessThanOrEqual(1);
        expect(d.origin[1]).toBeGreaterThanOrEqual(0);
        expect(d.origin[1]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('every key the code uses resolves to a source', () => {
    for (const k of USED_ASSET_KEYS) expect(manifest.resolve(k)).toBeDefined();
    expect(manifest.validate(USED_ASSET_KEYS).missing).toEqual([]);
  });
});
