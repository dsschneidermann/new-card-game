import Phaser from 'phaser';
import { AssetKeys, s } from '@core/index';

export interface MenuButtonOptions {
  readonly enabled?: boolean;
}

export interface Button {
  setVisible(visible: boolean): void;
  setLabel(label: string): void;
}

const WIDTH = 560;
const HEIGHT = 96;

// `ui.button` is a 3-frame strip: 0 = normal, 1 = hover, 2 = disabled. Real
// 3-state art drops in behind the same key; on a flat placeholder (all frames
// one colour) alpha still gives interaction feedback.
const FRAME_NORMAL = '0';
const FRAME_HOVER = '1';
const FRAME_DISABLED = '2';

/**
 * A menu button backed by the `ui.button` texture from the Asset Preload system
 * (feature 03). The slab is the manifest texture; the label is drawn on top.
 */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options: MenuButtonOptions = {},
): Button {
  const enabled = options.enabled ?? true;
  // Degrade gracefully if real art ever loads as a single (frameless) image.
  const texture = scene.textures.get(AssetKeys.uiButton);
  const multiState = texture.has(FRAME_HOVER) && texture.has(FRAME_DISABLED);

  const bg = scene.add
    .image(x, y, AssetKeys.uiButton, multiState && !enabled ? FRAME_DISABLED : FRAME_NORMAL)
    .setDisplaySize(s(WIDTH), s(HEIGHT));
  if (!enabled) bg.setAlpha(0.5);

  const text = scene.add
    .text(x, y, label, {
      fontFamily: 'monospace',
      fontSize: `${s(40)}px`,
      color: enabled ? '#e0e0e0' : '#6b7280',
    })
    .setOrigin(0.5);

  if (enabled) {
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      if (multiState) bg.setFrame(FRAME_HOVER, false);
      bg.setAlpha(0.85);
    });
    bg.on('pointerout', () => {
      if (multiState) bg.setFrame(FRAME_NORMAL, false);
      bg.setAlpha(1);
    });
    bg.on('pointerdown', onClick);
  }

  return {
    setVisible(visible: boolean): void {
      bg.setVisible(visible);
      text.setVisible(visible);
      if (bg.input) bg.input.enabled = visible && enabled;
    },
    setLabel(label: string): void {
      text.setText(label);
    },
  };
}
