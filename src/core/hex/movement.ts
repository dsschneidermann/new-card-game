import { defineComponent, type ComponentType } from '../ecs/component';
import type { System } from '../ecs/world';
import type { Hex } from './hex';
import type { HexGrid } from './grid';
import { findPath } from './path';

export interface HexPositionData {
  hex: Hex;
}
export interface MovePathData {
  readonly path: readonly Hex[];
  index: number;
}

/** An entity's hex location. */
export const HexPosition: ComponentType<HexPositionData> = defineComponent<HexPositionData>('HexPosition');
/** A queued route the entity walks, one hex per step. */
export const MovePath: ComponentType<MovePathData> = defineComponent<MovePathData>('MovePath');

/**
 * Movement system (ADR-006 select-destination). A MoveTo command plans a BFS
 * route from the entity's HexPosition to the target hex and attaches a
 * MovePath; each advance() then steps the entity one hex along its route,
 * emits EntityStepped, and clears the MovePath on arrival. A MoveTo to a
 * non-walkable or unreachable hex plans nothing. The level's HexGrid is
 * injected so the system stays pure and unit-testable.
 */
export function makeMovementSystem(grid: HexGrid): System {
  return (world) => {
    const positions = world.store(HexPosition);
    const paths = world.store(MovePath);

    // 1) Plan a route for any MoveTo commands submitted this step.
    for (const cmd of world.commands()) {
      if (cmd.kind !== 'MoveTo') continue;
      const pos = positions.get(cmd.entity);
      if (pos === undefined) continue;
      const route = findPath(grid, pos.hex, { q: cmd.q, r: cmd.r });
      if (route.length >= 2) paths.add(cmd.entity, { path: route, index: 1 });
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
