import { describe, it, expect } from 'vitest';
import { selectLevelId, FOREST_ID } from '@core/index';

describe('selectLevelId (level-selection seam)', () => {
  it('always selects the forest (the first/only production level), for any seed', () => {
    for (let seed = 0; seed < 500; seed += 1) expect(selectLevelId(seed)).toBe(FOREST_ID);
  });
});
