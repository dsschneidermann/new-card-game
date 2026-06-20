import Phaser from 'phaser';
import { s, assetScale, resolveKey, type EntityId } from '@core/index';
import type { RenderableView } from './characterViews';

/**
 * Art-alignment nudge: some character sheets draw the figure off-centre in its frame,
 * so while that animation plays the sprite is pushed FORWARD (in its facing direction)
 * by this many base px — scaled via s() and mirrored by flipX. Keyed by animation key.
 */
const ANIM_FORWARD_PX: Record<string, number> = {
  'player.ready.right': 32,
  'player.attack1.right': 32,
};

/**
 * Presentation bridge (ADR-002): reconciles renderable views to Phaser sprites
 * — creating new ones, tweening existing ones toward their new stand-point,
 * playing animations, mirroring/scaling, and destroying sprites whose entity is
 * gone. The ECS never references sprites; the scene calls sync() after each step.
 * Sprites stand ON their hex (bottom-anchored) and are depth-sorted by screen-Y
 * so nearer (lower) sprites draw in front. Tweens and animations are only
 * (re)started when their inputs change, so calling sync() every frame is cheap.
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
      // Stand-point plus the per-animation forward nudge (mirrored with facing). Only x is
      // offset; depth still sorts by the true hex y so the nudge can't change draw order.
      const forward = v.anim !== undefined ? (ANIM_FORWARD_PX[v.anim] ?? 0) : 0;
      const px = v.x + (forward === 0 ? 0 : s(forward) * ((v.flipX ?? false) ? -1 : 1));
      const py = v.y;
      let sprite = this.sprites.get(v.id);
      if (sprite === undefined) {
        sprite = this.scene.add.sprite(px, py, v.texture, v.frame).setOrigin(0.5, 0.85);
        this.sprites.set(v.id, sprite);
        this.targets.set(v.id, { x: px, y: py });
      } else {
        const target = this.targets.get(v.id);
        if (target === undefined || target.x !== px || target.y !== py) {
          this.scene.tweens.add({ targets: sprite, x: px, y: py, duration: this.stepDurationMs });
          this.targets.set(v.id, { x: px, y: py });
        }
      }
      if (v.anim !== undefined) {
        if (sprite.anims.currentAnim?.key !== v.anim) sprite.play(v.anim);
      } else if (v.frame !== undefined) {
        sprite.setFrame(v.frame);
      }
      sprite.setFlipX(v.flipX ?? false);
      // Size the sprite from its asset definition's chosen scale, then s() for the
      // current resolution — so per-sprite scale lives in the manifest, not the scene.
      const art = resolveKey(v.texture)?.descriptor;
      const scale = art ? assetScale(art) : 1;
      sprite.setDisplaySize(s(sprite.frame.width * scale), s(sprite.frame.height * scale));
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
