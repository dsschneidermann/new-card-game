import { defineComponent, type ComponentType } from '../ecs/component';

/**
 * The active level of a run: which level it is and the seed its terrain + content were generated from.
 * Persisted on the player so a resumed run rebuilds the SAME level (right terrain + obstacle art) and
 * regenerates its non-persisted terrain identically. Without it a resumed run could not tell which level it
 * was. Pure data (ADR-002); the renderer maps the id to a Level via makeLevel(id, seed).
 */
export interface LevelStateData {
  readonly id: string;
  /** The run seed used to generate this level's terrain + procedural placement (so resume regenerates terrain identically). */
  readonly seed: number;
}

export const LevelState: ComponentType<LevelStateData> = defineComponent<LevelStateData>('LevelState');
