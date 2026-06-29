/**
 * Enemy AI: Movement & Telegraphed Attacks (Into-the-Breach). On the enemy turn each enemy moves (greedy,
 * deterministic, Phaser-free) and TELEGRAPHS an attack onto fixed target hexes; the attack resolves at the
 * end of the next player turn through the combat resolver, so the player can dodge, Shield, or kill the
 * attacker to counter it. Buffs/heals are deferred (Status Effects, ADR-008). The scene reads PlannedAttack
 * to draw the light-red target hexes + hover line.
 */
export type { PlannedAttackData } from './components';
export { PlannedAttack } from './components';
export type { EnemyDecision } from './decide';
export { decideEnemy } from './decide';
export { makeEnemyTurnSystem } from './system';
