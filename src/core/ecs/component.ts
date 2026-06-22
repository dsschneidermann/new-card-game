import type { EntityId } from './entity';

/** Marker for a plain, serializable component data record. */
export type Component = object;

/** A typed handle identifying a component store. Create one via defineComponent. */
export interface ComponentType<T> {
  readonly name: string;
  /**
   * Whether this component is part of the saved game state (feature 06). The
   * generic serializer writes only persistent components; render/transient
   * components (e.g. Renderable, AnimState) set this false and
   * are rebuilt on load rather than persisted.
   */
  readonly persistent: boolean;
  /** Phantom field for type inference only; never assigned at runtime. */
  readonly __t?: T;
}

/** Options for defineComponent. */
export interface ComponentOptions {
  /** Include in the save state? Defaults to true. */
  readonly persistent?: boolean;
}

/**
 * Name -> token registry (feature 06). Lets the serializer map a saved
 * component name back to its store token on restore. Component names are
 * globally unique by design, so registration is idempotent: a repeat call with
 * the same name returns the original token (preserving store identity across
 * module re-imports), and a conflicting persistent flag is a programming error.
 */
const registry = new Map<string, ComponentType<unknown>>();

/** Define a component type. The returned token's identity keys its store. */
export function defineComponent<T>(name: string, opts?: ComponentOptions): ComponentType<T> {
  const existing = registry.get(name);
  if (existing !== undefined) {
    if (opts?.persistent !== undefined && existing.persistent !== opts.persistent) {
      throw new Error(`defineComponent: "${name}" redefined with a different persistent flag`);
    }
    return existing as ComponentType<T>;
  }
  const type: ComponentType<T> = { name, persistent: opts?.persistent ?? true };
  registry.set(name, type as ComponentType<unknown>);
  return type;
}

/** Look up a registered component token by its name (used to restore a save). */
export function componentByName(name: string): ComponentType<unknown> | undefined {
  return registry.get(name);
}

/** Per-component-type storage keyed by entity id. */
export interface ComponentStore<T> {
  add(e: EntityId, c: T): void;
  get(e: EntityId): T | undefined;
  has(e: EntityId): boolean;
  remove(e: EntityId): void;
  entries(): Iterable<[EntityId, T]>;
}

/** Map-backed ComponentStore (decision Q1: map-of-stores). */
export class MapComponentStore<T> implements ComponentStore<T> {
  private readonly data = new Map<EntityId, T>();

  add(e: EntityId, c: T): void {
    this.data.set(e, c);
  }
  get(e: EntityId): T | undefined {
    return this.data.get(e);
  }
  has(e: EntityId): boolean {
    return this.data.has(e);
  }
  remove(e: EntityId): void {
    this.data.delete(e);
  }
  entries(): Iterable<[EntityId, T]> {
    return this.data.entries();
  }
}
