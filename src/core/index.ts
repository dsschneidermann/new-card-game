/**
 * Pure, engine-agnostic game core (ADR-002).
 *
 * Nothing in `src/core` may import `phaser` or touch the DOM — the core-purity
 * guard test (`corePurity.test.ts`) enforces this so every system here is
 * unit-testable without a browser (ADR-003). The shapes below are the minimal
 * anchors the "Entity Component System & Game Loop" feature fills in.
 */

/** An entity is an opaque, stable id. */
export type Entity = number;

/** A component is a plain, serializable data record tagged by `type`. */
export interface Component {
  readonly type: string;
}

/** The authoritative game state: entity ids plus their component stores. */
export interface World {
  readonly entities: ReadonlySet<Entity>;
}

/** A system advances the simulation by reading and writing the World. */
export interface System {
  readonly name: string;
  update(world: World, dtMs: number): void;
}

/** Create an empty world. Real component stores arrive with the ECS feature. */
export function createWorld(): World {
  return { entities: new Set<Entity>() };
}
