import Phaser from 'phaser';
import { s, assetScale, resolveKey, spriteOffset, type EntityId } from '@core/index';
import type { RenderableView } from './characterViews';

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
        try {
          if (sprite.anims.currentAnim?.key !== v.anim) sprite.play(v.anim);
        }
        catch(err) {
          console.error(err)
        }
      } else if (v.frame !== undefined) {
        sprite.setFrame(v.frame);
      }
      sprite.setFlipX(v.flipX ?? false);
      // Resolve the CURRENTLY displayed sheet's descriptor (the playing anim's texture, not the
      // base texture) so both the scale and the alignment nudge come from that sheet's registry
      // entry rather than being hardcoded in the scene.
      const art = resolveKey(sprite.texture.key)?.descriptor;
      const scale = art ? assetScale(art) : 1;
      sprite.setDisplaySize(s(sprite.frame.width * scale), s(sprite.frame.height * scale));
      // Per-sheet art nudge from the asset definition, applied as a STATIC draw-origin shift
      // (never the movement tween): forward = px in the facing direction (mirrored by flipX),
      // down = px downward. setOrigin wants a fraction of the sprite, so we divide the base-px
      // nudge by the frame footprint to get that fraction — which the display size (s(frameW))
      // multiplies straight back out, leaving a net shift of s(forwardPx)/s(downPx): a plain base-px
      // offset scaled by resolution, independent of the asset's size. The sprite's position and depth
      // stay on the true stand-point, so the figure is drawn offset rather than sliding into place.
      const { forwardPx, downPx } = art ? spriteOffset(art) : { forwardPx: 0, downPx: 0 };
      const frameW = sprite.frame.width * scale;
      const frameH = sprite.frame.height * scale;
      const fwdShift = forwardPx !== 0 && frameW > 0 ? forwardPx / frameW : 0;
      const downShift = downPx !== 0 && frameH > 0 ? downPx / frameH : 0;
      sprite.setOrigin(0.5 - ((v.flipX ?? false) ? -fwdShift : fwdShift), 0.85 - downShift);
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
