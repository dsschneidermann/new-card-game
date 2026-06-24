import { AssetManifest, type AssetDescriptor, type ManifestEntry, type ValidationReport } from './manifest';
import { AssetKeys } from './keys';
import type { AssetKey } from './keys';

type SpriteOptions = {
  frameCount: number;
  fps?: number; // animation frame rate; its PRESENCE marks the descriptor as an animation (built as <key>.right)
  forwardPx?: number; // draw-origin nudge: px in the facing direction (off-centre art)
  downPx?: number; // draw-origin nudge: px downward
  frameOffsetY?: number; // Y (source px) of the first animation row in a multi-row sheet; 0 = top
};

const asset = (
  key: string,
  size: [number, number, number?],
  style: string,
  description: string,
  sprite?: SpriteOptions,
): AssetDescriptor => ({
  key,
  // Flat dotted filename convention (ADR-004): one file per key at assets/<key>.png.
  path: `assets/${key}.png`,
  size,
  ...(sprite ? { sprite } : {}),
  style,
  description,
});

/**
 * The asset descriptors known to the build, mirroring the Asset Placeholders plan (ADR-004). Real
 * art drops in per key as it is produced (flagged in REAL_ASSET_KEYS); any key not yet supplied
 * renders as a generated placeholder. Brand/ui/world are placeholders; player + every enemy
 * animation are real. Enemy art is written out explicitly, one descriptor per animation:
 * idle/walk/attack carry sprite frames + fps (animated); hurt/death are static (seeded for future
 * use — no frame count, loaded but not yet animated). PreloadScene builds <key>.right for any
 * descriptor with sprite.fps; the Enemy.art spawn renders <art>.idle.
 */
