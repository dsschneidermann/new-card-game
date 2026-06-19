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
 * Presentation bridge (ADR-002): reconciles a set of renderable views to Phaser
 * sprites — creating new ones, tweening existing ones toward their new position,
 * and destroying sprites whose entity is gone. The ECS never references sprites;
 * the scene calls sync() after each advance(). Phaser's own clock drives the
 * tweens, so no timing code is needed here.
 */
export class SceneSync {
  private readonly sprites = new Map<EntityId, Phaser.GameObjects.Sprite>();

  constructor(private readonly scene: Phaser.Scene) {}

  sync(views: Iterable<RenderableView>): void {
    const seen = new Set<EntityId>();
    for (const v of views) {
      seen.add(v.id);
      const existing = this.sprites.get(v.id);
      if (existing === undefined) {
        this.sprites.set(v.id, this.scene.add.sprite(v.x, v.y, v.texture, v.frame));
      } else if (existing.x !== v.x || existing.y !== v.y) {
        this.scene.tweens.add({ targets: existing, x: v.x, y: v.y, duration: 150 });
      }
    }
    for (const [id, sprite] of this.sprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
  }
}
