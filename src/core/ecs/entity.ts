/** Opaque, branded entity id (a number at runtime). */
export type EntityId = number & { readonly __brand: 'EntityId' };

/**
 * Allocates monotonically increasing entity ids that are NEVER reused within a
 * run (decision Q3): one id maps to one entity for the whole run, so a stale
 * handle simply resolves to not-found rather than aliasing a different entity.
 */
export class EntityAllocator {
  private nextId = 1;
  private readonly alive = new Set<EntityId>();

  create(): EntityId {
    const id = this.nextId as EntityId;
    this.nextId += 1;
    this.alive.add(id);
    return id;
  }

  destroy(id: EntityId): void {
    this.alive.delete(id);
  }

  isAlive(id: EntityId): boolean {
    return this.alive.has(id);
  }

  /** Living entities in ascending id order (deterministic). */
  living(): EntityId[] {
    return [...this.alive].sort((a, b) => a - b);
  }
}
