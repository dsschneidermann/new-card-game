import type { EntityId, GameEvent, Hex } from '@core/index';

/**
 * Replays movement hop-logs over real time so the sprite VISUALLY LAGS the sim (which commits a
 * whole move in one advance). On a MovementStarted it walks a per-entity cursor along the path, one
 * hex every stepMs; buildCharacterViews reads the cursor (visualHexes) to place + 'walk' the sprite,
 * and SceneSync's per-target tween does the smooth slide. When the cursor reaches the end (or the
 * Trap/Status interruptIndex) the move settles and the sprite rests on the committed HexPosition.
 * Phaser-free: it owns no sprites, only timing + path progress, driven by the scene's frame delta.
 */
interface ActiveMove {
  readonly path: readonly Hex[];
  index: number; // the hex the sprite is currently heading TO (path[index])
  readonly lastIndex: number; // the final hop index (interruptIndex, else the path end)
  elapsedMs: number;
}

export class MoveAnimator {
  private readonly active = new Map<EntityId, ActiveMove>();

  constructor(private readonly stepMs: number) {}

  /** Pick up this step's MovementStarted events and begin replaying each move. */
  ingest(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.kind !== 'MovementStarted') continue;
      const lastIndex = e.interruptIndex ?? e.path.length - 1;
      if (lastIndex < 1) continue; // nothing to walk
      // Head to the first step immediately (the sprite is still at path[0] from the previous frame).
      this.active.set(e.entity, { path: e.path, index: 1, lastIndex, elapsedMs: 0 });
    }
  }

  /** Advance the visible hops by `dtMs`; a move settles one step after reaching its last hop. */
  update(dtMs: number): void {
    for (const [id, m] of [...this.active]) {
      m.elapsedMs += dtMs;
      while (m.elapsedMs >= this.stepMs) {
        m.elapsedMs -= this.stepMs;
        if (m.index < m.lastIndex) {
          m.index += 1; // head to the next hex
        } else {
          this.active.delete(id); // the final hop's slide has elapsed — settle on HexPosition
          break;
        }
      }
    }
  }

  /** True while `entity` (or any entity, if omitted) is mid-replay. Drives the input lock. */
  isMoving(entity?: EntityId): boolean {
    return entity === undefined ? this.active.size > 0 : this.active.has(entity);
  }

  /** The current visual hex per replaying entity — the hex its sprite is sliding toward. */
  visualHexes(): Map<EntityId, Hex> {
    const out = new Map<EntityId, Hex>();
    for (const [id, m] of this.active) {
      const hex = m.path[m.index];
      if (hex !== undefined) out.set(id, hex);
    }
    return out;
  }
}
