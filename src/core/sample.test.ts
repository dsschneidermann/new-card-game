import { describe, it, expect } from 'vitest';
import { createWorld } from '@core/index';

describe('core skeleton', () => {
  it('creates an empty world', () => {
    const world = createWorld();
    expect(world.entities.size).toBe(0);
  });
});
