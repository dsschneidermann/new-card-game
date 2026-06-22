import type { EntityId, GameEvent, Hex } from '@core/index';

/** A single-hex move holds its one hop this much longer than a normal step so the walk anim can read. */
const SINGLE_HOP_EXTRA_MS = 100;

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
  readonly finalDwellMs: number; // how long to hold the last hex before settling (single hops dwell longer)
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
      // Hold the final hex for a normal step, plus an extra beat for a single-hop move so its one hop
      // lasts long enough for the walk animation to visibly play rather than snapping idle->idle.
      const finalDwellMs = this.stepMs + (lastIndex <= 2 ? SINGLE_HOP_EXTRA_MS : 0);
      // Head to the first step immediately (the sprite is still at path[0] from the previous frame).
      this.active.set(e.entity, { path: e.path, index: 1, lastIndex, elapsedMs: 0, finalDwellMs });
    }
  }

  /** Advance the visible hops by `dtMs`; a move settles once it has dwelt finalDwellMs on its last hex. */
  update(dtMs: number): void {
    for (const [id, m] of [...this.active]) {
      m.elapsedMs += dtMs;
      // Advance through the intermediate hops, one stepMs each.
      while (m.index < m.lastIndex && m.elapsedMs >= this.stepMs) {
        m.elapsedMs -= this.stepMs;
        m.index += 1;
      }
      // Hold the final hex for finalDwellMs, then settle onto the committed HexPosition.
      if (m.index >= m.lastIndex && m.elapsedMs >= m.finalDwellMs) {
        this.active.delete(id);
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
