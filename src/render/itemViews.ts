import {
  defineComponent,
  HexPosition,
  hexToPixel,
  type ComponentType,
  type HexLayout,
  type EntityId,
  type World,
} from '@core/index';
import type { RenderableView } from './characterViews';

/**
 * Item / prop presentation data (Chest Rewards feature). The PROP counterpart to characterViews' Renderable:
 * a static texture+frame plus an optional facing flip and an optional one-shot/looping animation key. Unlike
 * a character (whose anim is composed from an animBase state machine — walk/idle/ready/attack), a prop's
 * animation is an EVENT-DRIVEN one-shot (a chest opening; later a door opening/closing) named directly. Bump
 * `animEpoch` to re-play a one-shot whose key is unchanged (e.g. re-opening a chest on a second visit).
 * Transient (not persisted): rebuilt on load by the level re-attaching it to restored prop entities.
 */
export interface ItemRenderableData {
  texture: string;
  /** Static frame index (when not animating). */
  frame?: number;
  /** Mirror horizontally — props spawn facing a random left/right direction. */
  facing?: 'left' | 'right';
  /** A one-shot/looping animation key to play (e.g. 'chest_1_opening.right'); takes precedence over frame. */
  anim?: string;
  /** Bump to force a one-shot `anim` to re-play even when its key is unchanged. */
  animEpoch?: number;
}
export const ItemRenderable: ComponentType<ItemRenderableData> = defineComponent<ItemRenderableData>(
  'ItemRenderable',
  { persistent: false },
);

/**
 * Build the per-entity render views for ITEM / PROP entities (chests today; doors and other props later) —
 * the prop counterpart to buildCharacterViews, kept separate so characters and props evolve independently.
 * Each ItemRenderable+HexPosition entity yields a RenderableView (texture/frame/anim/animEpoch passthrough;
 * flipX from facing). Props don't move, so there is no movement-hex argument. Pure and Phaser-free
 * (unit-testable); SceneSync consumes the result alongside the character views and reconciles both to sprites.
 */
export function* buildItemViews(world: World, layout: HexLayout): Generator<RenderableView> {
  const positions = world.store(HexPosition);
  for (const [id, r] of world.store(ItemRenderable).entries()) {
    const pos = positions.get(id);
    if (pos === undefined) continue;
    const { x, y } = hexToPixel(layout, pos.hex);
    yield {
      id,
      x,
      y,
      texture: r.texture,
      ...(r.frame !== undefined ? { frame: r.frame } : {}),
      ...(r.anim !== undefined ? { anim: r.anim } : {}),
      ...(r.animEpoch !== undefined ? { animEpoch: r.animEpoch } : {}),
      flipX: r.facing === 'left',
    };
  }
}
