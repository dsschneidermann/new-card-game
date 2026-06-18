import type { EntityId } from './entity';

/** Marker for a plain, serializable component data record. */
export type Component = object;

/** A typed handle identifying a component store. Create one via defineComponent. */
export interface ComponentType<T> {
  readonly name: string;
  /** Phantom field for type inference only; never assigned at runtime. */
  readonly __t?: T;
}

/** Define a component type. The returned token's identity keys its store. */
export function defineComponent<T>(name: string): ComponentType<T> {
  return { name };
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
