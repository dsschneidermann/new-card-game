import Phaser from 'phaser';
import { s, AssetKeys, resolveKey, assetScale, type ItemDef } from '@core/index';
import { itemEffectLines } from '@render/itemCardText';

/**
 * The shared ITEM visual (Equipment Visuals feature): a card-SIZED rectangle, NOT a card face. Reused by
 * the chest reward picker (CardController.buildRewardItems) AND the equipped-items overlay tooltip
 * (EquipmentOverlay), so item display has a single home. Layers, back-to-front: a rounded rectangle at the
 * exact card-face footprint (a thin-bordered slab, no card-face art), the equipment art filling the TOP HALF
 * (def.art, sized from its descriptor via assetScale and clamped to the top-half window — placeholder-safe),
 * and the item name / 'Equip · <kind>' / grant summary in the lower half. Pinned (scrollFactor 0) so it stays
 * put while the world scrolls. Presentation only; no Phaser types leak into core.
 *
 * Layout constants are base px (pre-s() scaling), kept here in one place and tuned live at visual-QA — the
 * item counterpart to CardController's CARD_* block.
 */

// Footprint fallback if the card_skill descriptor is somehow missing (it is registered, so unreachable).
const ITEM_CARD_FALLBACK_W = 195;
const ITEM_CARD_FALLBACK_H = 284;
// The slab: a filled rounded rectangle with a thin grey border (replaces the card-face background for items).
const ITEM_CARD_FILL = 0x2a2f3a; // dark slate fill
const ITEM_CARD_FILL_ALPHA = 1.0;
const ITEM_CARD_BORDER_W = 3; // border stroke width
const ITEM_CARD_BORDER_COLOR = 0x9ca3af; // grey border
const ITEM_CARD_RADIUS = 12; // rounded-corner radius
// Equipment art, centred in the TOP HALF (y from -h/2 to 0).
const ITEM_ART_FALLBACK_SIZE = 256; // item-art native size if its descriptor is missing
const ITEM_ART_TOP_HALF_INSET = 14; // inset around the top-half art window so it never touches the border
// Lower-half text.
const ITEM_NAME_OFFSET_Y = 14; // name inset below the vertical centre (just under the art half)
const ITEM_NAME_FONT_PX = 18;
const ITEM_NAME_COLOR = '#e5e7eb';
const ITEM_SLOT_OFFSET_Y = 58; // 'Equip · kind' line inset below the centre
const ITEM_SLOT_FONT_PX = 16;
const ITEM_SLOT_COLOR = '#9ca3af';
const ITEM_EFFECT_START_Y = 80; // first effect line inset below the centre (under the 'Equip · kind' line)
const ITEM_EFFECT_LINE_H = 22; // vertical step between stacked effect lines
const ITEM_EFFECT_FONT_PX = 16;
const ITEM_EFFECT_COLOR = '#cbd5e1';
const ITEM_TEXT_WRAP_INSET = 36; // horizontal inset for the wrapped text width

/**
 * The card-face footprint (base px, pre-s()): the card_skill background's native size × its display scale,
 * so an item rectangle is exactly card-sized and the PileOverlay tap hit-test (which assumes that footprint)
 * still lines up. Single-sourced with CardController.cardFaceBase / PileOverlay's FACE_W/FACE_H.
 */
function itemCardBase(): { w: number; h: number } {
  const d = resolveKey(AssetKeys.cardSkill)?.descriptor;
  if (d === undefined) return { w: ITEM_CARD_FALLBACK_W, h: ITEM_CARD_FALLBACK_H };
  return { w: d.size[0] * assetScale(d), h: d.size[1] * assetScale(d) };
}

export interface ItemCardOpts {
  /** Container scale (e.g. PileOverlay's OVERLAY_FACE_SCALE for the reward picker). Default 1 (e.g. a tooltip). */
  scale?: number;
}

