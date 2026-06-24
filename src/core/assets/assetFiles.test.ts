import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_ASSETS, REAL_ASSET_KEYS } from './registry';

/**
 * Real art lives at assets/<key>.png (the flat ADR-004 convention). Every key flagged real must have
 * its file on disk; this guard reads the disk with node:fs and fails LOUDLY here rather than letting a
 * missing file silently degrade to a generated placeholder at runtime. (A clean checkout without the
 * local art would fail this; the project is solo/local with no CI, so that tradeoff is intended.)
 */
// This test sits at src/core/assets/; the repo root (Vite publicDir 'assets' lives directly under it) is three levels up.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
// descriptor.path is the root-relative RUNTIME URL (<key>.png); on disk the file lives under the Vite
// publicDir 'assets/' (served at the site root), so map URL -> disk by re-prepending the publicDir.
const PUBLIC_DIR = 'assets';

describe('real asset files', () => {
  it('every key flagged real has its file on disk at assets/<key>.png', () => {
    // One assertion over all real descriptors (not it.each) to keep the test count flat; a failure
    // lists exactly which keys are missing their file.
    const missing = GAME_ASSETS.filter((descriptor) => REAL_ASSET_KEYS.has(descriptor.key))
      .filter((descriptor) => !existsSync(join(repoRoot, PUBLIC_DIR, descriptor.path)))
      .map((descriptor) => `${descriptor.key} -> ${PUBLIC_DIR}/${descriptor.path}`);
    expect(missing).toEqual([]);
  });

  it('enemy idle/walk/attack are animated; hurt/death are static (seeded, not yet animated)', () => {
    const animatedButStatic = GAME_ASSETS.filter((d) => /\.(idle|walk|attack)$/.test(d.key))
      .filter((d) => d.sprite?.fps === undefined)
      .map((d) => d.key);
    const staticButAnimated = GAME_ASSETS.filter((d) => /\.(hurt|death)$/.test(d.key))
      .filter((d) => d.sprite !== undefined)
      .map((d) => d.key);
    expect({ animatedButStatic, staticButAnimated }).toEqual({ animatedButStatic: [], staticButAnimated: [] });
  });
});
