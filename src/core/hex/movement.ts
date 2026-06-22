import { defineComponent, type ComponentType } from '../ecs/component';
import type { System } from '../ecs/world';
import { facingFromIntent, type Facing } from '../sprite';
import type { Hex } from './hex';
import type { HexGrid } from './grid';
import { hexToPixel, type HexLayout } from './layout';
import { findPath } from './path';

export interface HexPositionData {
  hex: Hex;
}
export interface FacingData {
  facing: Facing;
}

/** An entity's hex location (persisted — feature 06). */
export const HexPosition: ComponentType<HexPositionData> = defineComponent<HexPositionData>('HexPosition');
/** Which way the entity faces (left/right), set from move intent (persisted). */
export const FacingState: ComponentType<FacingData> = defineComponent<FacingData>('Facing');

/**
 * The facing for an action aimed at hex `to` from hex `from`: the sign of the horizontal pixel
 * delta between their centres (a same-column target keeps `prev`). Shared by the movement system
 * (a move's intent) and attack plays (the target or clicked hex). Presentation-only.
 */
export function facingToward(layout: HexLayout, prev: Facing, from: Hex, to: Hex): Facing {
  const dx = hexToPixel(layout, to).x - hexToPixel(layout, from).x;
  return facingFromIntent(prev, dx);
}

/**
 * Movement Intent (ADR-006 select-destination; Movement Resolution feature). A MoveTo resolves a
 * WHOLE move in ONE advance(): plan the shortest path, set facing ONCE from the overall intent
 * (start->target horizontal delta, so a vertical zigzag never flickers the facing), commit
 * HexPosition to the final hex, and emit the bracketed hop-log — MovementStarted (the planned path)
 * -> one EntityStepped per hop -> MovementEnded. Hops stay discrete EVENTS but are emitted together
 * here; a render-side MoveAnimator replays them over real time so the sprite lags the committed
 * position (the sim no longer steps across ticks, and there is no MovePath component).
 *
 * Trap/Status seam: a future system runs AFTER this planning, reads the planned path, and truncates
 * it at the first trap/status hex (setting MovementStarted.interruptIndex + MovementEnded.interrupted).
 * None exists yet, so the full path resolves. The grid + layout are injected to keep the system pure.
 */
export function makeMovementSystem(grid: HexGrid, layout: HexLayout): System {
  return (world) => {
    const positions = world.store(HexPosition);
    const facings = world.store(FacingState);
    for (const cmd of world.commands()) {
      if (cmd.kind !== 'MoveTo') continue;
      const pos = positions.get(cmd.entity);
      if (pos === undefined) continue;
      const target: Hex = { q: cmd.q, r: cmd.r };
      const path = findPath(grid, pos.hex, target);
      if (path.length < 2) continue; // unreachable, blocked, or already there — no move
      const prev = facings.get(cmd.entity)?.facing ?? 'right';
      facings.add(cmd.entity, { facing: facingToward(layout, prev, pos.hex, target) });
      const last = path[path.length - 1] as Hex;
      pos.hex = last; // commit the final position atomically
      world.emit({ kind: 'MovementStarted', entity: cmd.entity, path });
      for (let i = 1; i < path.length; i += 1) {
        const hop = path[i] as Hex;
        world.emit({ kind: 'EntityStepped', entity: cmd.entity, q: hop.q, r: hop.r });
      }
      world.emit({ kind: 'MovementEnded', entity: cmd.entity, at: last, interrupted: false });
    }
  };
}
