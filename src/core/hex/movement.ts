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
export interface MovePathData {
  readonly path: readonly Hex[];
  index: number;
}
export interface FacingData {
  facing: Facing;
}

/** An entity's hex location (persisted — feature 06). */
export const HexPosition: ComponentType<HexPositionData> = defineComponent<HexPositionData>('HexPosition');
/**
 * A queued route the entity walks, one hex per step. Transient (not persisted):
 * autosave happens on turn/level boundaries, not mid-hop, and a route is
 * replanned from the restored HexPosition when the next MoveTo arrives.
 */
export const MovePath: ComponentType<MovePathData> = defineComponent<MovePathData>('MovePath', {
  persistent: false,
});
/** Which way the entity faces (left/right), set from move intent (persisted). */
export const FacingState: ComponentType<FacingData> = defineComponent<FacingData>('Facing');

/**
 * Movement system (ADR-006 select-destination). A MoveTo command plans a path
 * from the entity's HexPosition to the target hex and attaches a MovePath; each
 * advance() then steps the entity one hex along its route, emits EntityStepped,
 * and clears the MovePath on arrival. Facing is set ONCE from the move's overall
 * intent (start->target horizontal delta) — not per hop — so a vertical zigzag
 * does not flicker the facing. The level's HexGrid and HexLayout are injected so
 * the system stays pure and unit-testable.
 */
export function makeMovementSystem(grid: HexGrid, layout: HexLayout): System {
  return (world) => {
    const positions = world.store(HexPosition);
    const paths = world.store(MovePath);
    const facings = world.store(FacingState);

    // 1) Plan a route for any MoveTo commands; set facing from the move intent.
    for (const cmd of world.commands()) {
      if (cmd.kind !== 'MoveTo') continue;
      const pos = positions.get(cmd.entity);
      if (pos === undefined) continue;
      const target: Hex = { q: cmd.q, r: cmd.r };
      const route = findPath(grid, pos.hex, target);
      if (route.length < 2) continue;
      const dx = hexToPixel(layout, target).x - hexToPixel(layout, pos.hex).x;
      const prev = facings.get(cmd.entity)?.facing ?? 'right';
      facings.add(cmd.entity, { facing: facingFromIntent(prev, dx) });
      paths.add(cmd.entity, { path: route, index: 1 });
    }

    // 2) Step every entity that has a MovePath one hex along its route.
    for (const [entity, mp] of [...paths.entries()]) {
      const next = mp.path[mp.index];
      if (next === undefined) {
        paths.remove(entity);
        continue;
      }
      const pos = positions.get(entity);
      if (pos !== undefined) pos.hex = next;
      world.emit({ kind: 'EntityStepped', entity, q: next.q, r: next.r });
      mp.index += 1;
      if (mp.index >= mp.path.length) paths.remove(entity);
    }
  };
}
