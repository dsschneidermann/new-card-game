import { describe, it, expect } from 'vitest';
import { selectLevelId, FOREST_ID, SPACE_ID } from '@core/index';

describe('selectLevelId (demo forest/space pick)', () => {
  it('is deterministic for a seed and only ever returns a known level id', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const id = selectLevelId(seed);
      expect(id).toBe(selectLevelId(seed));
      expect(id === FOREST_ID || id === SPACE_ID).toBe(true);
    }
  });

  it('picks BOTH levels across seeds (a real ~50/50 split, not a constant)', () => {
    let forest = 0;
    let space = 0;
    for (let seed = 0; seed < 500; seed += 1) {
      if (selectLevelId(seed) === FOREST_ID) forest += 1;
      else space += 1;
    }
    expect(forest).toBeGreaterThan(0);
    expect(space).toBeGreaterThan(0);
  });
});
