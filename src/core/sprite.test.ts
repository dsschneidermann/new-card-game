import { describe, it, expect } from 'vitest';
import { facingFromIntent, manifest, validateManifest, frameConfig, USED_ASSET_KEYS } from '@core/index';

describe('facingFromIntent', () => {
  it('faces the sign of the horizontal move intent', () => {
    expect(facingFromIntent('right', -128)).toBe('left'); // target to the left
    expect(facingFromIntent('left', 96)).toBe('right'); // target to the right
  });

  it('keeps the previous facing when there is no horizontal intent (directly above/below)', () => {
    expect(facingFromIntent('left', 0)).toBe('left');
    expect(facingFromIntent('right', 0)).toBe('right');
  });
});

describe('player spritesheets in the manifest', () => {
  it('player.idle and player.walk are 128px right-facing real sheets with the right frame counts', () => {
    const idle = manifest.resolve('player.idle');
    expect(idle?.kind).toBe('real');
    // frameConfig derives frame size from `size` and frameCount from the sprite options.
    expect(frameConfig(idle!.descriptor)).toEqual({ frameWidth: 128, frameHeight: 128, frameCount: 6 });

    const walk = manifest.resolve('player.walk');
    expect(walk?.kind).toBe('real');
    expect(frameConfig(walk!.descriptor)).toEqual({ frameWidth: 128, frameHeight: 128, frameCount: 8 });
  });

  it('both player keys are used and registered (not missing, not unused)', () => {
    const report = validateManifest(USED_ASSET_KEYS);
    for (const key of ['player.idle', 'player.walk']) {
      expect(report.missing).not.toContain(key);
      expect(report.unused).not.toContain(key);
    }
  });
});

describe('slime spritesheets in the manifest', () => {
  it('slime.idle/walk/attack are real 64px sheets with the detected first-row frame counts', () => {
    const expectSheet = (key: string, frameCount: number): void => {
      const entry = manifest.resolve(key);
      expect(entry?.kind).toBe('real');
      expect(frameConfig(entry!.descriptor)).toEqual({ frameWidth: 64, frameHeight: 64, frameCount });
    };
    expectSheet('slime.idle', 6);
    expectSheet('slime.walk', 8);
    expectSheet('slime.attack', 10);
  });

  it('all slime keys are used + registered (not missing)', () => {
    const report = validateManifest(USED_ASSET_KEYS);
    for (const key of ['slime.idle', 'slime.walk', 'slime.attack']) {
      expect(report.missing).not.toContain(key);
    }
  });
});