export const GAME_ASSETS: readonly AssetDescriptor[] = [
  asset(AssetKeys.brandLogo, [256, 128], 'bold high-contrast wordmark', 'Game logo for boot/menu'),
  asset(AssetKeys.uiMenuBackground, [1280, 720], 'moody low-detail worldmap vista', 'Main menu backdrop'),
  asset(AssetKeys.uiButton, [200, 56], 'rounded slab + accent border', 'Generic UI button', { frameCount: 3 }),
  asset(AssetKeys.uiPanel, [64, 64], 'semi-transparent dark parchment', 'Dialog/HUD panel'),
  asset(AssetKeys.world1Floor, [32, 32], 'top-down stone/grass', 'Walkable floor tile'),
  asset(AssetKeys.world1Wall, [32, 32], 'solid rock, dark outline', 'Non-walkable obstacle'),
  asset(AssetKeys.playerIdle, [128, 128, 0.5], 'anime fox-girl, right-facing', 'Player idle', { frameCount: 6, fps: 6, downPx: -6 }),
  asset(AssetKeys.playerWalk, [128, 128, 0.5], 'same character, right-facing', 'Player walk', { frameCount: 8, fps: 10, downPx: -6 }),
  asset(AssetKeys.playerReady, [128, 128, 0.5], 'same character, card-ready stance, right-facing', 'Player ready/card stance', { frameCount: 2, fps: 6, downPx: -6, forwardPx: 8 }),
  asset(AssetKeys.playerAttack1, [128, 128, 0.5], 'same character, attack A, right-facing', 'Player attack variant 1', { frameCount: 3, fps: 8, downPx: -6, forwardPx: 8 }),
  asset(AssetKeys.playerAttack2, [128, 128, 0.5], 'same character, attack B, right-facing', 'Player attack variant 2', { frameCount: 7, fps: 12, downPx: -6 }),
  asset(AssetKeys.playerDeath, [128, 128, 0.5], 'same character, death, right-facing', 'Player death'),

  // --- Card UI: static face backgrounds by class ---
  asset(AssetKeys.cardAttack, [195, 284, 0.5], 'attack-card frame + background', 'Card face background (attack class)'),
  asset(AssetKeys.cardSkill, [195, 284, 0.5], 'skill-card frame + background', 'Card face background (skill class)'),

  // --- Card art (per card type), shown behind the face. Static, scale 0.5; placeholders until art drops in ---
  asset(AssetKeys.cardArtMelee, [256, 256, 0.35], 'card art (melee)', 'Card art: melee'),
  asset(AssetKeys.cardArtLongstrike, [256, 256, 0.35], 'card art (longstrike)', 'Card art: longstrike'),
  asset(AssetKeys.cardArtRangedshot, [256, 256, 0.35], 'card art (rangedshot)', 'Card art: rangedshot'),
  asset(AssetKeys.cardArtDefend, [256, 256, 0.35], 'card art (defend)', 'Card art: defend'),
  asset(AssetKeys.cardArtJump, [256, 256, 0.35], 'card art (jump)', 'Card art: jump'),
  asset(AssetKeys.cardArtQuickdraw, [256, 256, 0.35], 'card art (quickdraw)', 'Card art: quickdraw'),
  asset(AssetKeys.cardArtSharpen, [256, 256, 0.35], 'card art (sharpen)', 'Card art: sharpen'),
  asset(AssetKeys.cardArtWhirlwind, [256, 256, 0.35], 'card art (whirlwind)', 'Card art: whirlwind'),
  asset(AssetKeys.cardArtRecall, [256, 256, 0.35], 'card art (recall)', 'Card art: recall'),

  // --- Spell sidebar art (per spell), shown as the icon inside each spell ring. Static, scale fills the ~60px ring ---
  asset(AssetKeys.spellArtBlizzard, [128, 128, 0.46], 'spell art (blizzard)', 'Spell art: blizzard'),
  asset(AssetKeys.spellArtSelfheal, [128, 128, 0.46], 'spell art (self heal)', 'Spell art: self heal'),
  asset(AssetKeys.spellArtTeleport, [128, 128, 0.46], 'spell art (teleport)', 'Spell art: teleport'),

  // --- Ground terrain: the Ground_grass tileset as a 16x16 frame-indexed spritesheet (frameCount, NO
  //     fps = static frame states, not an animation). The square terrain background reads fill frames from it. ---
  asset(AssetKeys.terrainGroundGrass, [16, 16], 'ground + grass terrain fill tiles', 'Terrain: ground/grass tileset', { frameCount: 651 }),

  // --- Enemy roster: one descriptor per animation (idle/walk/attack animated; hurt/death static) ---
  // slime1
  asset(AssetKeys.slime1Idle, [64, 64, 0.5], 'slime1 idle', 'Enemy slime1 idle', { frameCount: 6, fps: 6, frameOffsetY: 192, downPx: 10 }),
  asset(AssetKeys.slime1Walk, [64, 64, 0.5], 'slime1 walk', 'Enemy slime1 walk', { frameCount: 8, fps: 10, frameOffsetY: 192, downPx: 10 }),
  asset(AssetKeys.slime1Attack, [64, 64, 0.5], 'slime1 attack', 'Enemy slime1 attack', { frameCount: 10, fps: 12, frameOffsetY: 192, downPx: 10 }),
  asset(AssetKeys.slime1Hurt, [64, 64, 0.5], 'slime1 hurt', 'Enemy slime1 hurt'),
  asset(AssetKeys.slime1Death, [64, 64, 0.5], 'slime1 death', 'Enemy slime1 death'),

  // slime2
  asset(AssetKeys.slime2Idle, [64, 64, 0.5], 'slime2 idle', 'Enemy slime2 idle', { frameCount: 6, fps: 6, frameOffsetY: 192, downPx: 10 }),
  asset(AssetKeys.slime2Walk, [64, 64, 0.5], 'slime2 walk', 'Enemy slime2 walk', { frameCount: 8, fps: 10, frameOffsetY: 192, downPx: 10 }),
  asset(AssetKeys.slime2Attack, [64, 64, 0.5], 'slime2 attack', 'Enemy slime2 attack', { frameCount: 11, fps: 12, frameOffsetY: 192, downPx: 10 }),
  asset(AssetKeys.slime2Hurt, [64, 64, 0.5], 'slime2 hurt', 'Enemy slime2 hurt'),
  asset(AssetKeys.slime2Death, [64, 64, 0.5], 'slime2 death', 'Enemy slime2 death'),

  // slime3
  asset(AssetKeys.slime3Idle, [64, 64, 0.5], 'slime3 idle', 'Enemy slime3 idle', { frameCount: 6, fps: 6, frameOffsetY: 192, downPx: 10 }),
  asset(AssetKeys.slime3Walk, [64, 64, 0.5], 'slime3 walk', 'Enemy slime3 walk', { frameCount: 8, fps: 10, frameOffsetY: 192, downPx: 10 }),
  asset(AssetKeys.slime3Attack, [64, 64, 0.5], 'slime3 attack', 'Enemy slime3 attack', { frameCount: 9, fps: 12, frameOffsetY: 192, downPx: 10 }),
  asset(AssetKeys.slime3Hurt, [64, 64, 0.5], 'slime3 hurt', 'Enemy slime3 hurt'),
  asset(AssetKeys.slime3Death, [64, 64, 0.5], 'slime3 death', 'Enemy slime3 death'),

  // copper_golem
  asset(AssetKeys.copperGolemIdle, [128, 128, 0.5], 'copper_golem idle', 'Enemy copper_golem idle', { frameCount: 6, fps: 6, downPx: -6, forwardPx: 4 }),
  asset(AssetKeys.copperGolemWalk, [128, 128, 0.5], 'copper_golem walk', 'Enemy copper_golem walk', { frameCount: 8, fps: 10, downPx: -6, forwardPx: 4 }),
  asset(AssetKeys.copperGolemAttack, [128, 128, 0.5], 'copper_golem attack', 'Enemy copper_golem attack', { frameCount: 7, fps: 10, downPx: -6, forwardPx: 4 }),
  asset(AssetKeys.copperGolemHurt, [128, 128, 0.5], 'copper_golem hurt', 'Enemy copper_golem hurt'),
  asset(AssetKeys.copperGolemDeath, [128, 128, 0.5], 'copper_golem death', 'Enemy copper_golem death'),

  // demon_2
  asset(AssetKeys.demon2Idle, [128, 128, 0.5], 'demon_2 idle', 'Enemy demon_2 idle', { frameCount: 6, fps: 6, downPx: -6 }),
  asset(AssetKeys.demon2Walk, [128, 128, 0.5], 'demon_2 walk', 'Enemy demon_2 walk', { frameCount: 12, fps: 10, downPx: -6 }),
  asset(AssetKeys.demon2Attack, [128, 128, 0.5], 'demon_2 attack', 'Enemy demon_2 attack', { frameCount: 5, fps: 8, downPx: -6 }),
  asset(AssetKeys.demon2Hurt, [128, 128, 0.5], 'demon_2 hurt', 'Enemy demon_2 hurt'),
  asset(AssetKeys.demon2Death, [128, 128, 0.5], 'demon_2 death', 'Enemy demon_2 death'),

  // demon_3
  asset(AssetKeys.demon3Idle, [128, 128, 0.5], 'demon_3 idle', 'Enemy demon_3 idle', { frameCount: 6, fps: 6, downPx: -6 }),
  asset(AssetKeys.demon3Walk, [128, 128, 0.5], 'demon_3 walk', 'Enemy demon_3 walk', { frameCount: 12, fps: 10, downPx: -6 }),
  asset(AssetKeys.demon3Attack, [128, 128, 0.5], 'demon_3 attack', 'Enemy demon_3 attack', { frameCount: 5, fps: 10, downPx: -6 }),
  asset(AssetKeys.demon3Hurt, [128, 128, 0.5], 'demon_3 hurt', 'Enemy demon_3 hurt'),
  asset(AssetKeys.demon3Death, [128, 128, 0.5], 'demon_3 death', 'Enemy demon_3 death'),

  // dragon_1
  asset(AssetKeys.dragon1Idle, [256, 256, 0.5], 'dragon_1 idle', 'Enemy dragon_1 idle', { frameCount: 7, fps: 6, downPx: -16 }),
  asset(AssetKeys.dragon1Walk, [256, 256, 0.5], 'dragon_1 walk', 'Enemy dragon_1 walk', { frameCount: 12, fps: 10, downPx: -16, forwardPx: 6 }),
  asset(AssetKeys.dragon1Attack, [256, 256, 0.5], 'dragon_1 attack', 'Enemy dragon_1 attack', { frameCount: 10, fps: 10, downPx: -16, forwardPx: 18 }),
  asset(AssetKeys.dragon1Hurt, [256, 256, 0.5], 'dragon_1 hurt', 'Enemy dragon_1 hurt'),
  asset(AssetKeys.dragon1Death, [256, 256, 0.5], 'dragon_1 death', 'Enemy dragon_1 death'),

  // dragon_2
  asset(AssetKeys.dragon2Idle, [256, 256, 0.5], 'dragon_2 idle', 'Enemy dragon_2 idle', { frameCount: 7, fps: 6, downPx: -16 }),
  asset(AssetKeys.dragon2Walk, [256, 256, 0.5], 'dragon_2 walk', 'Enemy dragon_2 walk', { frameCount: 12, fps: 10, downPx: -16, forwardPx: 6 }),
  asset(AssetKeys.dragon2Attack, [256, 256, 0.5], 'dragon_2 attack', 'Enemy dragon_2 attack', { frameCount: 10, fps: 10, downPx: -16, forwardPx: 18 }),
  asset(AssetKeys.dragon2Hurt, [256, 256, 0.5], 'dragon_2 hurt', 'Enemy dragon_2 hurt'),
  asset(AssetKeys.dragon2Death, [256, 256, 0.5], 'dragon_2 death', 'Enemy dragon_2 death'),

  // dragon_3
  asset(AssetKeys.dragon3Idle, [256, 256, 0.5], 'dragon_3 idle', 'Enemy dragon_3 idle', { frameCount: 7, fps: 6, downPx: -16 }),
  asset(AssetKeys.dragon3Walk, [256, 256, 0.5], 'dragon_3 walk', 'Enemy dragon_3 walk', { frameCount: 12, fps: 10, downPx: -16, forwardPx: 6 }),
  asset(AssetKeys.dragon3Attack, [256, 256, 0.5], 'dragon_3 attack', 'Enemy dragon_3 attack', { frameCount: 10, fps: 10, downPx: -16, forwardPx: 18 }),
  asset(AssetKeys.dragon3Hurt, [256, 256, 0.5], 'dragon_3 hurt', 'Enemy dragon_3 hurt'),
  asset(AssetKeys.dragon3Death, [256, 256, 0.5], 'dragon_3 death', 'Enemy dragon_3 death'),

  // elf_queen_1
  asset(AssetKeys.elfQueen1Idle, [128, 128, 0.5], 'elf_queen_1 idle', 'Enemy elf_queen_1 idle', { frameCount: 7, fps: 6, downPx: -6 }),
  asset(AssetKeys.elfQueen1Walk, [128, 128, 0.5], 'elf_queen_1 walk', 'Enemy elf_queen_1 walk', { frameCount: 12, fps: 10, downPx: -6 }),
  asset(AssetKeys.elfQueen1Attack, [128, 128, 0.5], 'elf_queen_1 attack', 'Enemy elf_queen_1 attack', { frameCount: 14, fps: 8, downPx: -6 }),
  asset(AssetKeys.elfQueen1Hurt, [128, 128, 0.5], 'elf_queen_1 hurt', 'Enemy elf_queen_1 hurt'),
  asset(AssetKeys.elfQueen1Death, [128, 128, 0.5], 'elf_queen_1 death', 'Enemy elf_queen_1 death'),

  // elf_queen_2
  asset(AssetKeys.elfQueen2Idle, [128, 128, 0.5], 'elf_queen_2 idle', 'Enemy elf_queen_2 idle', { frameCount: 6, fps: 6, downPx: -2 }),
  asset(AssetKeys.elfQueen2Walk, [128, 128, 0.5], 'elf_queen_2 walk', 'Enemy elf_queen_2 walk', { frameCount: 5, fps: 10, downPx: 0 }),
  asset(AssetKeys.elfQueen2Attack, [128, 128, 0.5], 'elf_queen_2 attack', 'Enemy elf_queen_2 attack', { frameCount: 6, fps: 10, downPx: -2, forwardPx: 4 }),
  asset(AssetKeys.elfQueen2Hurt, [128, 128, 0.5], 'elf_queen_2 hurt', 'Enemy elf_queen_2 hurt'),
  asset(AssetKeys.elfQueen2Death, [128, 128, 0.5], 'elf_queen_2 death', 'Enemy elf_queen_2 death'),

  // goblin_1
  asset(AssetKeys.goblin1Idle, [128, 128, 0.5], 'goblin_1 idle', 'Enemy goblin_1 idle', { frameCount: 6, fps: 6, downPx: -6 }),
  asset(AssetKeys.goblin1Walk, [128, 128, 0.5], 'goblin_1 walk', 'Enemy goblin_1 walk', { frameCount: 8, fps: 10, downPx: -6 }),
  asset(AssetKeys.goblin1Attack, [128, 128, 0.5], 'goblin_1 attack', 'Enemy goblin_1 attack', { frameCount: 6, fps: 10, downPx: -6, forwardPx: 4 }),
  asset(AssetKeys.goblin1Hurt, [128, 128, 0.5], 'goblin_1 hurt', 'Enemy goblin_1 hurt'),
  asset(AssetKeys.goblin1Death, [128, 128, 0.5], 'goblin_1 death', 'Enemy goblin_1 death'),

  // goblin_2
  asset(AssetKeys.goblin2Idle, [128, 128, 0.5], 'goblin_2 idle', 'Enemy goblin_2 idle', { frameCount: 6, fps: 6, downPx: -6 }),
  asset(AssetKeys.goblin2Walk, [128, 128, 0.5], 'goblin_2 walk', 'Enemy goblin_2 walk', { frameCount: 8, fps: 10, downPx: -6 }),
  asset(AssetKeys.goblin2Attack, [128, 128, 0.5], 'goblin_2 attack', 'Enemy goblin_2 attack', { frameCount: 7, fps: 10, downPx: -6, forwardPx: -4 }),
  asset(AssetKeys.goblin2Hurt, [128, 128, 0.5], 'goblin_2 hurt', 'Enemy goblin_2 hurt'),
  asset(AssetKeys.goblin2Death, [128, 128, 0.5], 'goblin_2 death', 'Enemy goblin_2 death'),

  // goblin_3
  asset(AssetKeys.goblin3Idle, [128, 128, 0.5], 'goblin_3 idle', 'Enemy goblin_3 idle', { frameCount: 6, fps: 6, downPx: -6 }),
  asset(AssetKeys.goblin3Walk, [128, 128, 0.5], 'goblin_3 walk', 'Enemy goblin_3 walk', { frameCount: 7, fps: 10, downPx: -6 }),
  asset(AssetKeys.goblin3Attack, [128, 128, 0.5], 'goblin_3 attack', 'Enemy goblin_3 attack', { frameCount: 6, fps: 10, downPx: -6 }),
  asset(AssetKeys.goblin3Hurt, [128, 128, 0.5], 'goblin_3 hurt', 'Enemy goblin_3 hurt'),
  asset(AssetKeys.goblin3Death, [128, 128, 0.5], 'goblin_3 death', 'Enemy goblin_3 death'),

  // gorgon_1
  asset(AssetKeys.gorgon1Idle, [128, 128, 0.5], 'gorgon_1 idle', 'Enemy gorgon_1 idle', { frameCount: 7, fps: 6, downPx: -6 }),
  asset(AssetKeys.gorgon1Walk, [128, 128, 0.5], 'gorgon_1 walk', 'Enemy gorgon_1 walk', { frameCount: 7, fps: 10, downPx: -6 }),
  asset(AssetKeys.gorgon1Attack, [128, 128, 0.5], 'gorgon_1 attack', 'Enemy gorgon_1 attack', { frameCount: 7, fps: 10, downPx: -6 }),
  asset(AssetKeys.gorgon1Hurt, [128, 128, 0.5], 'gorgon_1 hurt', 'Enemy gorgon_1 hurt'),
  asset(AssetKeys.gorgon1Death, [128, 128, 0.5], 'gorgon_1 death', 'Enemy gorgon_1 death'),

  // gorgon_2
  asset(AssetKeys.gorgon2Idle, [128, 128, 0.5], 'gorgon_2 idle', 'Enemy gorgon_2 idle', { frameCount: 7, fps: 6, downPx: -6 }),
  asset(AssetKeys.gorgon2Walk, [128, 128, 0.5], 'gorgon_2 walk', 'Enemy gorgon_2 walk', { frameCount: 7, fps: 10, downPx: -6 }),
  asset(AssetKeys.gorgon2Attack, [128, 128, 0.5], 'gorgon_2 attack', 'Enemy gorgon_2 attack', { frameCount: 7, fps: 10, downPx: -6 }),
  asset(AssetKeys.gorgon2Hurt, [128, 128, 0.5], 'gorgon_2 hurt', 'Enemy gorgon_2 hurt'),
  asset(AssetKeys.gorgon2Death, [128, 128, 0.5], 'gorgon_2 death', 'Enemy gorgon_2 death'),

  // gorgon_3
  asset(AssetKeys.gorgon3Idle, [128, 128, 0.5], 'gorgon_3 idle', 'Enemy gorgon_3 idle', { frameCount: 7, fps: 6, downPx: -6 }),
  asset(AssetKeys.gorgon3Walk, [128, 128, 0.5], 'gorgon_3 walk', 'Enemy gorgon_3 walk', { frameCount: 7, fps: 10, downPx: -6 }),
  asset(AssetKeys.gorgon3Attack, [128, 128, 0.5], 'gorgon_3 attack', 'Enemy gorgon_3 attack', { frameCount: 7, fps: 10, downPx: -6 }),
  asset(AssetKeys.gorgon3Hurt, [128, 128, 0.5], 'gorgon_3 hurt', 'Enemy gorgon_3 hurt'),
  asset(AssetKeys.gorgon3Death, [128, 128, 0.5], 'gorgon_3 death', 'Enemy gorgon_3 death'),

  // knight_1
  asset(AssetKeys.knight1Idle, [128, 128, 0.5], 'knight_1 idle', 'Enemy knight_1 idle', { frameCount: 4, fps: 4, downPx: -6, forwardPx: 16 }),
  asset(AssetKeys.knight1Walk, [128, 128, 0.5], 'knight_1 walk', 'Enemy knight_1 walk', { frameCount: 8, fps: 10, downPx: -6, forwardPx: 16 }),
  asset(AssetKeys.knight1Attack, [128, 128, 0.5], 'knight_1 attack', 'Enemy knight_1 attack', { frameCount: 6, fps: 8, downPx: -6, forwardPx: 14 }),
  asset(AssetKeys.knight1Hurt, [128, 128, 0.5], 'knight_1 hurt', 'Enemy knight_1 hurt'),
  asset(AssetKeys.knight1Death, [128, 128, 0.5], 'knight_1 death', 'Enemy knight_1 death'),

  // knight_2
  asset(AssetKeys.knight2Idle, [128, 128, 0.5], 'knight_2 idle', 'Enemy knight_2 idle', { frameCount: 4, fps: 4, downPx: -6, forwardPx: 16 }),
  asset(AssetKeys.knight2Walk, [128, 128, 0.5], 'knight_2 walk', 'Enemy knight_2 walk', { frameCount: 8, fps: 10, downPx: -6, forwardPx: 16 }),
  asset(AssetKeys.knight2Attack, [128, 128, 0.5], 'knight_2 attack', 'Enemy knight_2 attack', { frameCount: 6, fps: 8, downPx: -6, forwardPx: 14 }),
  asset(AssetKeys.knight2Hurt, [128, 128, 0.5], 'knight_2 hurt', 'Enemy knight_2 hurt'),
  asset(AssetKeys.knight2Death, [128, 128, 0.5], 'knight_2 death', 'Enemy knight_2 death'),

  // knight_3
  asset(AssetKeys.knight3Idle, [128, 128, 0.5], 'knight_3 idle', 'Enemy knight_3 idle', { frameCount: 4, fps: 4, downPx: -6, forwardPx: 16 }),
  asset(AssetKeys.knight3Walk, [128, 128, 0.5], 'knight_3 walk', 'Enemy knight_3 walk', { frameCount: 8, fps: 10, downPx: -6, forwardPx: 16 }),
  asset(AssetKeys.knight3Attack, [128, 128, 0.5], 'knight_3 attack', 'Enemy knight_3 attack', { frameCount: 6, fps: 8, downPx: -6, forwardPx: 14 }),
  asset(AssetKeys.knight3Hurt, [128, 128, 0.5], 'knight_3 hurt', 'Enemy knight_3 hurt'),
  asset(AssetKeys.knight3Death, [128, 128, 0.5], 'knight_3 death', 'Enemy knight_3 death'),

  // lava_golem
  asset(AssetKeys.lavaGolemIdle, [128, 128, 0.5], 'lava_golem idle', 'Enemy lava_golem idle', { frameCount: 6, fps: 6, downPx: -6 }),
  asset(AssetKeys.lavaGolemWalk, [128, 128, 0.5], 'lava_golem walk', 'Enemy lava_golem walk', { frameCount: 10, fps: 10, downPx: -6 }),
  asset(AssetKeys.lavaGolemAttack, [128, 128, 0.5], 'lava_golem attack', 'Enemy lava_golem attack', { frameCount: 7, fps: 10, downPx: -6, forwardPx: 4 }),
  asset(AssetKeys.lavaGolemHurt, [128, 128, 0.5], 'lava_golem hurt', 'Enemy lava_golem hurt'),
  asset(AssetKeys.lavaGolemDeath, [128, 128, 0.5], 'lava_golem death', 'Enemy lava_golem death'),

  // mimic_1
  asset(AssetKeys.mimic1Idle, [128, 128, 0.5], 'mimic_1 idle', 'Enemy mimic_1 idle', { frameCount: 1, fps: 6, downPx: -6, forwardPx: -2 }),
  asset(AssetKeys.mimic1Walk, [128, 128, 0.5], 'mimic_1 walk', 'Enemy mimic_1 walk', { frameCount: 11, fps: 10, downPx: -6 }),
  asset(AssetKeys.mimic1Attack, [128, 128, 0.5], 'mimic_1 attack', 'Enemy mimic_1 attack', { frameCount: 7, fps: 10, downPx: -6, forwardPx: 4 }),
  asset(AssetKeys.mimic1Hurt, [128, 128, 0.5], 'mimic_1 hurt', 'Enemy mimic_1 hurt'),
  asset(AssetKeys.mimic1Death, [128, 128, 0.5], 'mimic_1 death', 'Enemy mimic_1 death'),

  // mimic_2
  asset(AssetKeys.mimic2Idle, [128, 128, 0.5], 'mimic_2 idle', 'Enemy mimic_2 idle', { frameCount: 1, fps: 6, downPx: -6 }),
  asset(AssetKeys.mimic2Walk, [128, 128, 0.5], 'mimic_2 walk', 'Enemy mimic_2 walk', { frameCount: 9, fps: 10, downPx: -6 }),
  asset(AssetKeys.mimic2Attack, [128, 128, 0.5], 'mimic_2 attack', 'Enemy mimic_2 attack', { frameCount: 4, fps: 8, downPx: -6, forwardPx: 4 }),
  asset(AssetKeys.mimic2Hurt, [128, 128, 0.5], 'mimic_2 hurt', 'Enemy mimic_2 hurt'),
  asset(AssetKeys.mimic2Death, [128, 128, 0.5], 'mimic_2 death', 'Enemy mimic_2 death'),

  // mimic_3
  asset(AssetKeys.mimic3Idle, [128, 128, 0.5], 'mimic_3 idle', 'Enemy mimic_3 idle', { frameCount: 1, fps: 6, downPx: -6 }),
  asset(AssetKeys.mimic3Walk, [128, 128, 0.5], 'mimic_3 walk', 'Enemy mimic_3 walk', { frameCount: 6, fps: 10, downPx: -6 }),
  asset(AssetKeys.mimic3Attack, [128, 128, 0.5], 'mimic_3 attack', 'Enemy mimic_3 attack', { frameCount: 7, fps: 12, downPx: -6, forwardPx: 4 }),
  asset(AssetKeys.mimic3Hurt, [128, 128, 0.5], 'mimic_3 hurt', 'Enemy mimic_3 hurt'),
  asset(AssetKeys.mimic3Death, [128, 128, 0.5], 'mimic_3 death', 'Enemy mimic_3 death'),

  // minotaur_1
  asset(AssetKeys.minotaur1Idle, [128, 128, 0.5], 'minotaur_1 idle', 'Enemy minotaur_1 idle', { frameCount: 10, fps: 6, downPx: -6, forwardPx: 2 }),
  asset(AssetKeys.minotaur1Walk, [128, 128, 0.5], 'minotaur_1 walk', 'Enemy minotaur_1 walk', { frameCount: 12, fps: 10, downPx: -6, forwardPx: 2 }),
  asset(AssetKeys.minotaur1Attack, [128, 128, 0.5], 'minotaur_1 attack', 'Enemy minotaur_1 attack', { frameCount: 5, fps: 8, downPx: -6, forwardPx: 6 }),
  asset(AssetKeys.minotaur1Hurt, [128, 128, 0.5], 'minotaur_1 hurt', 'Enemy minotaur_1 hurt'),
  asset(AssetKeys.minotaur1Death, [128, 128, 0.5], 'minotaur_1 death', 'Enemy minotaur_1 death'),

  // minotaur_2
  asset(AssetKeys.minotaur2Idle, [128, 128, 0.5], 'minotaur_2 idle', 'Enemy minotaur_2 idle', { frameCount: 10, fps: 6, downPx: -6, forwardPx: 2 }),
  asset(AssetKeys.minotaur2Walk, [128, 128, 0.5], 'minotaur_2 walk', 'Enemy minotaur_2 walk', { frameCount: 12, fps: 10, downPx: -6, forwardPx: 2 }),
  asset(AssetKeys.minotaur2Attack, [128, 128, 0.5], 'minotaur_2 attack', 'Enemy minotaur_2 attack', { frameCount: 5, fps: 8, downPx: -6, forwardPx: 4 }),
  asset(AssetKeys.minotaur2Hurt, [128, 128, 0.5], 'minotaur_2 hurt', 'Enemy minotaur_2 hurt'),
  asset(AssetKeys.minotaur2Death, [128, 128, 0.5], 'minotaur_2 death', 'Enemy minotaur_2 death'),

  // minotaur_3
  asset(AssetKeys.minotaur3Idle, [128, 128, 0.5], 'minotaur_3 idle', 'Enemy minotaur_3 idle', { frameCount: 10, fps: 6, downPx: -6, forwardPx: 2 }),
  asset(AssetKeys.minotaur3Walk, [128, 128, 0.5], 'minotaur_3 walk', 'Enemy minotaur_3 walk', { frameCount: 12, fps: 10, downPx: -6, forwardPx: 2 }),
  asset(AssetKeys.minotaur3Attack, [128, 128, 0.5], 'minotaur_3 attack', 'Enemy minotaur_3 attack', { frameCount: 4, fps: 8, downPx: -6, forwardPx: 4 }),
  asset(AssetKeys.minotaur3Hurt, [128, 128, 0.5], 'minotaur_3 hurt', 'Enemy minotaur_3 hurt'),
  asset(AssetKeys.minotaur3Death, [128, 128, 0.5], 'minotaur_3 death', 'Enemy minotaur_3 death'),

  // orc_warrior_brown
  asset(AssetKeys.orcWarriorBrownIdle, [128, 128, 0.5], 'orc_warrior_brown idle', 'Enemy orc_warrior_brown idle', { frameCount: 7, fps: 6, downPx: -6 }),
  asset(AssetKeys.orcWarriorBrownWalk, [128, 128, 0.5], 'orc_warrior_brown walk', 'Enemy orc_warrior_brown walk', { frameCount: 8, fps: 10, downPx: -6 }),
  asset(AssetKeys.orcWarriorBrownAttack, [128, 128, 0.5], 'orc_warrior_brown attack', 'Enemy orc_warrior_brown attack', { frameCount: 5, fps: 8, downPx: -6, forwardPx: -2 }),
  asset(AssetKeys.orcWarriorBrownHurt, [128, 128, 0.5], 'orc_warrior_brown hurt', 'Enemy orc_warrior_brown hurt'),
  asset(AssetKeys.orcWarriorBrownDeath, [128, 128, 0.5], 'orc_warrior_brown death', 'Enemy orc_warrior_brown death'),

  // orc_warrior_green
  asset(AssetKeys.orcWarriorGreenIdle, [128, 128, 0.5], 'orc_warrior_green idle', 'Enemy orc_warrior_green idle', { frameCount: 7, fps: 6, downPx: -6 }),
  asset(AssetKeys.orcWarriorGreenWalk, [128, 128, 0.5], 'orc_warrior_green walk', 'Enemy orc_warrior_green walk', { frameCount: 8, fps: 10, downPx: -6 }),
  asset(AssetKeys.orcWarriorGreenAttack, [128, 128, 0.5], 'orc_warrior_green attack', 'Enemy orc_warrior_green attack', { frameCount: 5, fps: 8, downPx: -6, forwardPx: 2 }),
  asset(AssetKeys.orcWarriorGreenHurt, [128, 128, 0.5], 'orc_warrior_green hurt', 'Enemy orc_warrior_green hurt'),
  asset(AssetKeys.orcWarriorGreenDeath, [128, 128, 0.5], 'orc_warrior_green death', 'Enemy orc_warrior_green death'),

  // orc_woman
  asset(AssetKeys.orcWomanIdle, [128, 128, 0.5], 'orc_woman idle', 'Enemy orc_woman idle', { frameCount: 6, fps: 6, downPx: -6 }),
  asset(AssetKeys.orcWomanWalk, [128, 128, 0.5], 'orc_woman walk', 'Enemy orc_woman walk', { frameCount: 8, fps: 10, downPx: -6 }),
  asset(AssetKeys.orcWomanAttack, [128, 128, 0.5], 'orc_woman attack', 'Enemy orc_woman attack', { frameCount: 6, fps: 8, downPx: -6, forwardPx: 2 }),
  asset(AssetKeys.orcWomanHurt, [128, 128, 0.5], 'orc_woman hurt', 'Enemy orc_woman hurt'),
  asset(AssetKeys.orcWomanDeath, [128, 128, 0.5], 'orc_woman death', 'Enemy orc_woman death'),

  // stone_golem
  asset(AssetKeys.stoneGolemIdle, [128, 128, 0.5], 'stone_golem idle', 'Enemy stone_golem idle', { frameCount: 6, fps: 6, downPx: -6 }),
  asset(AssetKeys.stoneGolemWalk, [128, 128, 0.5], 'stone_golem walk', 'Enemy stone_golem walk', { frameCount: 6, fps: 10, downPx: -6 }),
  asset(AssetKeys.stoneGolemAttack, [128, 128, 0.5], 'stone_golem attack', 'Enemy stone_golem attack', { frameCount: 5, fps: 8, downPx: -6 }),
  asset(AssetKeys.stoneGolemHurt, [128, 128, 0.5], 'stone_golem hurt', 'Enemy stone_golem hurt'),
  asset(AssetKeys.stoneGolemDeath, [128, 128, 0.5], 'stone_golem death', 'Enemy stone_golem death'),
];

