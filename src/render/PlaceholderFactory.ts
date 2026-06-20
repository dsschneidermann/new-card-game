import Phaser from 'phaser';
import { frameConfig, type AssetDescriptor } from '@core/index';

/** Deterministic mid-bright colour from a key, so placeholders are distinguishable. */
function colorFromKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const r = 70 + (h & 0x7f);
  const g = 70 + ((h >> 8) & 0x7f);
  const b = 70 + ((h >> 16) & 0x7f);
  return (r << 16) | (g << 8) | b;
}

/**
 * Generate a labeled, colour-coded placeholder texture for a descriptor (ADR-004)
 * and register it under the descriptor's key. Multi-frame descriptors produce a
 * horizontal strip with frame indices 0..count-1 so sprites/anims can use them.
 */
export function generatePlaceholder(scene: Phaser.Scene, descriptor: AssetDescriptor): void {
  const { key } = descriptor;
  if (scene.textures.exists(key)) return;

  const { frameWidth, frameHeight, frameCount } = frameConfig(descriptor);
  const color = colorFromKey(key);
  const g = scene.add.graphics();
  for (let i = 0; i < frameCount; i += 1) {
    g.fillStyle(color, 1).fillRect(i * frameWidth, 0, frameWidth, frameHeight);
    g.lineStyle(1, 0x000000, 0.4).strokeRect(i * frameWidth + 0.5, 0.5, frameWidth - 1, frameHeight - 1);
  }
  g.generateTexture(key, frameWidth * frameCount, frameHeight);
  g.destroy();

  if (frameCount > 1) {
    const texture = scene.textures.get(key);
    for (let i = 0; i < frameCount; i += 1) texture.add(i, 0, i * frameWidth, 0, frameWidth, frameHeight);
  }
}
