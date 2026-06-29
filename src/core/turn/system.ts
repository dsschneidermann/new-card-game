import type { System, World } from '../ecs/world';
import type { EntityId } from '../ecs/entity';
import type { Hex } from '../hex/hex';
import type { HexGrid } from '../hex/grid';
import { HexPosition } from '../hex/movement';
import { findPath } from '../hex/path';
import { Enemy } from '../actors';
import { TurnState, ResourcePool, MovementBudget, type TurnStateData } from './components';
import { refillEnergy, regenMana, spendEnergy, spendMana } from './resources';

/** Result of validating a player action without mutating anything. */
export type Validation = { ok: true } | { ok: false; reason: string };
const OK: Validation = { ok: true };
const reject = (reason: string): Validation => ({ ok: false, reason });

/** The entity holding the singleton TurnState (the player). */
export function turnActor(world: World): EntityId | undefined {
  return world.entitiesWith(TurnState)[0];
}

function isPlayerPhase(world: World): boolean {
  const te = turnActor(world);
  return te !== undefined && world.store(TurnState).get(te)?.phase === 'player';
}

/** Tiles a move would cost (path length − 1); 0 if already there, −1 if unreachable. */
function moveTiles(world: World, grid: HexGrid, entity: EntityId, to: Hex): number {
  const pos = world.store(HexPosition).get(entity);
  if (pos === undefined) return -1;
  const route = findPath(grid, pos.hex, to);
  if (route.length === 0) return -1;
  return route.length - 1;
}

export function canMove(world: World, grid: HexGrid, entity: EntityId, to: Hex): Validation {
  if (!isPlayerPhase(world)) return reject('not the player turn');
  const tiles = moveTiles(world, grid, entity, to);
  if (tiles < 0) return reject('destination is unreachable');
  const budget = world.store(MovementBudget).get(entity);
  if (budget !== undefined && tiles > budget.remaining) return reject('move exceeds movement budget');
  return OK;
}

export function canPlayCard(world: World, entity: EntityId, energyCost: number): Validation {
  if (!isPlayerPhase(world)) return reject('not the player turn');
  const pool = world.store(ResourcePool).get(entity);
  if (pool === undefined || energyCost > pool.energy) return reject('not enough energy');
  return OK;
}

export function canPlaySpell(world: World, entity: EntityId, manaCost: number): Validation {
  if (!isPlayerPhase(world)) return reject('not the player turn');
  const pool = world.store(ResourcePool).get(entity);
  if (pool === undefined || manaCost > pool.mana) return reject('not enough mana');
  return OK;
}

/**
 * The Turn Engine system (ADR-005). Validates and applies player actions during
 * the player phase, and on EndTurn runs the enemy phase and opens the next round.
 * Movement is delegated: a valid RequestMove deducts the budget and submits the
 * low-level MoveTo that the movement system executes the same step.
 * Card/spell EFFECTS are a later seam — here only their resource cost is paid.
 */
export function makeTurnSystem(grid: HexGrid): System {
  return (world) => {
    const te = turnActor(world);
    if (te === undefined) return;
    const turn = world.store(TurnState).get(te);
    if (turn === undefined) return;

    for (const cmd of [...world.commands()]) {
      switch (cmd.kind) {
        case 'RequestMove': {
          const to: Hex = { q: cmd.q, r: cmd.r };
          const v = canMove(world, grid, cmd.entity, to);
          if (!v.ok) {
            world.emit({ kind: 'ActionRejected', reason: v.reason });
            break;
          }
          const tiles = moveTiles(world, grid, cmd.entity, to);
          if (tiles === 0) break; // already standing there — no-op
          const budget = world.store(MovementBudget).get(cmd.entity);
          if (budget !== undefined) budget.remaining -= tiles;
          world.submit({ kind: 'MoveTo', entity: cmd.entity, q: cmd.q, r: cmd.r });
          world.emit({ kind: 'ResourceChanged', entity: cmd.entity });
          break;
        }
        case 'PlayCard': {
          const cost = cmd.energyCost ?? 0;
          const v = canPlayCard(world, cmd.entity, cost);
          if (!v.ok) {
            world.emit({ kind: 'ActionRejected', reason: v.reason });
            break;
          }
          const pool = world.store(ResourcePool).get(cmd.entity);
          if (pool !== undefined) spendEnergy(pool, cost);
          // Cost + phase only here. The card system (registered after this one) reacts to the
          // CardPlayed event below to move the played instance hand -> discard and resolve its
          // effect; we just echo the played instance so it can find it.
          world.emit({
            kind: 'CardPlayed',
            entity: cmd.entity,
            cardId: cmd.cardId,
            ...(cmd.cardEntity !== undefined ? { cardEntity: cmd.cardEntity } : {}),
            ...(cmd.cardTargets !== undefined ? { cardTargets: cmd.cardTargets } : {}),
            ...(cmd.targets !== undefined ? { targets: cmd.targets } : {}),
          });
          world.emit({ kind: 'ResourceChanged', entity: cmd.entity });
          break;
        }
        case 'PlaySpell': {
          const cost = cmd.manaCost ?? 0;
          const v = canPlaySpell(world, cmd.entity, cost);
          if (!v.ok) {
            world.emit({ kind: 'ActionRejected', reason: v.reason });
            break;
          }
          const pool = world.store(ResourcePool).get(cmd.entity);
          if (pool !== undefined) spendMana(pool, cost);
          world.emit({ kind: 'SpellCast', entity: cmd.entity, spellId: cmd.spellId });
          world.emit({ kind: 'ResourceChanged', entity: cmd.entity });
          break;
        }
        case 'EndTurn': {
          if (turn.phase !== 'player') {
            world.emit({ kind: 'ActionRejected', reason: 'not the player turn' });
            break;
          }
          endPlayerTurn(world, te, turn);
          break;
        }
      }
    }
  };
}

/** Close the player turn, run the enemy phase, then open the next player turn. */
function endPlayerTurn(world: World, te: EntityId, turn: TurnStateData): void {
  turn.phase = 'enemy';
  world.emit({ kind: 'TurnEnded', phase: 'player' });
  world.emit({ kind: 'TurnStarted', phase: 'enemy' });

  runEnemyTurn(world);

  world.emit({ kind: 'TurnEnded', phase: 'enemy' });
  turn.phase = 'player';
  turn.round += 1;

  // Refill/regen/reset FIRST, so the start-of-turn checkpoint (the autosave the scene wires on the
  // TurnStarted{player} event below) captures the fresh turn-start resources, not last turn's leftovers.
  const pool = world.store(ResourcePool).get(te);
  if (pool !== undefined) {
    refillEnergy(pool);
    regenMana(pool);
    world.emit({ kind: 'ResourceChanged', entity: te });
  }
  const budget = world.store(MovementBudget).get(te);
  if (budget !== undefined) budget.remaining = budget.max;

  world.emit({ kind: 'RoundStarted', round: turn.round });
  world.emit({ kind: 'TurnStarted', phase: 'player', actor: te });
}

/**
 * Resolve enemies SEQUENTIALLY in deterministic ascending-id order (the brief's
 * decision: no simultaneous strike). isAlive is re-checked so an enemy removed
 * earlier in the turn is skipped. The per-enemy action is filled in by the Enemy
 * AI feature — this loop is the seam it plugs into.
 */
function runEnemyTurn(world: World): void {
  for (const enemy of world.entitiesWith(Enemy)) {
    if (!world.isAlive(enemy)) continue;
    // The Enemy AI feature resolves this enemy's action here.
  }
}
