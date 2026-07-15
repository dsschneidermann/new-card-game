import { describe, it, expect } from 'vitest';
import { frameSequenceUrls, frameSequenceTextureKey } from './manifest';
import { GAME_ASSETS, resolveKey, validateManifest, USED_ASSET_KEYS, AssetKeys } from './registry';
import { spellDef, cardDef } from '../cards';

const blizzardEffect = GAME_ASSETS.find((d) => d.key === AssetKeys.spellEffectBlizzard)!;

describe('frameSequenceUrls', () => {
  it('lists <key>NN.png for a file-per-frame descriptor: 1-based, zero-padded to 2, in order', () => {
    const urls = frameSequenceUrls(blizzardEffect);
    expect(urls).toHaveLength(17);
    expect(urls[0]).toBe('spell_effect_blizzard01.png');
    expect(urls[8]).toBe('spell_effect_blizzard09.png');
    expect(urls[16]).toBe('spell_effect_blizzard17.png');
  });

  it('is empty for a non-file-per-frame descriptor (spritesheet animation or static image)', () => {
    const spritesheetAnim = GAME_ASSETS.find((d) => d.key === AssetKeys.playerIdle)!; // frameCount+fps, no filePerFrame
    const staticImage = GAME_ASSETS.find((d) => d.key === AssetKeys.spellArtBlizzard)!; // single image
    expect(frameSequenceUrls(spritesheetAnim)).toEqual([]);
    expect(frameSequenceUrls(staticImage)).toEqual([]);
  });
});

describe('frameSequenceTextureKey', () => {
  it('is `${key}.f${i}`', () => {
    expect(frameSequenceTextureKey('spell_effect_blizzard', 0)).toBe('spell_effect_blizzard.f0');
    expect(frameSequenceTextureKey('spell_effect_blizzard', 16)).toBe('spell_effect_blizzard.f16');
  });
});

describe('blizzard cast-effect descriptor', () => {
  it('is a REAL file-per-frame animation of 17 frames with an fps (built as <key>.right)', () => {
    const entry = resolveKey(AssetKeys.spellEffectBlizzard);
    expect(entry?.kind).toBe('real');
    expect(entry?.descriptor.sprite?.filePerFrame).toBe(true);
    expect(entry?.descriptor.sprite?.frameCount).toBe(17);
    expect(entry?.descriptor.sprite?.fps).toBeGreaterThan(0);
  });

  it('has an animation marker (fps) and no idle/walk/ready suffix, so it plays once (animRepeat 0)', () => {
    expect(blizzardEffect.sprite?.fps).toBeDefined();
    expect(/(idle|walk|ready)$/.test(blizzardEffect.key)).toBe(false);
  });
});

describe('manifest validation with the effect key', () => {
  it('registers and uses spell_effect_blizzard (no missing, no unused)', () => {
    const report = validateManifest(USED_ASSET_KEYS);
    expect(report.missing).toEqual([]);
    expect(report.unused).toEqual([]);
  });
});

describe('cast-effect association (effectArt)', () => {
  it('the blizzard spell names its cast effect; effect-less defs have none', () => {
    expect(spellDef('blizzard')?.effectArt).toBe(AssetKeys.spellEffectBlizzard);
    expect(spellDef('teleport')?.effectArt).toBeUndefined();
    expect(cardDef('defend')?.effectArt).toBeUndefined();
  });
});
