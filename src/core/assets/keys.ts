/**
 * The canonical logical asset keys the game code references — the single source
 * of truth so the registry's GAME_ASSETS / REAL_ASSET_KEYS / USED_ASSET_KEYS
 * reference these constants instead of repeating the literal strings. Phaser-free
 * (ADR-002): plain string constants only.
 *
 * Only keys the code actually references live here (USED_ASSET_KEYS derives from
 * them); descriptors seeded ahead of use (enemy/resource/status art) stay as plain
 * keys in the registry until code references them.
 */
export const AssetKeys = {
  brandLogo: 'brand.logo',
  uiMenuBackground: 'ui.menuBackground',
  uiButton: 'ui.button',
  uiPanel: 'ui.panel',
  world1Floor: 'world1.tile.floor',
  world1Wall: 'world1.tile.wall',
  playerIdle: 'player.idle',
  playerWalk: 'player.walk',
  playerReady: 'player.ready',
  playerAttack1: 'player.attack1',
  playerAttack2: 'player.attack2',
  slimeIdle: 'slime.idle',
  slimeWalk: 'slime.walk',
  slimeAttack: 'slime.attack',
  slime1Idle: 'slime1.idle',
  slime1Attack: 'slime1.attack',
} as const;

/** Union of the canonical logical asset keys. */
export type AssetKey = (typeof AssetKeys)[keyof typeof AssetKeys];
