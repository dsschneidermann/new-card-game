import { EntityAllocator, type EntityId } from './entity';
import {
  MapComponentStore,
  componentByName,
  type ComponentStore,
  type ComponentType,
} from './component';
import { makeRng, type SeededRNG } from './rng';
import { CommandQueue, EventBus } from './queue';
import type { Command } from './commands';
import type { GameEvent } from './events';

/** A system advances the simulation by reading/writing the World (its rng, stores, commands, events). */
export type System = (world: World) => void;

/**
 * The authoritative game state: an entity registry, per-type component stores,
 * a seeded RNG, a command queue, an event bus, and an ordered system list.
 * Phaser-free (ADR-002): rendering reads from a World but a World never knows
 * about Phaser.
 */
export interface World {
  createEntity(): EntityId;
  destroyEntity(e: EntityId): void;
  isAlive(e: EntityId): boolean;
  store<T>(type: ComponentType<T>): ComponentStore<T>;
  /** Living entities possessing ALL of the given component types, ascending. */
  entitiesWith(...types: ComponentType<unknown>[]): EntityId[];
  readonly rng: SeededRNG;
  addSystem(system: System): void;
  submit(cmd: Command): void;
  emit(ev: GameEvent): void;
  /** Commands pending in the current step (read-only view). */
  commands(): readonly Command[];
  /** Events emitted so far in the current step (read-only; same-step visible). */
  events(): readonly GameEvent[];
}

/** Engine-internal surface used by advance() and the serializer; not public API. */
interface InternalWorld extends World {
  runStep(commands: readonly Command[]): GameEvent[];
  /** Every populated component store, paired with its type token. */
  componentStores(): Array<[ComponentType<unknown>, ComponentStore<unknown>]>;
  /** Capture the entity-allocator state. */
  allocatorSnapshot(): { nextId: number; living: EntityId[] };
  /** Restore the entity-allocator state. */
  restoreAllocator(nextId: number, living: readonly EntityId[]): void;
}

class WorldImpl implements InternalWorld {
  readonly rng: SeededRNG;
  private readonly allocator = new EntityAllocator();
  private readonly stores = new Map<ComponentType<unknown>, ComponentStore<unknown>>();
  private readonly systems: System[] = [];
  private readonly cmds = new CommandQueue();
  private readonly bus = new EventBus();

  constructor(seed: number) {
    this.rng = makeRng(seed);
  }

  createEntity(): EntityId {
    return this.allocator.create();
  }

  destroyEntity(e: EntityId): void {
    this.allocator.destroy(e);
    for (const store of this.stores.values()) store.remove(e);
  }

  isAlive(e: EntityId): boolean {
    return this.allocator.isAlive(e);
  }

  store<T>(type: ComponentType<T>): ComponentStore<T> {
    const existing = this.stores.get(type);
    if (existing !== undefined) return existing as ComponentStore<T>;
    const created = new MapComponentStore<T>();
    this.stores.set(type, created as ComponentStore<unknown>);
    return created;
  }

  entitiesWith(...types: ComponentType<unknown>[]): EntityId[] {
    if (types.length === 0) return this.allocator.living();
    const first = types[0]!;
    const rest = types.slice(1);
    const out: EntityId[] = [];
    for (const [e] of this.store(first).entries()) {
      if (rest.every((t) => this.store(t).has(e))) out.push(e);
    }
    return out.sort((a, b) => a - b);
  }

  addSystem(system: System): void {
    this.systems.push(system);
  }

  submit(cmd: Command): void {
    this.cmds.submit(cmd);
  }

  emit(ev: GameEvent): void {
    this.bus.emit(ev);
  }

  commands(): readonly Command[] {
    return this.cmds.peek();
  }

  events(): readonly GameEvent[] {
    return this.bus.peek();
  }

  runStep(commands: readonly Command[]): GameEvent[] {
    for (const cmd of commands) this.cmds.submit(cmd);
    for (const system of this.systems) system(this);
    const events = this.bus.drain();
    this.cmds.drain();
    return events;
  }

  componentStores(): Array<[ComponentType<unknown>, ComponentStore<unknown>]> {
    return [...this.stores.entries()];
  }

  allocatorSnapshot(): { nextId: number; living: EntityId[] } {
    return this.allocator.snapshot();
  }

  restoreAllocator(nextId: number, living: readonly EntityId[]): void {
    this.allocator.restore(nextId, living);
  }
}

/**
 * Create an empty World seeded with the given RNG seed. Deterministic for a
 * given seed (the ADR-002 contract); callers wanting per-run variety pass a
 * clock-derived seed at the boundary rather than baking one in here.
 */
export function createWorld(seed: number): World {
  return new WorldImpl(seed);
}

/**
 * Run one deterministic simulation step: enqueue `commands`, run every
 * registered system once in registration order, then return the events emitted
 * this step. The command and event buffers are cleared afterwards, so each
 * advance() is self-contained — a turn resolves in a single call.
 */
export function advance(world: World, commands: readonly Command[] = []): GameEvent[] {
  return (world as InternalWorld).runStep(commands);
}

/**
 * A plain, JSON-serializable snapshot of the persistent World state: the live
 * RNG state, the entity allocator, and every PERSISTENT component
 * store. Render/transient components are excluded. This is the core run-state a
 * save is built from; each feature's data rides along automatically because
 * components are data-only (ADR-002).
 */
export interface WorldSnapshot {
  /** Live RNG state (see SeededRNG.state). */
  rng: number;
  /** The allocator's next id, so restored entities never collide with new ones. */
  nextEntityId: number;
  /** Living entity ids in ascending order. */
  living: EntityId[];
  /** Persistent component data keyed by component name. */
  components: Record<string, Array<[EntityId, unknown]>>;
}

/**
 * Capture a World as a WorldSnapshot. Only persistent components are written,
 * and their data is deep-cloned through JSON so the snapshot neither aliases
 * live state nor smuggles in non-serializable values — non-serializable
 * component data surfaces here (and in the per-feature round-trip tests) rather
 * than at save time.
 */
export function serializeWorld(world: World): WorldSnapshot {
  const w = world as InternalWorld;
  const components: Record<string, Array<[EntityId, unknown]>> = {};
  for (const [type, store] of w.componentStores()) {
    if (!type.persistent) continue;
    const entries = [...store.entries()];
    if (entries.length === 0) continue;
    components[type.name] = entries.map(([e, c]) => [e, JSON.parse(JSON.stringify(c)) as unknown]);
  }
  const alloc = w.allocatorSnapshot();
  return { rng: world.rng.state(), nextEntityId: alloc.nextId, living: alloc.living, components };
}

/**
 * Rebuild a World from a WorldSnapshot: a fresh world with the RNG stream and
 * allocator resumed, and every recognised persistent component re-added. A
 * component name no longer in the registry is skipped (component-granular
 * forward/backward tolerance).
 */
export function restoreWorld(snap: WorldSnapshot): World {
  const world = createWorld(0);
  world.rng.setState(snap.rng);
  (world as InternalWorld).restoreAllocator(snap.nextEntityId, snap.living);
  for (const [name, entries] of Object.entries(snap.components)) {
    const type = componentByName(name);
    if (type === undefined) continue;
    const store = world.store(type);
    for (const [e, data] of entries) store.add(e, data);
  }
  return world;
}
