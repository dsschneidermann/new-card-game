import Phaser from 'phaser';
import {
  HexPosition,
  DeckState,
  cardDef,
  resolveTargeting,
  hexToPixel,
  pixelToHex,
  SPELL_DEFS,
  type World,
  type EntityId,
  type HexGrid,
  type HexLayout,
  type Hex,
  type CardDef,
  type SpellDef,
  type Command,
} from '@core/index';

/** What WorldScene provides to the card UI (kept thin; no Phaser types leak into core). */
export interface CardUiContext {
  readonly scene: Phaser.Scene;
  readonly grid: HexGrid;
  readonly layout: HexLayout;
  world(): World;
  player(): EntityId;
  submit(cmd: Command): void;
  /** True when the player may act (player phase + no move animating). */
  canAct(): boolean;
}

interface Armed {
  kind: 'card' | 'spell';
  def: CardDef | SpellDef;
  firstPick: Hex | null;
}

const HUD_DEPTH = 2_000_000;
const HL_DEPTH = 500_000;
const TINT_PRIMARY = 0xef4444; // red
const TINT_SECONDARY = 0xeab308; // yellow
const DRAG_THRESHOLD = 8; // px of pointer travel that distinguishes a drag from a click

/**
 * The card / deck / spell UI (feature 09): a hand fan, a spell sidebar, a deck
 * screen, and the shared targeting state machine. All targeting math comes from
 * the pure core (resolveTargeting); this class only renders and routes input.
 *
 * Cards AND spells activate the same way, by either gesture: press one and DRAG
 * onto a hex (release = first target), or CLICK it (a second click on a hex =
 * first target). Any further two-step targets are clicks. Confirming pays the
 * cost via the Turn Engine; no card/spell effects yet (feature 12).
 */
export class CardController {
  private readonly ctx: CardUiContext;
  private readonly scene: Phaser.Scene;
  private armed: Armed | null = null;
  /** Set while the activating press is held — its release decides drag vs click. */
  private pressDown: { x: number; y: number } | null = null;
  private hovered: Hex | null = null;

  private handCards: Phaser.GameObjects.Container[] = [];
  private spellCircles: Phaser.GameObjects.Container[] = [];
  private highlight!: Phaser.GameObjects.Graphics;
  private tooltip!: Phaser.GameObjects.Container;
  private deckOverlay!: Phaser.GameObjects.Container;

  constructor(ctx: CardUiContext) {
    this.ctx = ctx;
    this.scene = ctx.scene;
  }

  create(): void {
    this.highlight = this.scene.add.graphics().setDepth(HL_DEPTH);
    this.tooltip = this.scene.add.container(0, 0).setDepth(HUD_DEPTH + 10).setVisible(false);
    this.buildSpellSidebar();
    this.buildDeckIcon();
    this.buildDeckOverlay();
    this.refreshHand();
  }

  isArmed(): boolean {
    return this.armed !== null;
  }

  /** Pointer moved: update the targeting highlight if something is armed. */
  onPointerMove(p: Phaser.Input.Pointer): void {
    if (this.armed === null) return;
    this.hovered = pixelToHex(this.ctx.layout, p.worldX, p.worldY);
    this.redrawHighlight();
  }

