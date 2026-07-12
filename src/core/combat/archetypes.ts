import { AssetKeys } from '../assets/keys';
import type { EnemyDef } from './types';

/**
 * The enemy roster (ADR-007): concrete enemy definitions, each tied to a real roster sprite and carrying
 * its own stats and one or more attacks. Stat lines are PLACEHOLDER pending balance sign-off (a brief
 * open question); they are data, so tuning needs no code change. Which enemies appear in a level — and how
 * many — is the Level Progression feature's job; this is just the catalogue it draws from.
 */

/** The roster art base for an enemy, e.g. 'enemy_goblin_1' — the idle asset key minus its '.idle' suffix
 *  (the EnemyData.art convention: the renderer appends '.idle' and the per-state animation suffixes). */
const artBase = (idleKey: string): string => idleKey.replace(/\.idle$/, '');

// Every enemy carries exactly TWO attacks (Enemy Attack Patterns): index 0 a BASIC — a reliable, single-hex,
// no-cooldown strike — and index 1 a SPECIAL — a multi-hex line/blast pattern that carries a cooldown so it
// cannot fire every turn. For all but the dragon the two attacks share the same range band, so both are
// usable from an attacking hex and the Enemy AI randomly picks between them (the special only when off
// cooldown); the dragon is a boss exception whose basic (melee bite) and special (ranged breath) split by
// range. All numbers, patterns and cooldowns are tunable data (ADR-007).
export const ARCHETYPES: Record<string, EnemyDef> = {
  goblin: {
    id: 'goblin',
    name: 'Goblin',
    spriteKey: artBase(AssetKeys.enemyGoblin1Idle),
    maxHp: 12,
    armor: 0,
    movement: 4,
    attacks: [
      { name: 'claw', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage: 4 },
      { name: 'pounce', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage: 5, pattern: { kind: 'line', size: 2 }, cooldown: 2 },
    ],
  },
  slime: {
    id: 'slime',
    name: 'Slime',
    spriteKey: artBase(AssetKeys.enemySlime1Idle),
    maxHp: 16,
    armor: 0,
    movement: 2,
    attacks: [
      { name: 'smush', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage: 3 },
      { name: 'slam', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage: 4, pattern: { kind: 'blast', size: 1 }, cooldown: 3 },
    ],
  },
  orc: {
    id: 'orc',
    name: 'Orc Warrior',
    spriteKey: artBase(AssetKeys.enemyOrcWarriorBrownIdle),
    maxHp: 28,
    armor: 2,
    movement: 3,
    selfShield: 3, // raises its guard each turn (the forest's self-shielder)
    attacks: [
      { name: 'cleave', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage: 7 },
      { name: 'whirlwind', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage: 7, pattern: { kind: 'blast', size: 1 }, cooldown: 3 },
    ],
  },
  knight: {
    id: 'knight',
    name: 'Dark Knight',
    spriteKey: artBase(AssetKeys.enemyKnight1Idle),
    maxHp: 34,
    armor: 5,
    movement: 2,
    selfShield: 4,
    attacks: [
      { name: 'longsword', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage: 8, pierce: 1 },
      { name: 'shield_bash', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage: 8, pierce: 1, pattern: { kind: 'line', size: 2 }, cooldown: 2 },
    ],
  },
  gorgon: {
    id: 'gorgon',
    name: 'Gorgon',
    spriteKey: artBase(AssetKeys.enemyGorgon1Idle),
    maxHp: 18,
    armor: 0,
    movement: 3,
    attacks: [
      { name: 'venom_spit', minRange: 2, maxRange: 4, requiresLineOfSight: true, baseDamage: 4 },
      { name: 'stone_gaze', minRange: 2, maxRange: 4, requiresLineOfSight: true, baseDamage: 5, pattern: { kind: 'line', size: 3 }, cooldown: 2 },
    ],
  },
  demon: {
    id: 'demon',
    name: 'Demon',
    spriteKey: artBase(AssetKeys.enemyDemon2Idle),
    maxHp: 30,
    armor: 1,
    movement: 3,
    attacks: [
      { name: 'firebolt', minRange: 2, maxRange: 5, requiresLineOfSight: true, baseDamage: 6 },
      { name: 'fireball', minRange: 2, maxRange: 5, requiresLineOfSight: true, baseDamage: 7, pattern: { kind: 'blast', size: 1 }, cooldown: 2 },
    ],
  },
  minotaur: {
    id: 'minotaur',
    name: 'Minotaur',
    spriteKey: artBase(AssetKeys.enemyMinotaur1Idle),
    maxHp: 38,
    armor: 3,
    movement: 3,
    attacks: [
      { name: 'gore', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage: 9 },
      { name: 'stomp', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage: 8, pattern: { kind: 'blast', size: 1 }, cooldown: 2 },
    ],
  },
  lava_golem: {
    id: 'lava_golem',
    name: 'Lava Golem',
    spriteKey: artBase(AssetKeys.enemyLavaGolemIdle),
    maxHp: 46,
    armor: 6,
    movement: 1,
    selfShield: 6,
    attacks: [
      { name: 'magma_fist', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage: 9 },
      { name: 'eruption', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage: 9, pattern: { kind: 'blast', size: 1 }, cooldown: 3 },
    ],
  },
  elf_queen: {
    id: 'elf_queen',
    name: 'Elf Queen',
    spriteKey: artBase(AssetKeys.enemyElfQueen1Idle),
    maxHp: 22,
    armor: 1,
    movement: 3,
    attacks: [
      { name: 'bow', minRange: 2, maxRange: 5, requiresLineOfSight: true, baseDamage: 6 },
      { name: 'frost_nova', minRange: 2, maxRange: 5, requiresLineOfSight: true, baseDamage: 5, pierce: 2, pattern: { kind: 'blast', size: 1 }, cooldown: 2 },
    ],
  },
  dragon: {
    id: 'dragon',
    name: 'Dragon',
    spriteKey: artBase(AssetKeys.enemyDragon1Idle),
    maxHp: 80,
    armor: 4,
    movement: 3,
    // Boss exception: basic bite (melee) and special breath (ranged) split by range rather than sharing a
    // band, so the dragon's attack is positional (bite up close, breath at range) with no per-turn random pick.
    attacks: [
      { name: 'bite', minRange: 1, maxRange: 1, requiresLineOfSight: false, baseDamage: 12 },
      { name: 'fire_breath', minRange: 2, maxRange: 4, requiresLineOfSight: true, baseDamage: 10, pierce: 3, pattern: { kind: 'line', size: 3 }, cooldown: 3 },
    ],
  },
};
