import Phaser from 'phaser';
import {
  HexPosition,
  DeckState,
  cardDef,
  isAttackCard,
  resolveTargeting,
  hexToPixel,
  pixelToHex,
  SPELL_DEFS,
  s,
  canPlayCard,
  canPlaySpell,
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
  /** Surface a transient message to the player (e.g. why a card can't be played). */
  notify(message: string): void;
}

interface Armed {
  kind: 'card' | 'spell';
  def: CardDef | SpellDef;
  obj: Phaser.GameObjects.Container; // the specific armed instance — re-pressing THIS one cancels
  firstPick: Hex | null;
}

const HUD_DEPTH = 2_000_000;
const CARD_FRONT_DEPTH = HUD_DEPTH + 50; // a hovered or selected hand card draws above its neighbours
const HL_DEPTH = 500_000;
const TINT_PRIMARY = 0xef4444; // red
const TINT_SECONDARY = 0xeab308; // yellow
const DRAG_THRESHOLD = 8; // px of pointer travel that distinguishes a drag from a click
const CARD_FAN_ROTATION = 2; // each hand position away form center is rotated
const CARD_FAN_DROP_PX = 2; // quadratic fan arc: a card N whole steps from centre drops s(N*N*this) px

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
    const moved = Phaser.Math.Distance.Between(this.pressDown.x, this.pressDown.y, p.x, p.y) > s(DRAG_THRESHOLD);
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

  /** (Re)build the hand fan from DeckState.hand (called at turn start with a fresh hand). */
  refreshHand(): void {
    for (const c of this.handCards) c.destroy();
    this.handCards = [];
    const deck = this.ctx.world().store(DeckState).get(this.ctx.player());
    const hand = deck?.hand ?? [];
    const layout = this.fanLayout(hand.length);
    hand.forEach((id, i) => {
      const def = cardDef(id);
      if (def === undefined) return;
      const card = this.makeCardFace(def, 1);
      this.placeCard(card, i, hand.length, layout, false);
      card.setInteractive(new Phaser.Geom.Rectangle(-s(48), -s(72), s(96), s(144)), Phaser.Geom.Rectangle.Contains);
      card.on('pointerover', () => {
        if (this.armed === null) {
          card.setY((card.getData('homeY') as number) - s(28));
          card.setDepth(CARD_FRONT_DEPTH); // lift the hovered card above its neighbours
        }
      });
      card.on('pointerout', () => {
        if (this.armed === null) {
          card.setY(card.getData('homeY') as number);
          card.setDepth(HUD_DEPTH + (card.getData('handIndex') as number)); // back to its fan slot
        }
      });
      card.on('pointerdown', (p: Phaser.Input.Pointer) => this.arm('card', def, card, p));
      this.handCards.push(card);
    });
  }

  /**
   * Fan geometry for a hand of `count` cards. Spacing is the base s(104) but shrinks
   * for larger hands so the whole fan stays within the screen width (half-card margins
   * each side); cards are centred horizontally and tucked near the bottom edge.
   */
  private fanLayout(count: number): { spacing: number; baseX: number; baseY: number } {
    const { width, height } = this.scene.scale;
    const maxSpan = width - s(192); // outermost card centres stay inside the screen
    const spacing = count > 1 ? Math.min(s(104), maxSpan / (count - 1)) : 0;
    const baseX = width / 2 - ((count - 1) * spacing) / 2;
    const baseY = height - s(52); // tucked: most of each card shows above the bottom edge
    return { spacing, baseX, baseY };
  }

  /**
   * Position one hand card at slot `i` of `count`, recording its slot index and home Y.
   * animate=true tweens it to the slot (used when the hand reflows after a play);
   * animate=false snaps it (used when the hand is freshly built).
   */
  private placeCard(
    card: Phaser.GameObjects.Container,
    i: number,
    count: number,
    layout: { spacing: number; baseX: number; baseY: number },
    animate: boolean,
  ): void {
    const centerOffset = i - (count - 1) / 2; // signed distance from centre (half-steps for even counts)
    const x = layout.baseX + i * layout.spacing;
    const angle = centerOffset * CARD_FAN_ROTATION;
    // Downward fan arc: the centre card (odd) or two centre cards (even) sit flat, and each whole
    // step outward drops further on a quadratic curve (accelerating toward the edges), symmetric
    // both ways. floor(|centerOffset|) is 0 for the middle card(s), then 1, 2, ... — the same
    // centre metric as the rotation above; quadratic so it generalises to any hand size.
    const step = Math.floor(Math.abs(centerOffset));
    const y = layout.baseY + s(step * step * CARD_FAN_DROP_PX);
    card.setData('handIndex', i);
    card.setData('homeY', y);
    card.setDepth(HUD_DEPTH + i);
    if (animate) {
      this.scene.tweens.add({ targets: card, x, y, angle, duration: 160, ease: 'Quad.easeOut' });
    } else {
      card.setPosition(x, y).setAngle(angle);
    }
  }

  /**
   * Remove the just-played card from the hand: drop its instance from DeckState.hand
   * (by slot, so a duplicate removes the right copy), tween the card out, then reflow
   * the survivors to their new fan positions. The hand only fully rebuilds at turn start.
   */
  private removePlayedCard(card: Phaser.GameObjects.Container): void {
    const arrayPos = this.handCards.indexOf(card);
    if (arrayPos === -1) return;
    const handIndex = card.getData('handIndex') as number;
    const deck = this.ctx.world().store(DeckState).get(this.ctx.player());
    if (deck !== undefined && handIndex >= 0 && handIndex < deck.hand.length) {
      deck.hand.splice(handIndex, 1);
    }
    this.handCards.splice(arrayPos, 1);
    this.scene.tweens.add({
      targets: card,
      y: card.y - s(60),
      alpha: 0,
      scale: 0.6,
      duration: 160,
      ease: 'Quad.easeOut',
      onComplete: () => card.destroy(),
    });
    const layout = this.fanLayout(this.handCards.length);
    this.handCards.forEach((c, i) => this.placeCard(c, i, this.handCards.length, layout, true));
  }

  // ---- internals ---------------------------------------------------------

  /** Activate a card/spell (from its pointerdown). Re-pressing the SAME instance cancels; picking a different card (even one of the same type) switches the arm to it. */
  private arm(
    kind: 'card' | 'spell',
    def: CardDef | SpellDef,
    obj: Phaser.GameObjects.Container,
    p: Phaser.Input.Pointer,
  ): void {
    if (this.armed !== null && this.armed.obj === obj) {
      this.disarm();
      return;
    }
    if (!this.ctx.canAct()) return;
    // Tell the player at SELECTION time if it can't be played (not enough energy/mana, or
    // out of phase), rather than only after they target a hex.
    const v =
      kind === 'card'
        ? canPlayCard(this.ctx.world(), this.ctx.player(), def.cost)
        : canPlaySpell(this.ctx.world(), this.ctx.player(), def.cost);
    if (!v.ok) {
      this.ctx.notify(v.reason);
      return;
    }
    this.disarm();
    this.armed = { kind, def, obj, firstPick: null };
    this.pressDown = { x: p.x, y: p.y };
    // An armed card drops back into the hand (so the whole board stays visible) and shows
    // a yellow selected border; a spell lights up its ring — the same "selected" affordance.
    if (kind === 'card') {
      this.setCardSelected(obj, true);
      obj.setDepth(CARD_FRONT_DEPTH); // the selected card draws above its neighbours
    } else {
      this.setSpellSelected(obj, true);
    }
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
    this.play(hex);
  }

  private play(finalHex: Hex): void {
    if (this.armed === null) return;
    const { kind, def, firstPick, obj } = this.armed;
    const spec = def.target;
    // Record the aimed hex(es) for when effects land: the selected hex, both picks for a
    // two-step, or none for a self-target (whose chosen hex is ignored).
    const targets: Hex[] =
      spec.kind === 'self'
        ? []
        : spec.kind === 'twoStep' && firstPick !== null
          ? [firstPick, finalHex]
          : [finalHex];
    const player = this.ctx.player();
    if (kind === 'card') {
      this.ctx.submit(
        targets.length > 0
          ? { kind: 'PlayCard', entity: player, cardId: def.id, energyCost: def.cost, targets }
          : { kind: 'PlayCard', entity: player, cardId: def.id, energyCost: def.cost },
      );
    } else {
      this.ctx.submit(
        targets.length > 0
          ? { kind: 'PlaySpell', entity: player, spellId: def.id, manaCost: def.cost, targets }
          : { kind: 'PlaySpell', entity: player, spellId: def.id, manaCost: def.cost },
      );
    }
    this.disarm();
    // A played card leaves the hand for the rest of the turn (spells stay in the sidebar).
    if (kind === 'card') this.removePlayedCard(obj);
  }

  private disarm(): void {
    this.armed = null;
    this.pressDown = null;
    this.hovered = null;
    this.highlight.clear();
    for (const c of this.spellCircles) this.setSpellSelected(c, false);
    for (const c of this.handCards) {
      this.setCardSelected(c, false);
      c.setY(c.getData('homeY') as number);
      c.setDepth(HUD_DEPTH + (c.getData('handIndex') as number)); // restore the fan draw order
    }
  }

  private redrawHighlight(): void {
    this.highlight.clear();
    if (this.armed === null || this.hovered === null) return;
    // No hex under the pointer (off the board) = no target = no visual effect, matching
    // the rule that an off-grid click cancels the armed action.
    if (!this.ctx.grid.inBounds(this.hovered)) return;
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
    const w = s(96);
    const h = s(144);
    const c = this.scene.add.container(0, 0);
    const bg = this.scene.add
      .rectangle(0, 0, w, h, 0x1f2430)
      .setStrokeStyle(s(2), this.frameColor(def.id))
      .setOrigin(0.5);
    const cost = this.scene.add
      .text(-w / 2 + s(6), -h / 2 + s(4), `E${def.cost}`, { fontFamily: 'monospace', fontSize: `${s(14)}px`, color: '#facc15' })
      .setOrigin(0, 0);
    const name = this.scene.add
      .text(0, -h / 2 + s(22), def.name, { fontFamily: 'monospace', fontSize: `${s(12)}px`, color: '#e5e7eb' })
      .setOrigin(0.5, 0);
    const art = this.scene.add.rectangle(0, -s(2), w - s(16), s(56), 0x394150).setOrigin(0.5); // card.art.<id> slot
    const eff = this.scene.add
      .text(0, h / 2 - s(42), def.effectText, {
        fontFamily: 'monospace',
        fontSize: `${s(10)}px`,
        color: '#9ca3af',
        align: 'center',
        wordWrap: { width: w - s(12) },
      })
      .setOrigin(0.5, 0);
    c.add([bg, cost, name, art, eff]);
    c.setData('bg', bg);
    c.setData('frameColor', this.frameColor(def.id));
    c.setScale(scale);
    return c;
  }

  private frameColor(id: string): number {
    return isAttackCard(id) ? 0xb91c1c : 0x2563eb; // attack red / skill blue
  }

  /** Toggle a hand card's "selected" border: yellow when armed, its frame colour otherwise. */
  private setCardSelected(card: Phaser.GameObjects.Container, on: boolean): void {
    const bg = card.getData('bg') as Phaser.GameObjects.Rectangle | undefined;
    if (bg === undefined) return;
    bg.setStrokeStyle(s(2), on ? 0xfacc15 : (card.getData('frameColor') as number));
  }

  private buildSpellSidebar(): void {
    SPELL_DEFS.forEach((def, i) => {
      const x = s(44);
      const y = s(150) + i * s(84);
      const circle = this.scene.add.container(x, y).setDepth(HUD_DEPTH);
      const ring = this.scene.add.circle(0, 0, s(30), 0x394150).setStrokeStyle(s(3), 0x6b7280);
      const label = this.scene.add
        .text(0, 0, def.name.slice(0, 4), { fontFamily: 'monospace', fontSize: `${s(12)}px`, color: '#e5e7eb' })
        .setOrigin(0.5);
      circle.add([ring, label]);
      circle.setData('ring', ring);
      circle.setInteractive(new Phaser.Geom.Circle(0, 0, s(30)), Phaser.Geom.Circle.Contains);
      circle.on('pointerover', () => {
        if (this.armed === null) this.showTooltip(def, x + s(44), y);
      });
      circle.on('pointerout', () => this.tooltip.setVisible(false));
      circle.on('pointerdown', (p: Phaser.Input.Pointer) => this.arm('spell', def, circle, p));
      this.spellCircles.push(circle);
    });
  }

  private setSpellSelected(circle: Phaser.GameObjects.Container, on: boolean): void {
    const ring = circle.getData('ring') as Phaser.GameObjects.Arc;
    ring.setStrokeStyle(s(3), on ? 0xfacc15 : 0x6b7280);
  }

  private showTooltip(def: SpellDef, x: number, y: number): void {
    this.tooltip.removeAll(true);
    const text = `${def.name}  (M${def.cost})\n${def.effectText}`;
    const label = this.scene.add.text(s(8), s(6), text, {
      fontFamily: 'monospace',
      fontSize: `${s(11)}px`,
      color: '#e5e7eb',
      wordWrap: { width: s(180) },
    });
    const bg = this.scene.add
      .rectangle(0, 0, label.width + s(16), label.height + s(12), 0x111418, 0.92)
      .setStrokeStyle(s(1), 0x6b7280)
      .setOrigin(0, 0);
    this.tooltip.setPosition(x, y - s(16));
    this.tooltip.add([bg, label]);
    this.tooltip.setVisible(true);
  }

  private buildDeckIcon(): void {
    const { height } = this.scene.scale;
    const icon = this.scene.add.container(s(44), height - s(40)).setDepth(HUD_DEPTH);
    const r1 = this.scene.add.rectangle(s(4), -s(4), s(28), s(38), 0x394150).setStrokeStyle(s(2), 0x9ca3af);
    const r2 = this.scene.add.rectangle(-s(2), s(2), s(28), s(38), 0x4b5563).setStrokeStyle(s(2), 0x9ca3af);
    const label = this.scene.add
      .text(0, s(26), 'Deck', { fontFamily: 'monospace', fontSize: `${s(11)}px`, color: '#9ca3af' })
      .setOrigin(0.5, 0);
    icon.add([r1, r2, label]);
    icon.setInteractive(new Phaser.Geom.Rectangle(-s(22), -s(28), s(44), s(64)), Phaser.Geom.Rectangle.Contains);
    icon.on('pointerdown', () => this.toggleDeck());
  }

  private buildDeckOverlay(): void {
    const { width, height } = this.scene.scale;
    this.deckOverlay = this.scene.add.container(0, 0).setDepth(HUD_DEPTH + 100).setVisible(false);
    const dim = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0).setInteractive();
    dim.on('pointerdown', () => this.toggleDeck());
    const title = this.scene.add
      .text(width / 2, s(40), 'Deck', { fontFamily: 'monospace', fontSize: `${s(24)}px`, color: '#e5e7eb' })
      .setOrigin(0.5);
    this.deckOverlay.add([dim, title]);
    const deck = this.ctx.world().store(DeckState).get(this.ctx.player());
    const ids = deck?.collection ?? [];
    const cols = 5;
    ids.forEach((id, i) => {
      const def = cardDef(id);
      if (def === undefined) return;
      const face = this.makeCardFace(def, 0.8);
      face.setPosition(width / 2 + ((i % cols) - (cols - 1) / 2) * s(110), s(150) + Math.floor(i / cols) * s(130));
      this.deckOverlay.add(face);
    });
  }

  private toggleDeck(): void {
    this.deckOverlay.setVisible(!this.deckOverlay.visible);
  }
}