/**
 * The 'real' flag: keys whose real art file (assets/<key>.png) exists and is loaded instead of a
 * generated placeholder. Brand/ui/world have no art yet (placeholders); everything else (player +
 * every enemy animation) is real. A key flagged real whose file is missing logs a warning at boot
 * and falls back to its placeholder, so typos/missing art show up in the 404 list.
 */
const PLACEHOLDER_KEYS: ReadonlySet<string> = new Set<string>([
  AssetKeys.brandLogo,
  AssetKeys.uiMenuBackground,
  AssetKeys.uiButton,
  AssetKeys.uiPanel,
  AssetKeys.world1Floor,
  AssetKeys.world1Wall,
]);

export const REAL_ASSET_KEYS: ReadonlySet<string> = new Set<string>(
  Object.values(AssetKeys).filter((key) => !PLACEHOLDER_KEYS.has(key)),
);

/** The default game manifest: descriptors + which keys currently have real art. */
export const manifest = new AssetManifest(GAME_ASSETS, REAL_ASSET_KEYS);

/** AssetKeys / AssetKey are the single source of truth in ./keys; re-export them here. */
export { AssetKeys };
export type { AssetKey };

/** Keys referenced by code; the validation pass checks they all resolve. Every descriptor uses an
 *  AssetKeys constant, so the used set is exactly the key table. */
export const USED_ASSET_KEYS: readonly string[] = Object.values(AssetKeys);

/** Resolve a key against the default game manifest. */
export function resolveKey(key: string): ManifestEntry | undefined {
  return manifest.resolve(key);
}

/** Validate the default game manifest against the code's used keys. */
export function validateManifest(usedKeys: readonly string[] = USED_ASSET_KEYS): ValidationReport {
  return manifest.validate(usedKeys);
}