/** Build the shared item rectangle for `def`. See the module doc for the layer breakdown. */
export function buildItemCard(
  scene: Phaser.Scene,
  def: ItemDef,
  opts: ItemCardOpts = {},
): Phaser.GameObjects.Container {
  const { w: baseW, h: baseH } = itemCardBase();
  const w = s(baseW);
  const h = s(baseH);
  const c = scene.add.container(0, 0).setScrollFactor(0); // pinned: stays put while the world scrolls

  // Card-sized rounded rectangle: filled slab + thin border. NO card-face art for items (the feature's point).
  const slab = scene.add.graphics();
  slab.fillStyle(ITEM_CARD_FILL, ITEM_CARD_FILL_ALPHA);
  slab.fillRoundedRect(-w / 2, -h / 2, w, h, s(ITEM_CARD_RADIUS));
  slab.lineStyle(s(ITEM_CARD_BORDER_W), ITEM_CARD_BORDER_COLOR, 1);
  slab.strokeRoundedRect(-w / 2, -h / 2, w, h, s(ITEM_CARD_RADIUS));
  const layers: Phaser.GameObjects.GameObject[] = [slab];

  // Equipment art centred in the TOP HALF. Display size from the descriptor (assetScale), then shrunk to fit
  // the top-half window (never upscaled). Missing art -> generated placeholder (guarded by textures.exists).
  if (scene.textures.exists(def.art)) {
    const ad = resolveKey(def.art)?.descriptor;
    const artScale = ad ? assetScale(ad) : 1;
    const nativeW = (ad?.size[0] ?? ITEM_ART_FALLBACK_SIZE) * artScale;
    const nativeH = (ad?.size[1] ?? ITEM_ART_FALLBACK_SIZE) * artScale;
    const maxW = baseW - 2 * ITEM_ART_TOP_HALF_INSET;
    const maxH = baseH / 2 - 2 * ITEM_ART_TOP_HALF_INSET;
    const fit = Math.min(maxW / nativeW, maxH / nativeH, 1); // shrink to fit the top half; never enlarge
    const art = scene.add
      .image(0, -h / 4, def.art)
      .setOrigin(0.5)
      .setDisplaySize(s(nativeW * fit), s(nativeH * fit));
    layers.push(art);
  }

  // Lower half: name, equip-slot kind, grant summary.
  const name = scene.add
    .text(0, s(ITEM_NAME_OFFSET_Y), def.name, {
      fontFamily: 'monospace',
      fontSize: `${s(ITEM_NAME_FONT_PX)}px`,
      color: ITEM_NAME_COLOR,
      align: 'center',
      wordWrap: { width: w - s(ITEM_TEXT_WRAP_INSET) },
    })
    .setOrigin(0.5, 0);
  const slot = scene.add
    .text(0, s(ITEM_SLOT_OFFSET_Y), `Equip · ${def.kind.replace(/_/g, ' ')}`, {
      fontFamily: 'monospace',
      fontSize: `${s(ITEM_SLOT_FONT_PX)}px`,
      color: ITEM_SLOT_COLOR,
      align: 'center',
    })
    .setOrigin(0.5, 0);
  // Effect lines (Items Redo): the item's real effects — granted cards by name, armour, resource bonuses, spell
  // grants — stacked in the lower half (or 'no effect'), derived by the pure itemEffectLines.
  const effects = itemEffectLines(def).map((line, i) =>
    scene.add
      .text(0, s(ITEM_EFFECT_START_Y + i * ITEM_EFFECT_LINE_H), line, {
        fontFamily: 'monospace',
        fontSize: `${s(ITEM_EFFECT_FONT_PX)}px`,
        color: ITEM_EFFECT_COLOR,
        align: 'center',
        wordWrap: { width: w - s(ITEM_TEXT_WRAP_INSET) },
      })
      .setOrigin(0.5, 0),
  );
  layers.push(name, slot, ...effects);

  c.add(layers);
  c.setScale(opts.scale ?? 1);
  return c;
}
