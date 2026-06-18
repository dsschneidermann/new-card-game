import type { World } from '@core/index';

/**
 * Presentation-layer bridge (ADR-002): reads ECS component state and reflects
 * it onto Phaser display objects so scenes never own authoritative state. The
 * concrete sync systems arrive with the rendering work; this is the seam.
 */
export interface Renderer {
  sync(world: World): void;
}
