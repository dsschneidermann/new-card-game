import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_PATH_ALIASES, aliasedPath } from '@core/index';

/**
 * Asset-path aliases point logical keys at arbitrary files within the assets root (so dropped-in
 * art can be wired to a key without renaming). Those files live under assets/pending.local, which
 * is gitignored — local-only. This guard reads the disk with node:fs and fails LOUDLY at test time
 * if an aliased file is missing or moved, rather than letting it silently degrade to a generated
 * placeholder at runtime. (A clean checkout without the local art would fail this; the project is
 * solo/local with no CI, so that tradeoff is acceptable and intended.)
 */
// This test sits at src/core/assets/; the repo root (Vite publicDir 'assets' lives directly under it) is three levels up.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const aliasEntries = Object.entries(ASSET_PATH_ALIASES);

describe('asset path aliases', () => {
  it('registers at least one alias to verify', () => {
    expect(aliasEntries.length).toBeGreaterThan(0);
  });

  it.each(aliasEntries)('%s → assets/%s is present on disk', (_key, relativePath) => {
    expect(existsSync(join(repoRoot, 'assets', String(relativePath)))).toBe(true);
  });

  it('aliasedPath overrides the default only for aliased keys', () => {
    // A roster-aliased key resolves to its arbitrary file...
    expect(aliasedPath('slime1.idle')).toBe('assets/pending.local/Tiled_files/Slime1_Idle_without_shadow.png');
    // ...while a non-aliased key keeps the flat assets/<key>.png convention.
    expect(aliasedPath('player.idle')).toBe('assets/player.idle.png');
  });
});
