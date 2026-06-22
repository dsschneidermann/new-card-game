/**
 * TEMPORARY logical-key → file-path aliases for local asset experimentation.
 *
 * The registry's default convention is one flat file per key at `assets/<key>.png`
 * (ADR-004: code references keys, never paths). This map overrides that path for a
 * key, pointing it at an ARBITRARY file within the assets root — so art dumped under
 * assets/pending.local can be wired to a key WITHOUT renaming the files first.
 *
 * Kept in its own module (the only place raw asset file paths live) rather than inlined
 * in the registry, so it can be removed wholesale once enemies are finalized and their
 * files are renamed to the `assets/<key>.png` convention: delete this file, drop the
 * `aliasedPath` call + import in registry.ts, and every key reverts to its default path.
 *
 * Phaser-free (ADR-002): plain string constants only. Paths are relative to the assets
 * root (Vite publicDir 'assets'); no leading slash.
 */
import { AssetKeys } from './keys';
import type { AssetKey } from './keys';

export const ASSET_PATH_ALIASES: Partial<Record<AssetKey, string>> = {
  [AssetKeys.slime1Idle]: 'pending.local/Tiled_files/Slime1_Idle_body.png',
  [AssetKeys.slime1Attack]: 'pending.local/Tiled_files/Slime1_Attack_body.png',
};

/** The file path for a key: its alias if one is registered, else the default `assets/<key>.png`. */
export function aliasedPath(key: string): string {
  const alias = ASSET_PATH_ALIASES[key as AssetKey];
  return alias ? `assets/${alias}` : `assets/${key}.png`;
}