  /**
   * Pointer released: if it ended the activating press AND travelled like a drag,
   * the release IS the first target (drag-to-cast). A near-stationary release is
   * a click-activation: stay armed and wait for a click on a hex.
   */
  onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.armed === null || this.pressDown === null) return;
    const moved = Phaser.Math.Distance.Between(this.pressDown.x, this.pressDown.y, p.x, p.y) > DRAG_THRESHOLD;
    this.pressDown = null;
    if (!moved) return; // click-activation: await a hex click
    const hex = pixelToHex(this.ctx.layout, p.worldX, p.worldY);
    if (this.ctx.grid.inBounds(hex)) this.advanceTarget(hex);
    else this.disarm(); // dragged off the grid: cancel
  }

  /** A click on the world while armed: a click-mode first target, or a two-step second. */
  onWorldDown(hex: Hex): void {
    if (this.armed === null || this.pressDown !== null) return;
    if (this.ctx.grid.inBounds(hex)) this.advanceTarget(hex);
    else this.disarm(); // clicked off the grid: cancel
  }

  /** Esc / cancel: drop any armed card/spell. */
  cancel(): void {
    this.disarm();
  }

  /** (Re)build the hand fan from DeckState.hand. */
  refreshHand(): void {
    for (const c of this.handCards) c.destroy();
    this.handCards = [];
    const deck = this.ctx.world().store(DeckState).get(this.ctx.player());
    const hand = deck?.hand ?? [];
    const { width, height } = this.scene.scale;
    const spacing = 104;
    const baseX = width / 2 - ((hand.length - 1) * spacing) / 2;
    const baseY = height - 96;
    hand.forEach((id, i) => {
      const def = cardDef(id);
      if (def === undefined) return;
      const card = this.makeCardFace(def, 1);
      card.setPosition(baseX + i * spacing, baseY).setDepth(HUD_DEPTH + i);
      card.setAngle((i - (hand.length - 1) / 2) * 4);
      card.setData('homeY', baseY);
      card.setInteractive(new Phaser.Geom.Rectangle(-48, -72, 96, 144), Phaser.Geom.Rectangle.Contains);
      card.on('pointerover', () => {
        if (this.armed === null) card.setY(baseY - 28);
      });
      card.on('pointerout', () => {
        if (this.armed === null) card.setY(card.getData('homeY') as number);
      });
      card.on('pointerdown', (p: Phaser.Input.Pointer) => this.arm('card', def, card, p));
      this.handCards.push(card);
    });
  }

  // ---- internals ---------------------------------------------------------

  /** Activate a card/spell (from its pointerdown). Re-pressing the armed one cancels. */
  private arm(
    kind: 'card' | 'spell',
    def: CardDef | SpellDef,
    obj: Phaser.GameObjects.Container,
    p: Phaser.Input.Pointer,
  ): void {
    if (this.armed !== null && this.armed.def.id === def.id) {
      this.disarm();
      return;
    }
    if (!this.ctx.canAct()) return;
    this.disarm();
    this.armed = { kind, def, firstPick: null };
    this.pressDown = { x: p.x, y: p.y };
    if (kind === 'card') obj.setY((obj.getData('homeY') as number) - 36);
    else this.setSpellSelected(obj, true);
    this.tooltip.setVisible(false);
  }

  /** Apply one target selection; play if the spec is satisfied, else await the next. */
  private advanceTarget(hex: Hex): void {
    if (this.armed === null) return;
    const spec = this.armed.def.target;
    if (spec.kind === 'twoStep' && this.armed.firstPick === null) {
      this.armed.firstPick = hex; // lock the first; the next click is the second
      this.redrawHighlight();
      return;
    }
    this.play();
  }

  private play(): void {
    if (this.armed === null) return;
    const player = this.ctx.player();
    const def = this.armed.def;
    if (this.armed.kind === 'card') {
      this.ctx.submit({ kind: 'PlayCard', entity: player, cardId: def.id, energyCost: def.cost });
    } else {
      this.ctx.submit({ kind: 'PlaySpell', entity: player, spellId: def.id, manaCost: def.cost });
    }
    this.disarm();
  }

  private disarm(): void {
    this.armed = null;
    this.pressDown = null;
    this.hovered = null;
    this.highlight.clear();
    for (const c of this.spellCircles) this.setSpellSelected(c, false);
    for (const c of this.handCards) c.setY(c.getData('homeY') as number);
  }

  private redrawHighlight(): void {
    this.highlight.clear();
    if (this.armed === null || this.hovered === null) return;
    const origin = this.originHex();
    if (origin === null) return;
    const firstPick = this.armed.firstPick ?? undefined;
    const { primary, secondary } = resolveTargeting(this.armed.def.target, origin, this.hovered, firstPick);
    for (const h of secondary) this.fillHex(h, TINT_SECONDARY);
    for (const h of primary) this.fillHex(h, TINT_PRIMARY);
  }

  private originHex(): Hex | null {
    return this.ctx.world().store(HexPosition).get(this.ctx.player())?.hex ?? null;
  }

  private fillHex(hex: Hex, color: number): void {
    const { x, y } = hexToPixel(this.ctx.layout, hex);
    const hw = this.ctx.layout.width / 2;
    const q1 = this.ctx.layout.height / 4;
    const q2 = this.ctx.layout.height / 2;
    this.highlight.fillStyle(color, 0.4);
    this.highlight.beginPath();
    this.highlight.moveTo(x, y - q2);
    this.highlight.lineTo(x + hw, y - q1);
    this.highlight.lineTo(x + hw, y + q1);
    this.highlight.lineTo(x, y + q2);
    this.highlight.lineTo(x - hw, y + q1);
    this.highlight.lineTo(x - hw, y - q1);
    this.highlight.closePath();
    this.highlight.fillPath();
  }

  private makeCardFace(def: CardDef, scale: number): Phaser.GameObjects.Container {
    const w = 96;
    const h = 144;
    const c = this.scene.add.container(0, 0);
    const bg = this.scene.add
      .rectangle(0, 0, w, h, 0x1f2430)
      .setStrokeStyle(2, this.frameColor(def.id))
      .setOrigin(0.5);
    const cost = this.scene.add
      .text(-w / 2 + 6, -h / 2 + 4, `E${def.cost}`, { fontFamily: 'monospace', fontSize: '14px', color: '#facc15' })
      .setOrigin(0, 0);
    const name = this.scene.add
      .text(0, -h / 2 + 22, def.name, { fontFamily: 'monospace', fontSize: '12px', color: '#e5e7eb' })
      .setOrigin(0.5, 0);
    const art = this.scene.add.rectangle(0, -2, w - 16, 56, 0x394150).setOrigin(0.5); // card.art.<id> slot
    const eff = this.scene.add
      .text(0, h / 2 - 42, def.effectText, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#9ca3af',
        align: 'center',
        wordWrap: { width: w - 12 },
      })
      .setOrigin(0.5, 0);
    c.add([bg, cost, name, art, eff]);
    c.setScale(scale);
    return c;
  }

  private frameColor(id: string): number {
    return id === 'melee' || id === 'ranged' ? 0xb91c1c : 0x2563eb; // attack red / skill blue
  }

  private buildSpellSidebar(): void {
    SPELL_DEFS.forEach((def, i) => {
      const x = 44;
      const y = 150 + i * 84;
      const circle = this.scene.add.container(x, y).setDepth(HUD_DEPTH);
      const ring = this.scene.add.circle(0, 0, 30, 0x394150).setStrokeStyle(3, 0x6b7280);
      const label = this.scene.add
        .text(0, 0, def.name.slice(0, 4), { fontFamily: 'monospace', fontSize: '12px', color: '#e5e7eb' })
        .setOrigin(0.5);
      circle.add([ring, label]);
      circle.setData('ring', ring);
      circle.setInteractive(new Phaser.Geom.Circle(0, 0, 30), Phaser.Geom.Circle.Contains);
      circle.on('pointerover', () => {
        if (this.armed === null) this.showTooltip(def, x + 44, y);
      });
      circle.on('pointerout', () => this.tooltip.setVisible(false));
      circle.on('pointerdown', (p: Phaser.Input.Pointer) => this.arm('spell', def, circle, p));
      this.spellCircles.push(circle);
    });
  }

  private setSpellSelected(circle: Phaser.GameObjects.Container, on: boolean): void {
    const ring = circle.getData('ring') as Phaser.GameObjects.Arc;
    ring.setStrokeStyle(3, on ? 0xfacc15 : 0x6b7280);
  }

  private showTooltip(def: SpellDef, x: number, y: number): void {
    this.tooltip.removeAll(true);
    const text = `${def.name}  (M${def.cost})\n${def.effectText}`;
    const label = this.scene.add.text(8, 6, text, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#e5e7eb',
      wordWrap: { width: 180 },
    });
    const bg = this.scene.add
      .rectangle(0, 0, label.width + 16, label.height + 12, 0x111418, 0.92)
      .setStrokeStyle(1, 0x6b7280)
      .setOrigin(0, 0);
    this.tooltip.setPosition(x, y - 16);
    this.tooltip.add([bg, label]);
    this.tooltip.setVisible(true);
  }

  private buildDeckIcon(): void {
    const { height } = this.scene.scale;
    const icon = this.scene.add.container(44, height - 40).setDepth(HUD_DEPTH);
    const r1 = this.scene.add.rectangle(4, -4, 28, 38, 0x394150).setStrokeStyle(2, 0x9ca3af);
    const r2 = this.scene.add.rectangle(-2, 2, 28, 38, 0x4b5563).setStrokeStyle(2, 0x9ca3af);
    const label = this.scene.add
      .text(0, 26, 'Deck', { fontFamily: 'monospace', fontSize: '11px', color: '#9ca3af' })
      .setOrigin(0.5, 0);
    icon.add([r1, r2, label]);
    icon.setInteractive(new Phaser.Geom.Rectangle(-22, -28, 44, 64), Phaser.Geom.Rectangle.Contains);
    icon.on('pointerdown', () => this.toggleDeck());
  }

  private buildDeckOverlay(): void {
    const { width, height } = this.scene.scale;
    this.deckOverlay = this.scene.add.container(0, 0).setDepth(HUD_DEPTH + 100).setVisible(false);
    const dim = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0).setInteractive();
    dim.on('pointerdown', () => this.toggleDeck());
    const title = this.scene.add
      .text(width / 2, 40, 'Deck', { fontFamily: 'monospace', fontSize: '24px', color: '#e5e7eb' })
      .setOrigin(0.5);
    this.deckOverlay.add([dim, title]);
    const deck = this.ctx.world().store(DeckState).get(this.ctx.player());
    const ids = deck?.collection ?? [];
    const cols = 5;
    ids.forEach((id, i) => {
      const def = cardDef(id);
      if (def === undefined) return;
      const face = this.makeCardFace(def, 0.8);
      face.setPosition(width / 2 + ((i % cols) - (cols - 1) / 2) * 110, 150 + Math.floor(i / cols) * 130);
      this.deckOverlay.add(face);
    });
  }

  private toggleDeck(): void {
    this.deckOverlay.setVisible(!this.deckOverlay.visible);
  }
}
