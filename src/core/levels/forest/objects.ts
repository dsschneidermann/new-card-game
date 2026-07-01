/**
 * The FOREST level's OBJECT REGISTRY (Phaser-free, ADR-002): the declarative list of obstruction props the
 * forest scatters, and the rules that drive their placement. This replaces the old two-lever scheme
 * (OBSTACLE_DENSITY + TALL_FRACTION) — each object now declares its own behavioural kind, terrain
 * constraint, mirroring, art-variant count, and placement amount. generateForestObstacles (forest.ts) walks
 * this list; the renderer (ForestLevel) maps each object id -> its art. Adding an object is one entry here
 * plus one art entry render-side — no generator/scene/shared-rule edits.
 *
 * Generation-relevant fields ONLY: no asset keys live here (art is render-owned, like the rest of the
 * pure/render split). `kind` stays the shared behavioural discriminator the grid-flag appliers read.
 */
import type { ObstacleKind } from '../../obstacles';

/** Which hex terrain class an object may occupy. 'any' includes grass, dirt, AND mixed-boundary hexes. */
export type ForestObjectTerrain = 'grass' | 'dirt' | 'any';

/**
 * How many of an object to place. 'density' rolls a probability PER ELIGIBLE HEX (so the effective count
 * scales with world area and with how many matching-terrain hexes the seed produces — like the old
 * per-cell OBSTACLE_DENSITY). 'count' places a seed-chosen quantity in [min, max] (e.g. a 0-or-1 landmark).
 */
export type ForestObjectPlacement =
  | { readonly kind: 'density'; readonly density: number }
  | { readonly kind: 'count'; readonly min: number; readonly max: number };

/** One placeable forest object: its identity + the rules that decide where and how many of it spawn. */
export interface ForestObjectDef {
  /** Durable id, persisted on the obstacle as `variant`; the renderer maps it to art. */
  readonly id: string;
  /** Behavioural kind (tall blocks move + sight; low blocks move, ranged fires over) — shared grid rules. */
  readonly kind: ObstacleKind;
  /** Which terrain class the object may sit on. */
  readonly terrain: ForestObjectTerrain;
  /** Whether it may be randomly horizontally mirrored (the renderer derives the flip per hex + seed). */
  readonly mirror: boolean;
  /** How many to place, and by what rule. */
  readonly placement: ForestObjectPlacement;
}

/**
 * The forest's placeable objects. ORDER matters: count-placement objects are placed before density ones (a
 * rare landmark gets primo eligible hexes before dense scatter fills them) — generateForestObstacles
 * enforces this, but listing them count-first keeps the intent visible. Densities are tuned to keep the
 * total scatter near the old ~0.05/cell; all values are tunable and surfaced at the visual-review gate.
 */
export const FOREST_OBJECTS: readonly ForestObjectDef[] = [
  { id: 'tall_grass', kind: 'tall', terrain: 'grass', mirror: true, placement: { kind: 'density', density: 0.075 } },
  { id: 'low_grass', kind: 'low', terrain: 'grass', mirror: true, placement: { kind: 'density', density: 0.10 } },
  { id: 'low_dirt', kind: 'low', terrain: 'dirt', mirror: true, placement: { kind: 'density', density: 0.05 } },
  { id: 'ruins', kind: 'low', terrain: 'grass', mirror: true, placement: { kind: 'count', min: 1, max: 4 } },
  { id: 'decals_grass', kind: 'none', terrain: 'grass', mirror: true, placement: { kind: 'density', density: 0.075 } },
  { id: 'decals_dirt', kind: 'none', terrain: 'dirt', mirror: true, placement: { kind: 'density', density: 0.20 } },
];

/** The object def for an id, or undefined if unknown (e.g. an obstacle from a since-removed object). */
export function forestObjectDef(id: string): ForestObjectDef | undefined {
  return FOREST_OBJECTS.find((d) => d.id === id);
}
