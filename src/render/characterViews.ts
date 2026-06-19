import {
  defineComponent,
  HexPosition,
  MovePath,
  FacingState,
  hexToPixel,
  type ComponentType,
  type HexLayout,
  type EntityId,
  type World,
} from '@core/index';

/** A renderable view of an entity, derived from component state. */
export interface RenderableView {
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly texture: string;
  /** Optional frame index for a static multi-frame texture. */
  readonly frame?: number;
  /** Optional animation key to play (looping); takes precedence over frame. */
  readonly anim?: string;
  /** Mirror horizontally — e.g. a right-facing sheet shown facing left. */
  readonly flipX?: boolean;
  /** Display scale (1 = native frame size). */
  readonly scale?: number;
}

/** Presentation data: texture + how to animate it. animBase (e.g. 'player') drives state+facing anims. */
export interface RenderableData {
  texture: string;
  frame?: number;
  animBase?: string;
  scale?: number;
}
// Transient (not persisted — feature 06): presentation only, rebuilt on load
// by re-attaching Renderable to restored entities.
export const Renderable: ComponentType<RenderableData> = defineComponent<RenderableData>(
  'Renderable',
  { persistent: false },
);

/**
 * Build the per-entity render views from world state (feature 14) — the home of
 * the character animation logic, out of the scene. For an animated entity
 * (animBase set) it composes `${animBase}.${walk|idle}.right` from MovePath
 * presence and mirrors via flipX from its Facing, since the single right-facing
 * sheet serves both directions. Pure and Phaser-free (unit-testable); SceneSync
 * consumes the result and reconciles it to sprites.
 */
export function* buildCharacterViews(world: World, layout: HexLayout): Generator<RenderableView> {
  const positions = world.store(HexPosition);
  const paths = world.store(MovePath);
  const facings = world.store(FacingState);
  for (const [id, r] of world.store(Renderable).entries()) {
    const pos = positions.get(id);
    if (pos === undefined) continue;
    const { x, y } = hexToPixel(layout, pos.hex);
    if (r.animBase !== undefined) {
      const facing = facings.get(id)?.facing ?? 'right';
      const state = paths.has(id) ? 'walk' : 'idle';
      yield {
        id,
        x,
        y,
        texture: r.texture,
        anim: `${r.animBase}.${state}.right`,
        flipX: facing === 'left',
        ...(r.scale !== undefined ? { scale: r.scale } : {}),
      };
    } else {
      yield { id, x, y, texture: r.texture, ...(r.frame !== undefined ? { frame: r.frame } : {}) };
    }
  }
}
