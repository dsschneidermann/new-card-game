import Phaser from 'phaser';
import { s, AssetKeys, resolveKey, assetScale } from '@core/index';
import type { EnemyCardData } from '@render/enemyCardData';

/**
 * The enemy "inspect card" visual (Enemy Hover Card feature): a card-SIZED rectangle mirroring the item
 * rectangle (src/render/itemCard.ts buildItemCard) so a hovered enemy reads like the rest of the card UI.
 * Layers, back-to-front: a rounded slab at the card-face footprint (thin-bordered, no card-face art), the
 * enemy's idle-sheet portrait filling the TOP HALF (clamped to that window, placeholder-safe), and the
 * name + HP / Shield / Armor lines in the lower half. Pinned (scrollFactor 0). Presentation only; it is
 * fed by the pure enemyCardData, so no Phaser types leak into core.
 *
 * Layout constants are base px (pre-s() scaling), kept here in one place and tuned live at visual-QA — the
 * enemy counterpart to itemCard's constant block.
 */

// Card-face footprint fallback if the card_skill descriptor is somehow missing (it is registered, so unreachable).
const CARD_FALLBACK_W = 195;
const CARD_FALLBACK_H = 284;
// The slab: matches itemCard's fill/border/radius so the two cards read as siblings.
const CARD_FILL = 0x2a2f3a; // dark slate fill
const CARD_FILL_ALPHA = 1.0;
const CARD_BORDER_W = 3; // border stroke width
const CARD_BORDER_COLOR = 0x9ca3af; // grey border
const CARD_RADIUS = 12; // rounded-corner radius
// Enemy portrait, centred in the TOP HALF (y from -h/2 to 0).
const PORTRAIT_TOP_HALF_INSET = 14; // inset around the top-half window so it never touches the border
// Lower-half text.
const NAME_OFFSET_Y = 14; // name inset below the vertical centre (just under the portrait half)
const NAME_FONT_PX = 18;
const NAME_COLOR = '#e5e7eb';
const STATS_START_Y = 44; // first stat line inset below the centre
const STAT_LINE_H = 26; // vertical step between successive stat lines (fits up to 4: HP/Shield/Armor/Attack)
const STAT_FONT_PX = 16;
const STAT_COLOR = '#cbd5e1';
// The telegraphed-attack line: soft red to tie it to the light-red telegraph fill on the board, so the
// player learns 'this name = that pattern' (Enemy Attack Patterns). Only drawn when an attack is telegraphed.
const ATTACK_COLOR = '#f7a1a1';
const TEXT_WRAP_INSET = 36; // horizontal inset for the wrapped name width

/**
 * The card-face footprint (base px, pre-s()): the card_skill background's native size × its display scale,
 * so the inspect card is exactly card-sized — single-sourced with itemCard's itemCardBase / CardController.
 */
function cardFaceBase(): { w: number; h: number } {
  const d = resolveKey(AssetKeys.cardSkill)?.descriptor;
  if (d === undefined) return { w: CARD_FALLBACK_W, h: CARD_FALLBACK_H };
  return { w: d.size[0] * assetScale(d), h: d.size[1] * assetScale(d) };
}

/** The inspect card's on-screen size at `scale` (already s()-scaled) — used by the caller to clamp it on-screen. */
export function enemyCardSize(scale = 1): { w: number; h: number } {
  const { w, h } = cardFaceBase();
  return { w: s(w) * scale, h: s(h) * scale };
}

export interface EnemyCardOpts {
  /** Container scale. Default 1 (a hover tooltip). */
  scale?: number;
}

/** Build the enemy inspect rectangle for `data`. See the module doc for the layer breakdown. */
export function buildEnemyCard(
  scene: Phaser.Scene,
  data: EnemyCardData,
  opts: EnemyCardOpts = {},
): Phaser.GameObjects.Container {
  const { w: baseW, h: baseH } = cardFaceBase();
  const w = s(baseW);
  const h = s(baseH);
  const c = scene.add.container(0, 0).setScrollFactor(0); // pinned: stays put while the world scrolls

  // Card-sized rounded rectangle: filled slab + thin border (no card-face art), matching the item card.
  const slab = scene.add.graphics();
  slab.fillStyle(CARD_FILL, CARD_FILL_ALPHA);
  slab.fillRoundedRect(-w / 2, -h / 2, w, h, s(CARD_RADIUS));
  slab.lineStyle(s(CARD_BORDER_W), CARD_BORDER_COLOR, 1);
  slab.strokeRoundedRect(-w / 2, -h / 2, w, h, s(CARD_RADIUS));
  const layers: Phaser.GameObjects.GameObject[] = [slab];

  // Enemy portrait centred in the TOP HALF. The idle texture is a multi-frame sheet, so size it from the
  // live first FRAME (Sprite defaults to frame 0), like SceneSync — not the whole-sheet descriptor size.
  // Shrunk to fit the top half (never upscaled); missing texture -> no portrait (guarded by textures.exists).
  if (scene.textures.exists(data.portraitTexture)) {
    const portrait = scene.add.sprite(0, -h / 4, data.portraitTexture).setOrigin(0.5);
    const descriptor = resolveKey(data.portraitTexture)?.descriptor;
    const artScale = descriptor ? assetScale(descriptor) : 1;
    const frameW = portrait.frame.width * artScale;
    const frameH = portrait.frame.height * artScale;
    const maxW = baseW - 2 * PORTRAIT_TOP_HALF_INSET;
    const maxH = baseH / 2 - 2 * PORTRAIT_TOP_HALF_INSET;
    const fit = Math.min(maxW / frameW, maxH / frameH, 1); // shrink to fit the top half; never enlarge
    portrait.setDisplaySize(s(frameW * fit), s(frameH * fit));
    layers.push(portrait);
  }

  // Lower half: name, then the HP / Shield / Armor stat lines (Shield/Armor always shown, including 0).
  const name = scene.add
    .text(0, s(NAME_OFFSET_Y), data.name, {
      fontFamily: 'monospace',
      fontSize: `${s(NAME_FONT_PX)}px`,
      color: NAME_COLOR,
      align: 'center',
      wordWrap: { width: w - s(TEXT_WRAP_INSET) },
    })
    .setOrigin(0.5, 0);
  layers.push(name);

  const statLines: { text: string; color: string }[] = [
    { text: `HP ${data.hp}/${data.maxHp}`, color: STAT_COLOR },
    { text: `Shield ${data.shield}`, color: STAT_COLOR },
    { text: `Armor ${data.armor}`, color: STAT_COLOR },
  ];
  // The currently-telegraphed attack's name, appended (soft red) when the enemy has an active telegraph.
  if (data.attackName !== null) {
    statLines.push({ text: `Attack: ${data.attackName}`, color: ATTACK_COLOR });
  }
  statLines.forEach((line, i) => {
    const stat = scene.add
      .text(0, s(STATS_START_Y + i * STAT_LINE_H), line.text, {
        fontFamily: 'monospace',
        fontSize: `${s(STAT_FONT_PX)}px`,
        color: line.color,
        align: 'center',
        wordWrap: { width: w - s(TEXT_WRAP_INSET) },
      })
      .setOrigin(0.5, 0);
    layers.push(stat);
  });

  c.add(layers);
  c.setScale(opts.scale ?? 1);
  return c;
}
