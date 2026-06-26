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

  // Ground terrain tileset (16x16 frame-indexed spritesheet) for the square terrain background.
  terrainGroundGrass: 'terrain_ground_grass',
  // Grass-leaf foliage tileset (16x16 frame-indexed spritesheet) — the leaf detail layer reads its decal frames from it.
  terrainStairsGrass: 'terrain_stairs_grass',

  // Obstacle props (per kind): rendered as bottom-anchored sprites standing on their hex.
  obstacleTreeGrass1: 'obstacle_tree_grass_1',
  obstacleRockGrass1: 'obstacle_rock_grass_1',
  obstacleRockGrass2: 'obstacle_rock_grass_2',

  // Chest prop: a reward chest standing on a hex (bottom-anchored static sprite); opened by walking onto it.
  chest: 'chest',

  // slime1
  enemySlime1Idle: 'enemy_slime1.idle',
  enemySlime1Walk: 'enemy_slime1.walk',
  enemySlime1Attack: 'enemy_slime1.attack',
  enemySlime1Hurt: 'enemy_slime1.hurt',
  enemySlime1Death: 'enemy_slime1.death',

  // slime2
  enemySlime2Idle: 'enemy_slime2.idle',
  enemySlime2Walk: 'enemy_slime2.walk',
  enemySlime2Attack: 'enemy_slime2.attack',
  enemySlime2Hurt: 'enemy_slime2.hurt',
  enemySlime2Death: 'enemy_slime2.death',

  // slime3
  enemySlime3Idle: 'enemy_slime3.idle',
  enemySlime3Walk: 'enemy_slime3.walk',
  enemySlime3Attack: 'enemy_slime3.attack',
  enemySlime3Hurt: 'enemy_slime3.hurt',
  enemySlime3Death: 'enemy_slime3.death',

  // copper_golem
  enemyCopperGolemIdle: 'enemy_copper_golem.idle',
  enemyCopperGolemWalk: 'enemy_copper_golem.walk',
  enemyCopperGolemAttack: 'enemy_copper_golem.attack',
  enemyCopperGolemHurt: 'enemy_copper_golem.hurt',
  enemyCopperGolemDeath: 'enemy_copper_golem.death',

  // demon_2
  enemyDemon2Idle: 'enemy_demon_2.idle',
  enemyDemon2Walk: 'enemy_demon_2.walk',
  enemyDemon2Attack: 'enemy_demon_2.attack',
  enemyDemon2Hurt: 'enemy_demon_2.hurt',
  enemyDemon2Death: 'enemy_demon_2.death',

  // demon_3
  enemyDemon3Idle: 'enemy_demon_3.idle',
  enemyDemon3Walk: 'enemy_demon_3.walk',
  enemyDemon3Attack: 'enemy_demon_3.attack',
  enemyDemon3Hurt: 'enemy_demon_3.hurt',
  enemyDemon3Death: 'enemy_demon_3.death',

  // dragon_1
  enemyDragon1Idle: 'enemy_dragon_1.idle',
  enemyDragon1Walk: 'enemy_dragon_1.walk',
  enemyDragon1Attack: 'enemy_dragon_1.attack',
  enemyDragon1Hurt: 'enemy_dragon_1.hurt',
  enemyDragon1Death: 'enemy_dragon_1.death',

  // dragon_2
  enemyDragon2Idle: 'enemy_dragon_2.idle',
  enemyDragon2Walk: 'enemy_dragon_2.walk',
  enemyDragon2Attack: 'enemy_dragon_2.attack',
  enemyDragon2Hurt: 'enemy_dragon_2.hurt',
  enemyDragon2Death: 'enemy_dragon_2.death',

  // dragon_3
  enemyDragon3Idle: 'enemy_dragon_3.idle',
  enemyDragon3Walk: 'enemy_dragon_3.walk',
  enemyDragon3Attack: 'enemy_dragon_3.attack',
  enemyDragon3Hurt: 'enemy_dragon_3.hurt',
  enemyDragon3Death: 'enemy_dragon_3.death',

  // elf_queen_1
  enemyElfQueen1Idle: 'enemy_elf_queen_1.idle',
  enemyElfQueen1Walk: 'enemy_elf_queen_1.walk',
  enemyElfQueen1Attack: 'enemy_elf_queen_1.attack',
  enemyElfQueen1Hurt: 'enemy_elf_queen_1.hurt',
  enemyElfQueen1Death: 'enemy_elf_queen_1.death',

  // elf_queen_2
  enemyElfQueen2Idle: 'enemy_elf_queen_2.idle',
  enemyElfQueen2Walk: 'enemy_elf_queen_2.walk',
  enemyElfQueen2Attack: 'enemy_elf_queen_2.attack',
  enemyElfQueen2Hurt: 'enemy_elf_queen_2.hurt',
  enemyElfQueen2Death: 'enemy_elf_queen_2.death',

  // goblin_1
  enemyGoblin1Idle: 'enemy_goblin_1.idle',
  enemyGoblin1Walk: 'enemy_goblin_1.walk',
  enemyGoblin1Attack: 'enemy_goblin_1.attack',
  enemyGoblin1Hurt: 'enemy_goblin_1.hurt',
  enemyGoblin1Death: 'enemy_goblin_1.death',

  // goblin_2
  enemyGoblin2Idle: 'enemy_goblin_2.idle',
  enemyGoblin2Walk: 'enemy_goblin_2.walk',
  enemyGoblin2Attack: 'enemy_goblin_2.attack',
  enemyGoblin2Hurt: 'enemy_goblin_2.hurt',
  enemyGoblin2Death: 'enemy_goblin_2.death',

  // goblin_3
  enemyGoblin3Idle: 'enemy_goblin_3.idle',
  enemyGoblin3Walk: 'enemy_goblin_3.walk',
  enemyGoblin3Attack: 'enemy_goblin_3.attack',
  enemyGoblin3Hurt: 'enemy_goblin_3.hurt',
  enemyGoblin3Death: 'enemy_goblin_3.death',

  // gorgon_1
  enemyGorgon1Idle: 'enemy_gorgon_1.idle',
  enemyGorgon1Walk: 'enemy_gorgon_1.walk',
  enemyGorgon1Attack: 'enemy_gorgon_1.attack',
  enemyGorgon1Hurt: 'enemy_gorgon_1.hurt',
  enemyGorgon1Death: 'enemy_gorgon_1.death',

  // gorgon_2
  enemyGorgon2Idle: 'enemy_gorgon_2.idle',
  enemyGorgon2Walk: 'enemy_gorgon_2.walk',
  enemyGorgon2Attack: 'enemy_gorgon_2.attack',
  enemyGorgon2Hurt: 'enemy_gorgon_2.hurt',
  enemyGorgon2Death: 'enemy_gorgon_2.death',

  // gorgon_3
  enemyGorgon3Idle: 'enemy_gorgon_3.idle',
  enemyGorgon3Walk: 'enemy_gorgon_3.walk',
  enemyGorgon3Attack: 'enemy_gorgon_3.attack',
  enemyGorgon3Hurt: 'enemy_gorgon_3.hurt',
  enemyGorgon3Death: 'enemy_gorgon_3.death',

  // knight_1
  enemyKnight1Idle: 'enemy_knight_1.idle',
  enemyKnight1Walk: 'enemy_knight_1.walk',
  enemyKnight1Attack: 'enemy_knight_1.attack',
  enemyKnight1Hurt: 'enemy_knight_1.hurt',
  enemyKnight1Death: 'enemy_knight_1.death',

  // knight_2
  enemyKnight2Idle: 'enemy_knight_2.idle',
  enemyKnight2Walk: 'enemy_knight_2.walk',
  enemyKnight2Attack: 'enemy_knight_2.attack',
  enemyKnight2Hurt: 'enemy_knight_2.hurt',
  enemyKnight2Death: 'enemy_knight_2.death',

  // knight_3
  enemyKnight3Idle: 'enemy_knight_3.idle',
  enemyKnight3Walk: 'enemy_knight_3.walk',
  enemyKnight3Attack: 'enemy_knight_3.attack',
  enemyKnight3Hurt: 'enemy_knight_3.hurt',
  enemyKnight3Death: 'enemy_knight_3.death',

  // lava_golem
  enemyLavaGolemIdle: 'enemy_lava_golem.idle',
  enemyLavaGolemWalk: 'enemy_lava_golem.walk',
  enemyLavaGolemAttack: 'enemy_lava_golem.attack',
  enemyLavaGolemHurt: 'enemy_lava_golem.hurt',
  enemyLavaGolemDeath: 'enemy_lava_golem.death',

  // mimic_1
  enemyMimic1Idle: 'enemy_mimic_1.idle',
  enemyMimic1Walk: 'enemy_mimic_1.walk',
  enemyMimic1Attack: 'enemy_mimic_1.attack',
  enemyMimic1Hurt: 'enemy_mimic_1.hurt',
  enemyMimic1Death: 'enemy_mimic_1.death',

  // mimic_2
  enemyMimic2Idle: 'enemy_mimic_2.idle',
  enemyMimic2Walk: 'enemy_mimic_2.walk',
  enemyMimic2Attack: 'enemy_mimic_2.attack',
  enemyMimic2Hurt: 'enemy_mimic_2.hurt',
  enemyMimic2Death: 'enemy_mimic_2.death',

  // mimic_3
  enemyMimic3Idle: 'enemy_mimic_3.idle',
  enemyMimic3Walk: 'enemy_mimic_3.walk',
  enemyMimic3Attack: 'enemy_mimic_3.attack',
  enemyMimic3Hurt: 'enemy_mimic_3.hurt',
  enemyMimic3Death: 'enemy_mimic_3.death',

  // minotaur_1
  enemyMinotaur1Idle: 'enemy_minotaur_1.idle',
  enemyMinotaur1Walk: 'enemy_minotaur_1.walk',
  enemyMinotaur1Attack: 'enemy_minotaur_1.attack',
  enemyMinotaur1Hurt: 'enemy_minotaur_1.hurt',
  enemyMinotaur1Death: 'enemy_minotaur_1.death',

  // minotaur_2
  enemyMinotaur2Idle: 'enemy_minotaur_2.idle',
  enemyMinotaur2Walk: 'enemy_minotaur_2.walk',
  enemyMinotaur2Attack: 'enemy_minotaur_2.attack',
  enemyMinotaur2Hurt: 'enemy_minotaur_2.hurt',
  enemyMinotaur2Death: 'enemy_minotaur_2.death',

  // minotaur_3
  enemyMinotaur3Idle: 'enemy_minotaur_3.idle',
  enemyMinotaur3Walk: 'enemy_minotaur_3.walk',
  enemyMinotaur3Attack: 'enemy_minotaur_3.attack',
  enemyMinotaur3Hurt: 'enemy_minotaur_3.hurt',
  enemyMinotaur3Death: 'enemy_minotaur_3.death',

  // orc_warrior_brown
  enemyOrcWarriorBrownIdle: 'enemy_orc_warrior_brown.idle',
  enemyOrcWarriorBrownWalk: 'enemy_orc_warrior_brown.walk',
  enemyOrcWarriorBrownAttack: 'enemy_orc_warrior_brown.attack',
  enemyOrcWarriorBrownHurt: 'enemy_orc_warrior_brown.hurt',
  enemyOrcWarriorBrownDeath: 'enemy_orc_warrior_brown.death',

  // orc_warrior_green
  enemyOrcWarriorGreenIdle: 'enemy_orc_warrior_green.idle',
  enemyOrcWarriorGreenWalk: 'enemy_orc_warrior_green.walk',
  enemyOrcWarriorGreenAttack: 'enemy_orc_warrior_green.attack',
  enemyOrcWarriorGreenHurt: 'enemy_orc_warrior_green.hurt',
  enemyOrcWarriorGreenDeath: 'enemy_orc_warrior_green.death',

  // orc_woman
  enemyOrcWomanIdle: 'enemy_orc_woman.idle',
  enemyOrcWomanWalk: 'enemy_orc_woman.walk',
  enemyOrcWomanAttack: 'enemy_orc_woman.attack',
  enemyOrcWomanHurt: 'enemy_orc_woman.hurt',
  enemyOrcWomanDeath: 'enemy_orc_woman.death',

  // stone_golem
  enemyStoneGolemIdle: 'enemy_stone_golem.idle',
  enemyStoneGolemWalk: 'enemy_stone_golem.walk',
  enemyStoneGolemAttack: 'enemy_stone_golem.attack',
  enemyStoneGolemHurt: 'enemy_stone_golem.hurt',
  enemyStoneGolemDeath: 'enemy_stone_golem.death',
} as const;

/** Union of the canonical logical asset keys. */
export type AssetKey = (typeof AssetKeys)[keyof typeof AssetKeys];
