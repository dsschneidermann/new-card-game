/**
 * Pure asset manifest, key resolution, and validation (feature 03).
 * Phaser-free (ADR-002): only the PlaceholderFactory and PreloadScene touch
 * Phaser. Assets are referenced by logical key, never raw paths (ADR-004).
 */

export interface AssetDescriptor {
  /** Logical key, e.g. 'enemy.melee.idle' (never a raw path). */
  key: string;
  /** Real-file location: flat dotted filename, assets/<key>.png. */
  path: string;
  size: [number, number];
  origin?: [number, number];
  frames?: { frameWidth: number; frameHeight: number; count: number };
  style: string;
  description: string;
}

export type ManifestEntry =
  | { kind: 'real'; descriptor: AssetDescriptor }
  | { kind: 'placeholder'; descriptor: AssetDescriptor };

export interface ValidationReport {
  /** Keys used in code but not registered in the manifest. */
  missing: string[];
  /** Keys registered but never referenced by code. */
  unused: string[];
}

/** Frame layout for a descriptor: its declared frames, or a single implicit frame. */
export function frameConfig(d: AssetDescriptor): { frameWidth: number; frameHeight: number; count: number } {
  return d.frames ?? { frameWidth: d.size[0], frameHeight: d.size[1], count: 1 };
}

/**
 * A keyed registry of asset descriptors. Each key resolves to a 'real' entry
 * when a real file is registered for it, otherwise a 'placeholder' entry.
 */
export class AssetManifest {
  private readonly entries = new Map<string, ManifestEntry>();

  constructor(descriptors: readonly AssetDescriptor[], realKeys: ReadonlySet<string> = new Set()) {
    for (const descriptor of descriptors) {
      this.entries.set(descriptor.key, {
        kind: realKeys.has(descriptor.key) ? 'real' : 'placeholder',
        descriptor,
      });
    }
  }

  /** The entry for a key, or undefined if the key is not registered (a gap). */
  resolve(key: string): ManifestEntry | undefined {
    return this.entries.get(key);
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }

  validate(usedKeys: readonly string[]): ValidationReport {
    const registered = new Set(this.entries.keys());
    const used = new Set(usedKeys);
    return {
      missing: [...used].filter((k) => !registered.has(k)),
      unused: [...registered].filter((k) => !used.has(k)),
    };
  }
}
