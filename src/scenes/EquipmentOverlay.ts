import Phaser from 'phaser';
import {
  s,
  resolveKey,
  assetScale,
  AssetKeys,
  EQUIP_KINDS,
  itemDef,
  type EquipKind,
  type EquipmentData,
  type ItemDef,
} from '@core/index';
import { buildItemCard } from '@render/itemCard';

/**
 * The Equipped-Items overlay (Equipment Visuals feature): a view-only, screen-pinned modal showing the
 * player's loadout. A dim backdrop + a title + a centred mannequin figure, with the ten EquipKind slots laid
 * over the figure at fractional offsets. A FILLED slot shows just that item's equipment art; an EMPTY slot
 * shows a faint ring + kind label. Hovering a filled slot pops that item's full rectangle (the shared
 * buildItemCard) as a tooltip beside the figure. A tap on the backdrop closes it. Owned by CardController
 * (which builds it, toggles it from the lower-left button, and closes it on turn change / Esc); this widget
 * owns only the layout, the mannequin, the slots, and the hover tooltip — the item-rectangle home stays
 * buildItemCard. No equip/unequip here: there is no inventory, so the loadout is display-only.
 */

const OVERLAY_DEPTH = 2_000_000 + 100; // above the HUD, same band as PileOverlay
const TOOLTIP_DEPTH = OVERLAY_DEPTH + 10;
const FIGURE_MARGIN_LEFT = 170; // base-px gap from the screen's left edge to the mannequin's left edge
const FIGURE_TOP = 150; // base-px y of the mannequin's TOP edge (below the title)
const SLOT_RADIUS = 42; // base-px slot disc radius
const SLOT_FILL = 0x394150; // slot backing-disc fill
const SLOT_FILL_ALPHA = 0.9;
const SLOT_RING_W_FILLED = 3; // ring stroke width when occupied
const SLOT_RING_W_EMPTY = 2; // ring stroke width when empty
const SLOT_RING_FILLED = 0xfacc15; // occupied slot rings yellow
const SLOT_RING_EMPTY = 0x6b7280; // empty slot rings faint grey
const SLOT_ART_INSET = 7; // px inset of the art within the disc
const SLOT_LABEL_FONT_PX = 12; // empty-slot kind label
const SLOT_LABEL_COLOR = '#9ca3af';
const TOOLTIP_SCALE = 1; // the hovered item's rectangle renders a touch smaller than full
const TOOLTIP_GAP = 36; // px gap between the slot disc and its tooltip

/**
 * Fractional slot positions over the figure: (fx, fy) are fractions of the displayed figure's width/height
 * measured from its CENTRE (screen-left is the figure's right hand). Tunable presentation — surfaced for
 * live visual-QA tuning at review. Covers every EquipKind (a compile-time Record, so a new kind must add one).
 */
const SLOT_LAYOUT: Record<EquipKind, { fx: number; fy: number }> = {
  armor_head: { fx: 0.15, fy: -0.30 },
  amulet: { fx: 0.15, fy: -0.17 },
  armor_body: { fx: 0.15, fy: -0.04 },
  cape: { fx: 0.40, fy: -0.22 },
  weapon_ranged: { fx: -0.33, fy: -0.3 },
  weapon_melee: { fx: -0.33, fy: 0.02 },
  shield: { fx: 0.40, fy: 0.02 },
  spellbook: { fx: -0.33, fy: 0.22 },
  weapon_backup: { fx: 0.40, fy: 0.22 },
  boots: { fx: 0.15, fy: 0.42 },
};

