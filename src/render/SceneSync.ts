import Phaser from 'phaser';
import type { EntityId } from '@core/index';

/** A renderable view of an entity, derived from component state by the scene. */
export interface RenderableView {
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly texture: string;
  /** Optional frame index for multi-frame textures (spritesheets/strips). */
  readonly frame?: number;
}

/**
 * Presentation bridge (ADR-002): reconciles renderable views to Phaser sprites
 * — creating new ones, tweening existing ones toward their new stand-point, and
 * destroying sprites whose entity is gone. The ECS never references sprites; the
 * scene calls sync() after each step. Sprites stand ON their hex (bottom-anchored)
 * and are depth-sorted by screen-Y so nearer (lower) sprites draw in front.
 * Tweens are only (re)started when an entity's target changes, so calling sync()
 * every frame during a hop does not spawn duplicate tweens.
 */
export class SceneSync {
  private readonly sprites = new Map<EntityId, Phaser.GameObjects.Sprite>();
  private readonly targets = new Map<EntityId, { x: number; y: number }>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly stepDurationMs = 110,
  ) {}

  sync(views: Iterable<RenderableView>): void {
    const seen = new Set<EntityId>();
    for (const v of views) {
      seen.add(v.id);
      let sprite = this.sprites.get(v.id);
      if (sprite === undefined) {
        sprite = this.scene.add.sprite(v.x, v.y, v.texture, v.frame).setOrigin(0.5, 0.85);
        this.sprites.set(v.id, sprite);
        this.targets.set(v.id, { x: v.x, y: v.y });
      } else {
        const target = this.targets.get(v.id);
        if (target === undefined || target.x !== v.x || target.y !== v.y) {
          this.scene.tweens.add({ targets: sprite, x: v.x, y: v.y, duration: this.stepDurationMs });
          this.targets.set(v.id, { x: v.x, y: v.y });
        }
      }
      sprite.setDepth(v.y);
    }
    for (const [id, sprite] of this.sprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
        this.targets.delete(id);
      }
    }
  }
}
