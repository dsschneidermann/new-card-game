import type { System, World } from '../ecs/world';
import type { EntityId } from '../ecs/entity';
import { Enemy } from '../actors';
import { CombatStats, Shield } from './components';

/**
 * Shield lifecycle (Defense & Shielding, ADR-008). Shield is a temporary absorb pool that soaks damage
 * before HP; this module owns gaining and resetting it, plus the per-turn rules that make it behave like
 * Slay-the-Spire block. The combat resolver (combat.ts) is what SPENDS shield as it absorbs; here we only
 * grant and reset.
 */

/** Add `amount` of shield to `entity` (attaching the pool if absent), never below 0. The player's Defend
 *  and each enemy's self-shield both flow through here. */
export function gainShield(world: World, entity: EntityId, amount: number): void {
  if (amount <= 0) return;
  const store = world.store(Shield);
  const current = store.get(entity);
  if (current !== undefined) current.shield = Math.max(0, current.shield + amount);
  else store.add(entity, { shield: amount });
}

/** Reset `entity`'s shield to 0 (no-op if it has no shield pool). */
export function resetShield(world: World, entity: EntityId): void {
  const current = world.store(Shield).get(entity);
  if (current !== undefined) current.shield = 0;
}

/** Wipe every enemy's shield (end of the player turn): enemy shield never carries across rounds. */
export function resetEnemyShields(world: World): void {
  for (const enemy of world.entitiesWith(Enemy)) resetShield(world, enemy);
}

/** Each alive enemy grants itself its CombatStats.selfShield (its enemy-turn ability). Enemies with no
 *  self-shield are unaffected. Runs AFTER resetEnemyShields, so the pool equals exactly this turn's grant. */
export function applyEnemySelfShields(world: World): void {
  for (const enemy of world.entitiesWith(Enemy)) {
    if (!world.isAlive(enemy)) continue;
    gainShield(world, enemy, world.store(CombatStats).get(enemy)?.selfShield ?? 0);
  }
}

/**
 * The shield system (Defense & Shielding). Registered AFTER the turn engine AND the card system, it reacts
 * to THIS step's events (same-step visible on the event bus, exactly like the card system) to run the
 * shield lifecycle:
 *  - TurnEnded{player}:    wipe ALL enemy shield (it does not carry between rounds).
 *  - TurnStarted{enemy}:   each enemy self-shields (its only enemy-turn behaviour for now; the Enemy AI
 *                          feature owns target/attack selection in runEnemyTurn, which stays untouched).
 *  - TurnStarted{player}:  wipe the player's shield (block from last round does not carry into a new turn).
 *  - ShieldGainRequested:  grant the requested shield — a played Defend, emitted by the card system so the
 *                          cards module never calls combat (this module owns the pool, so it applies it).
 * The whole enemy phase resolves inside one EndTurn pass, so the turn events fire in emission order within a
 * single advance() and net out to: enemies freshly self-shielded, player shield 0 (a GainShield request, by
 * contrast, arrives on a PlayCard advance with no turn events, so the two never collide). Snapshot events
 * first so we never react to our own emissions (we emit none, but this matches the card system's discipline).
 */
export function makeShieldSystem(): System {
  return (world) => {
    for (const ev of [...world.events()]) {
      if (ev.kind === 'TurnEnded' && ev.phase === 'player') {
        resetEnemyShields(world);
      } else if (ev.kind === 'TurnStarted' && ev.phase === 'enemy') {
        applyEnemySelfShields(world);
      } else if (ev.kind === 'TurnStarted' && ev.phase === 'player' && ev.actor !== undefined) {
        resetShield(world, ev.actor);
      } else if (ev.kind === 'ShieldGainRequested') {
        gainShield(world, ev.entity, ev.amount);
      }
    }
  };
}
