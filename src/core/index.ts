/**
 * Pure, engine-agnostic game core (ADR-002).
 *
 * Nothing in `src/core` imports `phaser` or touches the DOM (enforced by
 * `corePurity.test.ts`). This barrel re-exports the Entity Component System &
 * Game Loop substrate and the screen-flow state machine that gameplay and the
 * UI shell build on.
 */

// Entity Component System & Game Loop (feature 02)
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

// Screen-flow state machine (feature 04)
export type { ScreenState, ScreenEvent, FlowContext, FlowResult, SavePresence } from './flow/screenFlow';
export { transition, INITIAL_SCREEN } from './flow/screenFlow';