export class EquipmentOverlay {
  private readonly container: Phaser.GameObjects.Container;
  private readonly title: Phaser.GameObjects.Text;
  private dynamic: Phaser.GameObjects.GameObject[] = []; // mannequin + slots, rebuilt each open
  private tooltip: Phaser.GameObjects.Container | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    // Pinned (scrollFactor 0): the whole modal stays fixed while the world camera scrolls.
    this.container = scene.add.container(0, 0).setDepth(OVERLAY_DEPTH).setVisible(false).setScrollFactor(0);
    // scrollFactor(0) on the dim rect ITSELF (not just the container): Phaser hit-tests an interactive child
    // against its own scrollFactor, so without this the backdrop's hit area would drift with the world camera.
    const dim = scene.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0).setScrollFactor(0).setInteractive();
    dim.on('pointerdown', () => this.close()); // tap the backdrop to close
    this.title = scene.add
      .text(width / 2, s(80), 'Equipment', { fontFamily: 'monospace', fontSize: `${s(48)}px`, color: '#e5e7eb' })
      .setOrigin(0.5);
    this.container.add([dim, this.title]);
  }

  isOpen(): boolean {
    return this.container.visible;
  }

  /** (Re)build the mannequin + slots from the live loadout and show. Always rebuilds, so it reflects the
   *  current equipment (e.g. right after a chest equip). `equipment` is the player's EquipmentData (or undefined). */
  open(equipment: EquipmentData | undefined): void {
    this.clearDynamic();
    // Mannequin figure: display size from its descriptor (assetScale, the no-hardcoded-scale invariant).
    // Slot positions are fractions of THIS displayed size, so they track it.
    const md = resolveKey(AssetKeys.uiMannequin)?.descriptor;
    const mScale = md ? assetScale(md) : 1;
    const fw = s((md?.size[0] ?? 512) * mScale);
    const fh = s((md?.size[1] ?? 1024) * mScale);
    // Left-anchored: the figure is near the screen's left edge, above the Gear button's column.
    const cx = s(FIGURE_MARGIN_LEFT) + fw / 2;
    const cy = s(FIGURE_TOP) + fh / 2;
    this.title.setX(cx); // centre the title over the (left-shifted) figure
    const figure = this.scene.add.image(cx, cy, AssetKeys.uiMannequin).setOrigin(0.5).setDisplaySize(fw, fh).setScrollFactor(0);
    this.container.add(figure);
    this.dynamic.push(figure);

    for (const kind of EQUIP_KINDS) {
      const { fx, fy } = SLOT_LAYOUT[kind];
      const slot = equipment?.slots[kind];
      const def = slot !== undefined ? itemDef(slot.defId) : undefined;
      this.buildSlot(cx + fx * fw, cy + fy * fh, kind, def);
    }
    this.container.setVisible(true);
  }

  close(): void {
    this.hideTooltip();
    this.container.setVisible(false);
  }

  /** One slot disc at (x,y): the item's art when filled (hover -> tooltip), else a faint ring + kind label. */
  private buildSlot(x: number, y: number, kind: EquipKind, def: ItemDef | undefined): void {
    const r = s(SLOT_RADIUS);
    const filled = def !== undefined;
    const slotC = this.scene.add.container(x, y).setScrollFactor(0);
    const disc = this.scene.add.circle(0, 0, r, SLOT_FILL, SLOT_FILL_ALPHA);
    const ring = this.scene.add
      .circle(0, 0, r, 0x000000, 0)
      .setStrokeStyle(s(filled ? SLOT_RING_W_FILLED : SLOT_RING_W_EMPTY), filled ? SLOT_RING_FILLED : SLOT_RING_EMPTY);
    const parts: Phaser.GameObjects.GameObject[] = [disc, ring];
    if (def !== undefined && this.scene.textures.exists(def.art)) {
      const ad = resolveKey(def.art)?.descriptor;
      const artScale = ad ? assetScale(ad) : 1;
      const nativeW = (ad?.size[0] ?? 256) * artScale;
      const nativeH = (ad?.size[1] ?? 256) * artScale;
      const box = (SLOT_RADIUS - SLOT_ART_INSET) * 2; // fit the art inside the disc (base px)
      const fit = Math.min(box / nativeW, box / nativeH, 1);
      const art = this.scene.add.image(0, 0, def.art).setOrigin(0.5).setDisplaySize(s(nativeW * fit), s(nativeH * fit));
      parts.push(art);
    } else if (!filled) {
      const label = this.scene.add
        .text(0, 0, kind.replace(/_/g, ' '), {
          fontFamily: 'monospace',
          fontSize: `${s(SLOT_LABEL_FONT_PX)}px`,
          color: SLOT_LABEL_COLOR,
          align: 'center',
          wordWrap: { width: r * 1.6 },
        })
        .setOrigin(0.5);
      parts.push(label);
    }
    slotC.add(parts);
    this.container.add(slotC);
    this.dynamic.push(slotC);
    // Hovering a FILLED slot shows that item's full rectangle as a tooltip beside the figure.
    if (def !== undefined) {
      slotC.setInteractive(new Phaser.Geom.Circle(0, 0, r), Phaser.Geom.Circle.Contains);
      slotC.on('pointerover', () => this.showTooltip(def, x, y));
      slotC.on('pointerout', () => this.hideTooltip());
    }
  }

  /**
   * Show `def`'s full item rectangle as a tooltip to the RIGHT of the hovered slot, vertically centred on
   * the slot — mirroring the spell sidebar's hover tooltip (which sits a fixed dx right of the disc).
   * Clamped so the whole card stays on-screen.
   */
  private showTooltip(def: ItemDef, slotX: number, slotY: number): void {
    this.hideTooltip();
    const { width, height } = this.scene.scale;
    const card = buildItemCard(this.scene, def, { scale: TOOLTIP_SCALE });
    // Footprint = the card-face size (card_skill native × assetScale) at the tooltip scale, computed rather
    // than read from getBounds (a Graphics-backed container reports unreliable bounds).
    const fd = resolveKey(AssetKeys.cardFrameSkill)?.descriptor;
    const halfW = (s(fd ? fd.size[0] * assetScale(fd) : 195) * TOOLTIP_SCALE) / 2;
    const halfH = (s(fd ? fd.size[1] * assetScale(fd) : 284) * TOOLTIP_SCALE) / 2;
    // To the RIGHT of the slot disc, at the slot's y; clamp so the whole card stays on-screen.
    const rawX = slotX + s(SLOT_RADIUS) + s(TOOLTIP_GAP) + halfW;
    const tx = Phaser.Math.Clamp(rawX, halfW + s(8), width - halfW - s(8));
    const ty = Phaser.Math.Clamp(slotY, halfH + s(8), height - halfH - s(8));
    card.setPosition(tx, ty).setDepth(TOOLTIP_DEPTH).setScrollFactor(0);
    this.tooltip = card;
  }

  private hideTooltip(): void {
    this.tooltip?.destroy();
    this.tooltip = null;
  }

  private clearDynamic(): void {
    this.hideTooltip();
    for (const obj of this.dynamic) obj.destroy();
    this.dynamic = [];
  }
}
