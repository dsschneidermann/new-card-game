import Phaser from 'phaser';

export interface MenuButtonOptions {
  readonly enabled?: boolean;
}

export interface Button {
  setVisible(visible: boolean): void;
}

const WIDTH = 280;
const HEIGHT = 48;

/**
 * A simple placeholder button: a labelled slab drawn from primitives. Real
 * `ui.button` art arrives with the Asset Preload feature (03); until then this
 * keeps the menu usable.
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
  const bg = scene.add
    .rectangle(x, y, WIDTH, HEIGHT, enabled ? 0x2d3142 : 0x1a1c24)
    .setStrokeStyle(2, enabled ? 0x4fd1c5 : 0x3a3f4b);
  const text = scene.add
    .text(x, y, label, {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: enabled ? '#e0e0e0' : '#6b7280',
    })
    .setOrigin(0.5);

  if (enabled) {
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x3a4156));
    bg.on('pointerout', () => bg.setFillStyle(0x2d3142));
    bg.on('pointerdown', onClick);
  }

  return {
    setVisible(visible: boolean): void {
      bg.setVisible(visible);
      text.setVisible(visible);
      if (bg.input) bg.input.enabled = visible && enabled;
    },
  };
}
