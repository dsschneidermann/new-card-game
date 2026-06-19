import { EntityAllocator, type EntityId } from './entity';
import { MapComponentStore, type ComponentStore, type ComponentType } from './component';
import { makeRng, type SeededRNG } from './rng';
import { CommandQueue, EventBus } from './queue';
import type { Command } from './commands';
import type { GameEvent } from './events';

/** Read-only context handed to each system invocation within a step. */
export interface StepContext {
  /** Monotonic count of advance() calls (1-based). */
  readonly step: number;
  readonly rng: SeededRNG;
}

/** A system advances the simulation by reading/writing the World. */
export type System = (world: World, ctx: StepContext) => void;

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

/** Engine-internal surface used by advance(); not part of the public API. */
interface InternalWorld extends World {
  runStep(commands: readonly Command[]): GameEvent[];
}

class WorldImpl implements InternalWorld {
  readonly rng: SeededRNG;
  private readonly allocator = new EntityAllocator();
  private readonly stores = new Map<ComponentType<unknown>, ComponentStore<unknown>>();
  private readonly systems: System[] = [];
  private readonly cmds = new CommandQueue();
  private readonly bus = new EventBus();
  private stepCount = 0;

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
    this.stepCount += 1;
    const ctx: StepContext = { step: this.stepCount, rng: this.rng };
    for (const system of this.systems) system(this, ctx);
    const events = this.bus.drain();
    this.cmds.drain();
    return events;
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
