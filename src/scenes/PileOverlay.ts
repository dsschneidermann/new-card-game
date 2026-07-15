import Phaser from 'phaser';
import { s, AssetKeys, resolveKey, assetScale, type EntityId } from '@core/index';

// Layout (base px, scaled by s()). The grid scrolls within a viewport from OVERLAY_TOP (below the
// title) down to OVERLAY_BOTTOM_MARGIN above the screen bottom. Faces are centred at OVERLAY_FACE_SCALE.
const OVERLAY_TOP = 180;
const OVERLAY_BOTTOM_MARGIN = 48;
const OVERLAY_PAD = 140; // top pad inside the scroll content so the first row clears the viewport edge
const OVERLAY_COLS = 5;
const OVERLAY_COL_W = 220;
const OVERLAY_ROW_H = 280;
export const OVERLAY_FACE_SCALE = 0.9; // shared with CardController.makeCardFace so the hit-test matches the art
// Card face footprint (base px, pre-scale) for the tap hit-test — the background art's native size at its
// display scale (assetScale), matching CardController.makeCardFace exactly so the hit-test tracks the art.
const CARD_FACE_DESC = resolveKey(AssetKeys.cardFrameSkill)?.descriptor;
const FACE_W = CARD_FACE_DESC ? CARD_FACE_DESC.size[0] * assetScale(CARD_FACE_DESC) : 195;
const FACE_H = CARD_FACE_DESC ? CARD_FACE_DESC.size[1] * assetScale(CARD_FACE_DESC) : 284;
const OVERLAY_DEPTH = 2_000_000 + 100; // above the HUD
const DRAG_THRESHOLD = 16; // px of pointer travel that distinguishes a drag from a tap

/** One overlay row: the card-instance id (returned when picked) + its prebuilt face container. */
export interface OverlayItem {
  readonly id: EntityId;
  readonly face: Phaser.GameObjects.Container;
}

/**
 * The Deck / Discard / card-picker overlay: a dim modal backdrop + a fixed title + a geometry-masked,
 * vertically-scrollable grid of card faces. Scrolls by mouse WHEEL and DRAG (touch). In BROWSE mode a
 * tap closes; in PICK mode a tap on a face resolves with its id, and a tap that misses every face
 * resolves with null (cancel). The caller builds the faces (CardController.makeCardFace); this owns
 * only the layout, scrolling, masking, and hit-testing — extracted from CardController so the overlay
 * has a single home and CardController stays a coordinator.
 */
