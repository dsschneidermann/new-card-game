import type { Command } from './commands';
import type { GameEvent } from './events';

/** Minimal FIFO buffer shared by the command queue and event bus. */
class Fifo<T> {
  private items: T[] = [];

  protected add(x: T): void {
    this.items.push(x);
  }

  /** Return all buffered items in FIFO order and empty the buffer. */
  drain(): T[] {
    const out = this.items;
    this.items = [];
    return out;
  }

  /** Read the buffered items without consuming them (same-step visibility). */
  peek(): readonly T[] {
    return this.items;
  }

  get size(): number {
    return this.items.length;
  }
}

/** Typed intents awaiting processing this step. */
export class CommandQueue extends Fifo<Command> {
  submit(cmd: Command): void {
    this.add(cmd);
  }
}

/** Domain events emitted this step; drained and returned by advance(). */
export class EventBus extends Fifo<GameEvent> {
  emit(ev: GameEvent): void {
    this.add(ev);
  }
}
