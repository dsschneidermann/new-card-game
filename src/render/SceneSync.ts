import Phaser from 'phaser';
import { s, assetScale, resolveKey, type EntityId } from '@core/index';
import type { RenderableView } from './characterViews';

/**
 * Art-alignment nudge: some character sheets draw the figure off-centre in its frame,
 * so while that animation plays the figure is pushed FORWARD (in its facing direction)
 * by this many base px. Applied as a STATIC draw-origin shift — never the movement tween —
 * so the frame is simply drawn offset rather than sliding there; mirrored by flipX and
 * normalised to the frame so it scales with resolution. Keyed by animation key.
 */
const ANIM_FORWARD_PX: Record<string, number> = {
  'player.ready.right': 8,
  'player.attack1.right': 8,
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
      // Forward art nudge as a STATIC origin shift (never the movement tween): shift the draw
      // origin by a fraction of the frame so the off-centre sheet is drawn forward without
      // sliding. Position/depth stay on the true stand-point; signed by facing (flipX).
      const forward = v.anim !== undefined ? (ANIM_FORWARD_PX[v.anim] ?? 0) : 0;
      const frameWidth = sprite.frame.width * scale; // base display width; origin is a fraction of it
      const originShift = forward !== 0 && frameWidth > 0 ? forward / frameWidth : 0;
      sprite.setOrigin(0.5 - ((v.flipX ?? false) ? -originShift : originShift), 0.85);
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
