import Phaser from 'phaser';
import {
  hexToPixel,
  resolveKey,
  assetScale,
  frameSequenceTextureKey,
  s,
  type Hex,
  type HexLayout,
} from '@core/index';

/**
 * Depth for a cast effect: above the character sprites (SceneSync depth-sorts them by screen-Y, so their
 * depths are ~hundreds–thousands) but below the enemy inspect card (ENEMY_CARD_DEPTH 2_001_000) and the HUD,
 * so a big effect reads over the field without covering the UI.
 */
const EFFECT_DEPTH = 1_500_000;

/**
 * Plays a one-shot cast EFFECT animation over a hex (Spell & Card Cast Effects) — a transient scene sprite,
 * NOT an ECS entity, so nothing is persisted and each cast simply re-triggers it. Given a registered effect
 * asset key, it centres a large sprite on the hex, plays `<key>.right` once, and destroys itself on
 * completion. Purely presentation (Phaser-clock); a missing descriptor or animation is a silent no-op.
 */
export class EffectPlayer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: HexLayout,
  ) {}

  /**
   * Play the effect `effectKey` centred on `hex` at its descriptor-driven great size, destroying the sprite
   * when the one-shot finishes. No-op if the effect's descriptor or its `<key>.right` animation is missing,
   * so an unwired or un-dropped effect can never crash a cast.
   */
  playAt(hex: Hex, effectKey: string): void {
    const descriptor = resolveKey(effectKey)?.descriptor;
    if (descriptor === undefined) return;
    const animKey = `${effectKey}.right`;
    if (!this.scene.anims.exists(animKey)) return;

    const { x, y } = hexToPixel(this.layout, hex);
    // Initial texture = frame 0's per-frame texture; if the sequence degraded to a placeholder, createAnims
    // used the base key as its single frame, so fall back to that.
    const firstFrameKey = frameSequenceTextureKey(effectKey, 0);
    const initialTexture = this.scene.textures.exists(firstFrameKey) ? firstFrameKey : effectKey;

    const sprite = this.scene.add.sprite(x, y, initialTexture).setOrigin(0.5, 0.5).setDepth(EFFECT_DEPTH);
    // Great display size straight from the descriptor (assetScale, s()-scaled) — no hardcoded per-sprite scale.
    const scale = assetScale(descriptor);
    sprite.setDisplaySize(s(descriptor.size[0] * scale), s(descriptor.size[1] * scale));
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
    sprite.play(animKey);
  }
}
