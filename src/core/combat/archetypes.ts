import type { EnemyDef } from './types';

/**
 * The four enemy archetypes as data (ADR-007): Melee (high HP, adjacent), Ranged (low HP, attacks at
 * distance with LOS), Armored (high armour + HP, slow), Spellcaster (low HP, ranged, targets lowest-HP
 * and supports allies — its support behaviour is the Enemy AI feature's). Stat lines are PLACEHOLDER
 * pending balance sign-off (a brief open question); they are data, so tuning needs no code change.
 */
export const ARCHETYPES: Record<string, EnemyDef> = {
  melee: {
    id: 'melee',
    spriteKey: 'enemy.melee',
    maxHp: 30,
    armor: 1,
    movement: 3,
    tags: ['melee'],
    attack: { minRange: 1, maxRange: 1, requiresLineOfSight: false, targetRule: 'nearest', baseDamage: 6 },
  },
  ranged: {
    id: 'ranged',
    spriteKey: 'enemy.ranged',
    maxHp: 14,
    armor: 0,
    movement: 3,
    tags: ['ranged'],
    attack: { minRange: 2, maxRange: 5, requiresLineOfSight: true, targetRule: 'nearest', baseDamage: 5 },
  },
  armored: {
    id: 'armored',
    spriteKey: 'enemy.armored',
    maxHp: 40,
    armor: 5,
    movement: 2,
    tags: ['armored', 'melee'],
    attack: { minRange: 1, maxRange: 1, requiresLineOfSight: false, targetRule: 'nearest', baseDamage: 7 },
  },
  spellcaster: {
    id: 'spellcaster',
    spriteKey: 'enemy.spellcaster',
    maxHp: 16,
    armor: 0,
    movement: 2,
    tags: ['spellcaster', 'support'],
    attack: { minRange: 2, maxRange: 4, requiresLineOfSight: true, targetRule: 'lowestHp', baseDamage: 4 },
  },
};
