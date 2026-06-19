import { describe, it, expect } from 'vitest';
import { facingFromDelta, manifest, validateManifest, USED_ASSET_KEYS } from '@core/index';

describe('facingFromDelta', () => {
  it('horizontal-dominant hops face the sign of dx, regardless of previous facing', () => {
    expect(facingFromDelta('right', -32, 0)).toBe('left'); // E/W hop, dx<0
    expect(facingFromDelta('left', 32, 0)).toBe('right'); // E/W hop, dx>0
    expect(facingFromDelta('right', 32, 0)).toBe('right');
  });

  it('more-vertical or equal hops keep the previous facing', () => {
    expect(facingFromDelta('right', 16, -18)).toBe('right'); // diagonal: |dx|<|dy|
    expect(facingFromDelta('left', -16, 18)).toBe('left'); // diagonal
    expect(facingFromDelta('left', 10, 10)).toBe('left'); // |dx|==|dy| tie keeps
    expect(facingFromDelta('right', 0, -18)).toBe('right'); // pure vertical
  });
});

describe('player spritesheets in the manifest', () => {
  it('player.idle and player.walk are 128px right-facing real sheets with the right frame counts', () => {
    const idle = manifest.resolve('player.idle');
    expect(idle?.kind).toBe('real');
    expect(idle?.descriptor.frames).toEqual({ frameWidth: 128, frameHeight: 128, count: 6 });

    const walk = manifest.resolve('player.walk');
    expect(walk?.kind).toBe('real');
    expect(walk?.descriptor.frames).toEqual({ frameWidth: 128, frameHeight: 128, count: 8 });
  });

  it('both player keys are used and registered (not missing, not unused)', () => {
    const report = validateManifest(USED_ASSET_KEYS);
    for (const key of ['player.idle', 'player.walk']) {
      expect(report.missing).not.toContain(key);
      expect(report.unused).not.toContain(key);
    }
  });
});
