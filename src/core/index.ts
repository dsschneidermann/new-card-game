/**
 * Pure, engine-agnostic game core (ADR-002).
 *
 * Nothing in `src/core` imports `phaser` or touches the DOM (enforced by
 * `corePurity.test.ts`). This barrel re-exports the Entity Component System &
 * Game Loop substrate that every gameplay feature builds on as components and
 * systems over the World.
 */
export type { EntityId } from './ecs/entity';
export type { Component, ComponentType, ComponentStore } from './ecs/component';
export { defineComponent } from './ecs/component';
export type { SeededRNG } from './ecs/rng';
export { makeRng } from './ecs/rng';
export type { Command } from './ecs/commands';
export type { GameEvent } from './ecs/events';
export { CommandQueue, EventBus } from './ecs/queue';
export type { World, System, StepContext } from './ecs/world';
export { createWorld, advance } from './ecs/world';