export class PileOverlay {
  private readonly container: Phaser.GameObjects.Container;
  private readonly title: Phaser.GameObjects.Text;
  private readonly content: Phaser.GameObjects.Container;
  private items: OverlayItem[] = [];
  private scrollMin = 0; // most-negative content.y offset from the top (0 if it all fits)
  private drag: { startY: number; startContentY: number; moved: boolean } | null = null;
  private onResolve: ((picked: EntityId | null) => void) | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    // Pinned (scrollFactor 0): the whole modal stays fixed while the world camera scrolls.
    this.container = scene.add.container(0, 0).setDepth(OVERLAY_DEPTH).setVisible(false).setScrollFactor(0);
    // scrollFactor(0) MUST be on the dim rect itself, not just the container: Phaser hit-tests an
    // interactive child against ITS OWN scrollFactor, so without this the backdrop's hit area shifts
    // with the world camera (while the container keeps it rendered pinned) and clicks leak to the world.
    const dim = scene.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0).setScrollFactor(0).setInteractive();
    // A press on the backdrop starts a potential scroll-drag; a release WITHOUT a drag (a tap) resolves.
    dim.on('pointerdown', (p: Phaser.Input.Pointer) => this.beginDrag(p));
    this.title = scene.add
      .text(width / 2, s(80), '', { fontFamily: 'monospace', fontSize: `${s(48)}px`, color: '#e5e7eb' })
      .setOrigin(0.5);
    this.content = scene.add.container(0, s(OVERLAY_TOP)); // scrolled by moving its y
    // Clip the grid to the viewport so a long list scrolls inside a window instead of off the screen.
    const viewportH = height - s(OVERLAY_BOTTOM_MARGIN) - s(OVERLAY_TOP);
    const maskShape = scene.make.graphics({}, false);
    maskShape.fillStyle(0xffffff).fillRect(0, s(OVERLAY_TOP), width, viewportH);
    maskShape.setScrollFactor(0); // clip region is screen-fixed, matching the pinned (scrollFactor 0) content
    this.content.setMask(maskShape.createGeometryMask());
    this.container.add([dim, this.title, this.content]);
    // Scroll input — WHEEL + DRAG — guarded to act only while the overlay is open.
    scene.input.on('wheel', (_p: Phaser.Input.Pointer, _o: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      if (this.container.visible) this.scrollTo(this.content.y - dy);
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onDragMove(p));
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => this.endDrag(p));
  }

  isOpen(): boolean {
    return this.container.visible;
  }

  /** Show a non-selectable list (Deck / Discard browse); a tap anywhere closes it. */
  openBrowse(title: string, items: readonly OverlayItem[]): void {
    this.show(title, items, null);
  }

  /** Show a selectable list (card picker); a tap on a face resolves its id, a tap on empty space resolves null. */
  openPicker(title: string, items: readonly OverlayItem[], onResolve: (picked: EntityId | null) => void): void {
    this.show(title, items, onResolve);
  }

  close(): void {
    this.container.setVisible(false);
    this.drag = null;
    this.onResolve = null;
  }

  private show(title: string, items: readonly OverlayItem[], onResolve: ((picked: EntityId | null) => void) | null): void {
    this.title.setText(title);
    this.populate(items);
    this.content.y = s(OVERLAY_TOP); // reset scroll to the top on each open
    this.drag = null;
    this.onResolve = onResolve;
    this.container.setVisible(true);
  }

  private populate(items: readonly OverlayItem[]): void {
    const { width, height } = this.scene.scale;
    for (const it of this.items) it.face.destroy();
    this.items = [...items];
    items.forEach((it, i) => {
      const col = i % OVERLAY_COLS;
      const row = Math.floor(i / OVERLAY_COLS);
      it.face.setPosition(width / 2 + (col - (OVERLAY_COLS - 1) / 2) * s(OVERLAY_COL_W), s(OVERLAY_PAD) + row * s(OVERLAY_ROW_H));
      this.content.add(it.face);
    });
    const rows = Math.ceil(items.length / OVERLAY_COLS);
    const contentH = s(OVERLAY_PAD) + rows * s(OVERLAY_ROW_H);
    const viewportH = height - s(OVERLAY_BOTTOM_MARGIN) - s(OVERLAY_TOP);
    this.scrollMin = Math.min(0, viewportH - contentH); // <= 0: how far up the grid can scroll
  }

  /** Clamp the content container's y to the scroll range [top + scrollMin, top]. */
  private scrollTo(y: number): void {
    const top = s(OVERLAY_TOP);
    this.content.y = Phaser.Math.Clamp(y, top + this.scrollMin, top);
  }

  private beginDrag(p: Phaser.Input.Pointer): void {
    if (this.container.visible) this.drag = { startY: p.y, startContentY: this.content.y, moved: false };
  }

  private onDragMove(p: Phaser.Input.Pointer): void {
    if (this.drag === null) return;
    const dy = p.y - this.drag.startY;
    if (Math.abs(dy) > s(DRAG_THRESHOLD)) this.drag.moved = true;
    this.scrollTo(this.drag.startContentY + dy);
  }

  /** End a backdrop press: a drag just ends (it scrolled); a tap resolves (picker) or closes (browse). */
  private endDrag(p: Phaser.Input.Pointer): void {
    if (this.drag === null) return;
    const wasTap = !this.drag.moved;
    this.drag = null;
    if (!wasTap) return;
    if (this.onResolve !== null) {
      const picked = this.pickAt(p);
      const resolve = this.onResolve;
      this.close(); // clears onResolve before the callback runs
      resolve(picked);
    } else {
      this.close();
    }
  }

  /**
   * The item id under pointer `p`, or null if the tap missed every face. CLIPPED to the viewport (a
   * face scrolled out of view is not selectable), since the geometry mask is render-only. content.x is
   * 0, so a face's x is its scene x; the grid scrolls via content.y.
   */
  private pickAt(p: Phaser.Input.Pointer): EntityId | null {
    const { height } = this.scene.scale;
    if (p.y < s(OVERLAY_TOP) || p.y > height - s(OVERLAY_BOTTOM_MARGIN)) return null;
    const halfW = (s(FACE_W) * OVERLAY_FACE_SCALE) / 2;
    const halfH = (s(FACE_H) * OVERLAY_FACE_SCALE) / 2;
    for (const it of this.items) {
      const sceneY = this.content.y + it.face.y;
      if (Math.abs(p.x - it.face.x) <= halfW && Math.abs(p.y - sceneY) <= halfH) return it.id;
    }
    return null;
  }
}
