import { hash01 } from '../terrain/terrain';

/**
 * The level ids. WorldScene picks one (production: always the forest), supplies the run seed, and builds
 * the matching Level via the renderer's makeLevel(id, seed). The ids live here (pure) so selectLevelId is
 * unit-testable without pulling in the Phaser-coupled Level classes.
 */
export const FOREST_ID = 'forest';
export const SPACE_ID = 'space';

/**
 * Choose which level a fresh run starts in, deterministically from the run seed. DEMO BEHAVIOUR: a ~50/50
 * random pick between the forest and the (temporary) space level, to demonstrate the level seam. After the
 * code review this reverts to `return FOREST_ID` (the forest is the first/only production level) and the
 * space level is removed.
 */
export function selectLevelId(seed: number): string {
  return hash01(seed, 0, 0x5eed1d) < 0.5 ? SPACE_ID : FOREST_ID;
}
