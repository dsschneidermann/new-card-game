/**
 * The level ids + the pure level-selection seam. WorldScene picks an id, supplies the run seed, and builds
 * the matching Level via the renderer's makeLevel(id, seed). The ids live here (Phaser-free) so selectLevelId
 * stays unit-testable without pulling in the Level classes.
 */
export const FOREST_ID = 'forest';

/**
 * Choose which level a fresh run starts in. The forest is the first — and currently only — production level,
 * so this always returns FOREST_ID; it is the single place a future level would join the selection (the run
 * seed is taken so a seed-driven choice can slot in here without touching WorldScene).
 */
export function selectLevelId(_seed: number): string {
  return FOREST_ID;
}
