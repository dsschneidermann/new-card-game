import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Core-purity guard (ADR-002 boundary, enforced per the Scaffolding decisions).
 *
 * Fails if any non-test file under src/core imports `phaser` or references a
 * DOM global. This keeps the boundary enforced inside the unit suite with no
 * lint tooling — ESLint/Prettier are deferred.
 */
const coreDir = dirname(fileURLToPath(import.meta.url));

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

const PHASER_IMPORT =
  /\bfrom\s+['"]phaser['"]|\brequire\(\s*['"]phaser['"]\s*\)|\bimport\(\s*['"]phaser['"]\s*\)/;
const DOM_GLOBAL = /\b(document|window|localStorage|navigator|HTMLElement)\b/;

const files = collectSourceFiles(coreDir);

describe('core purity (src/core must not depend on Phaser or the DOM)', () => {
  it('finds core source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s does not import phaser', (file) => {
    expect(PHASER_IMPORT.test(readFileSync(file, 'utf8'))).toBe(false);
  });

  it.each(files)('%s does not reference DOM globals', (file) => {
    expect(DOM_GLOBAL.test(readFileSync(file, 'utf8'))).toBe(false);
  });
});
