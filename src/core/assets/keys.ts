/**
 * The canonical logical asset keys the game code references — the single source of truth so the
 * registry's GAME_ASSETS / REAL_ASSET_KEYS / USED_ASSET_KEYS reference these constants instead of
 * repeating the literal strings. Phaser-free (ADR-002): plain string constants only.
 *
 * Brand/ui/world/player keys, then one key per enemy animation: every roster enemy contributes
 * idle / walk / attack (animated) and hurt / death (static). Each line is one animation.
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
  playerDeath: 'player.death',

  // Card UI: static card-face backgrounds by class.
  cardAttack: 'card_attack',
  cardSkill: 'card_skill',

  // Card art shown BEHIND the face (per card type), revealed through the frame's transparent top-half opening.
  cardArtMelee: 'card_art_melee',
  cardArtLongstrike: 'card_art_longstrike',
  cardArtRangedshot: 'card_art_rangedshot',
  cardArtDefend: 'card_art_defend',
  cardArtJump: 'card_art_jump',
  cardArtQuickdraw: 'card_art_quickdraw',
  cardArtSharpen: 'card_art_sharpen',
  cardArtWhirlwind: 'card_art_whirlwind',
  cardArtRecall: 'card_art_recall',

  // Spell sidebar art (one per spell; files are spell_art_<id>, and heal's art is selfheal).
  spellArtBlizzard: 'spell_art_blizzard',
  spellArtSelfheal: 'spell_art_selfheal',
  spellArtTeleport: 'spell_art_teleport',

  // slime1
  slime1Idle: 'slime1.idle',
  slime1Walk: 'slime1.walk',
  slime1Attack: 'slime1.attack',
  slime1Hurt: 'slime1.hurt',
  slime1Death: 'slime1.death',

  // slime2
  slime2Idle: 'slime2.idle',
  slime2Walk: 'slime2.walk',
  slime2Attack: 'slime2.attack',
  slime2Hurt: 'slime2.hurt',
  slime2Death: 'slime2.death',

  // slime3
  slime3Idle: 'slime3.idle',
  slime3Walk: 'slime3.walk',
  slime3Attack: 'slime3.attack',
  slime3Hurt: 'slime3.hurt',
  slime3Death: 'slime3.death',

  // copper_golem
  copperGolemIdle: 'copper_golem.idle',
  copperGolemWalk: 'copper_golem.walk',
  copperGolemAttack: 'copper_golem.attack',
  copperGolemHurt: 'copper_golem.hurt',
  copperGolemDeath: 'copper_golem.death',

  // demon_2
  demon2Idle: 'demon_2.idle',
  demon2Walk: 'demon_2.walk',
  demon2Attack: 'demon_2.attack',
  demon2Hurt: 'demon_2.hurt',
  demon2Death: 'demon_2.death',

  // demon_3
  demon3Idle: 'demon_3.idle',
  demon3Walk: 'demon_3.walk',
  demon3Attack: 'demon_3.attack',
  demon3Hurt: 'demon_3.hurt',
  demon3Death: 'demon_3.death',

  // dragon_1
  dragon1Idle: 'dragon_1.idle',
  dragon1Walk: 'dragon_1.walk',
  dragon1Attack: 'dragon_1.attack',
  dragon1Hurt: 'dragon_1.hurt',
  dragon1Death: 'dragon_1.death',

  // dragon_2
  dragon2Idle: 'dragon_2.idle',
  dragon2Walk: 'dragon_2.walk',
  dragon2Attack: 'dragon_2.attack',
  dragon2Hurt: 'dragon_2.hurt',
  dragon2Death: 'dragon_2.death',

  // dragon_3
  dragon3Idle: 'dragon_3.idle',
  dragon3Walk: 'dragon_3.walk',
  dragon3Attack: 'dragon_3.attack',
  dragon3Hurt: 'dragon_3.hurt',
  dragon3Death: 'dragon_3.death',

  // elf_queen_1
  elfQueen1Idle: 'elf_queen_1.idle',
  elfQueen1Walk: 'elf_queen_1.walk',
  elfQueen1Attack: 'elf_queen_1.attack',
  elfQueen1Hurt: 'elf_queen_1.hurt',
  elfQueen1Death: 'elf_queen_1.death',

  // elf_queen_2
  elfQueen2Idle: 'elf_queen_2.idle',
  elfQueen2Walk: 'elf_queen_2.walk',
  elfQueen2Attack: 'elf_queen_2.attack',
  elfQueen2Hurt: 'elf_queen_2.hurt',
  elfQueen2Death: 'elf_queen_2.death',

  // goblin_1
  goblin1Idle: 'goblin_1.idle',
  goblin1Walk: 'goblin_1.walk',
  goblin1Attack: 'goblin_1.attack',
  goblin1Hurt: 'goblin_1.hurt',
  goblin1Death: 'goblin_1.death',

  // goblin_2
  goblin2Idle: 'goblin_2.idle',
  goblin2Walk: 'goblin_2.walk',
  goblin2Attack: 'goblin_2.attack',
  goblin2Hurt: 'goblin_2.hurt',
  goblin2Death: 'goblin_2.death',

  // goblin_3
  goblin3Idle: 'goblin_3.idle',
  goblin3Walk: 'goblin_3.walk',
  goblin3Attack: 'goblin_3.attack',
  goblin3Hurt: 'goblin_3.hurt',
  goblin3Death: 'goblin_3.death',

  // gorgon_1
  gorgon1Idle: 'gorgon_1.idle',
  gorgon1Walk: 'gorgon_1.walk',
  gorgon1Attack: 'gorgon_1.attack',
  gorgon1Hurt: 'gorgon_1.hurt',
  gorgon1Death: 'gorgon_1.death',

  // gorgon_2
  gorgon2Idle: 'gorgon_2.idle',
  gorgon2Walk: 'gorgon_2.walk',
  gorgon2Attack: 'gorgon_2.attack',
  gorgon2Hurt: 'gorgon_2.hurt',
  gorgon2Death: 'gorgon_2.death',

  // gorgon_3
  gorgon3Idle: 'gorgon_3.idle',
  gorgon3Walk: 'gorgon_3.walk',
  gorgon3Attack: 'gorgon_3.attack',
  gorgon3Hurt: 'gorgon_3.hurt',
  gorgon3Death: 'gorgon_3.death',

  // knight_1
  knight1Idle: 'knight_1.idle',
  knight1Walk: 'knight_1.walk',
  knight1Attack: 'knight_1.attack',
  knight1Hurt: 'knight_1.hurt',
  knight1Death: 'knight_1.death',

  // knight_2
  knight2Idle: 'knight_2.idle',
  knight2Walk: 'knight_2.walk',
  knight2Attack: 'knight_2.attack',
  knight2Hurt: 'knight_2.hurt',
  knight2Death: 'knight_2.death',

  // knight_3
  knight3Idle: 'knight_3.idle',
  knight3Walk: 'knight_3.walk',
  knight3Attack: 'knight_3.attack',
  knight3Hurt: 'knight_3.hurt',
  knight3Death: 'knight_3.death',

  // lava_golem
  lavaGolemIdle: 'lava_golem.idle',
  lavaGolemWalk: 'lava_golem.walk',
  lavaGolemAttack: 'lava_golem.attack',
  lavaGolemHurt: 'lava_golem.hurt',
  lavaGolemDeath: 'lava_golem.death',

  // mimic_1
  mimic1Idle: 'mimic_1.idle',
  mimic1Walk: 'mimic_1.walk',
  mimic1Attack: 'mimic_1.attack',
  mimic1Hurt: 'mimic_1.hurt',
  mimic1Death: 'mimic_1.death',

  // mimic_2
  mimic2Idle: 'mimic_2.idle',
  mimic2Walk: 'mimic_2.walk',
  mimic2Attack: 'mimic_2.attack',
  mimic2Hurt: 'mimic_2.hurt',
  mimic2Death: 'mimic_2.death',

  // mimic_3
  mimic3Idle: 'mimic_3.idle',
  mimic3Walk: 'mimic_3.walk',
  mimic3Attack: 'mimic_3.attack',
  mimic3Hurt: 'mimic_3.hurt',
  mimic3Death: 'mimic_3.death',

  // minotaur_1
  minotaur1Idle: 'minotaur_1.idle',
  minotaur1Walk: 'minotaur_1.walk',
  minotaur1Attack: 'minotaur_1.attack',
  minotaur1Hurt: 'minotaur_1.hurt',
  minotaur1Death: 'minotaur_1.death',

  // minotaur_2
  minotaur2Idle: 'minotaur_2.idle',
  minotaur2Walk: 'minotaur_2.walk',
  minotaur2Attack: 'minotaur_2.attack',
  minotaur2Hurt: 'minotaur_2.hurt',
  minotaur2Death: 'minotaur_2.death',

  // minotaur_3
  minotaur3Idle: 'minotaur_3.idle',
  minotaur3Walk: 'minotaur_3.walk',
  minotaur3Attack: 'minotaur_3.attack',
  minotaur3Hurt: 'minotaur_3.hurt',
  minotaur3Death: 'minotaur_3.death',

  // orc_warrior_brown
  orcWarriorBrownIdle: 'orc_warrior_brown.idle',
  orcWarriorBrownWalk: 'orc_warrior_brown.walk',
  orcWarriorBrownAttack: 'orc_warrior_brown.attack',
  orcWarriorBrownHurt: 'orc_warrior_brown.hurt',
  orcWarriorBrownDeath: 'orc_warrior_brown.death',

  // orc_warrior_green
  orcWarriorGreenIdle: 'orc_warrior_green.idle',
  orcWarriorGreenWalk: 'orc_warrior_green.walk',
  orcWarriorGreenAttack: 'orc_warrior_green.attack',
  orcWarriorGreenHurt: 'orc_warrior_green.hurt',
  orcWarriorGreenDeath: 'orc_warrior_green.death',

  // orc_woman
  orcWomanIdle: 'orc_woman.idle',
  orcWomanWalk: 'orc_woman.walk',
  orcWomanAttack: 'orc_woman.attack',
  orcWomanHurt: 'orc_woman.hurt',
  orcWomanDeath: 'orc_woman.death',

  // stone_golem
  stoneGolemIdle: 'stone_golem.idle',
  stoneGolemWalk: 'stone_golem.walk',
  stoneGolemAttack: 'stone_golem.attack',
  stoneGolemHurt: 'stone_golem.hurt',
  stoneGolemDeath: 'stone_golem.death',
} as const;

/** Union of the canonical logical asset keys. */
export type AssetKey = (typeof AssetKeys)[keyof typeof AssetKeys];
