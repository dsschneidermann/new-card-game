import { describe, it, expect } from 'vitest';
import type { GameEvent, EntityId, Hex } from '@core/index';
import { MoveAnimator } from './MoveAnimator';

const STEP = 110;
const e = 1 as EntityId;
const started = (path: Hex[]): GameEvent[] => [{ kind: 'MovementStarted', entity: e, path }];

describe('MoveAnimator', () => {
  it('replays a multi-hop move one hex per stepMs, settling after the last hop', () => {
    const a = new MoveAnimator(STEP);
    a.ingest(started([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }])); // 3 hops
    expect(a.visualHexes().get(e)).toEqual({ q: 1, r: 0 }); // heading to the first step
    a.update(STEP);
    expect(a.visualHexes().get(e)).toEqual({ q: 2, r: 0 });
    a.update(STEP);
    expect(a.visualHexes().get(e)).toEqual({ q: 3, r: 0 }); // at the last hex
    expect(a.isMoving(e)).toBe(true);
    a.update(STEP); // the last hop's dwell elapses
    expect(a.isMoving(e)).toBe(false);
  });

  it('holds a short move (<=2 hops) longer than a normal step so the walk animation can show', () => {
    const a = new MoveAnimator(STEP);
    a.ingest(started([{ q: 0, r: 0 }, { q: 1, r: 0 }])); // a 1-hop (short) move
    expect(a.isMoving(e)).toBe(true);
    a.update(STEP);
    expect(a.isMoving(e)).toBe(true); // a normal step has elapsed but the extended dwell has not
    a.update(STEP * 2);
    expect(a.isMoving(e)).toBe(false); // settled within a couple more steps
  });
});
