/**
 * TEMPORARY logical-key → file-path aliases for local asset experimentation.
 *
 * The registry's default convention is one flat file per key at `assets/<key>.png`
 * (ADR-004: code references keys, never paths). An alias overrides that path for a key,
 * pointing it at an ARBITRARY file within the assets root — so art dumped under
 * assets/pending.local can be wired to a key WITHOUT renaming the files first.
 *
 * Raw asset paths live only here and in ./enemyRoster (the imported enemy art): the slime1
 * entries below are explicit; the bulk are contributed by ENEMY_ROSTER (one <name>.idle /
 * .walk / .attack alias per enemy). Removable wholesale once the art is finalized and files
 * are renamed to the convention: delete this module + ./enemyRoster, drop the aliasedPath
 * call + import in registry.ts, and every key reverts to its default path.
 *
 * Phaser-free (ADR-002): plain string constants only. Paths are relative to the assets root
 * (Vite publicDir 'assets'); no leading slash.
 */
import { AssetKeys } from './keys';
import { ENEMY_ROSTER } from './enemyRoster';

/** Each roster enemy contributes <name>.idle / <name>.walk / <name>.attack -> its pending.local file. */
const ROSTER_ALIASES: Record<string, string> = Object.fromEntries(
  ENEMY_ROSTER.flatMap((enemy) => [
    [`${enemy.name}.idle`, enemy.idle.file],
    [`${enemy.name}.walk`, enemy.walk.file],
    [`${enemy.name}.attack`, enemy.attack.file],
  ]),
);

export const ASSET_PATH_ALIASES: Record<string, string> = {
  [AssetKeys.slime1Idle]: 'pending.local/Tiled_files/Slime1_Idle_body.png',
  [AssetKeys.slime1Attack]: 'pending.local/Tiled_files/Slime1_Attack_body.png',
  ...ROSTER_ALIASES,
};

/** The file path for a key: its alias if one is registered, else the default `assets/<key>.png`. */
export function aliasedPath(key: string): string {
  const alias = ASSET_PATH_ALIASES[key];
  return alias ? `assets/${alias}` : `assets/${key}.png`;
}
