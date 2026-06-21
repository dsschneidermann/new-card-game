import Phaser from 'phaser';
import {
  HexPosition,
  DeckState,
  Card,
  cardDef,
  cardEffectiveCost,
  isTempFree,
  sortPileForDisplay,
  isAttackCard,
  resolveTargeting,
  targetMaxRange,
  hexToPixel,
  pixelToHex,
  hexDistance,
  hexEquals,
  neighbors,
  hexesWithinRange,
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
// Targeting paint (tint + range outline) sits on the GROUND: above the grid (drawn at
// -1_000_000) but below every character sprite (SceneSync depth = screen-Y, always > 0), so
// sprites draw over it and it reads as painted on the floor rather than covering the player.
const HL_DEPTH = -1_000;
const TINT_PRIMARY = 0xef4444; // red
const TINT_SECONDARY = 0xeab308; // yellow
const DRAG_THRESHOLD = 8; // px of pointer travel that distinguishes a drag from a click

// Deck/Discard overlay layout (base px, scaled by s()). The card grid scrolls within a viewport
// from OVERLAY_TOP (below the title) down to OVERLAY_BOTTOM_MARGIN above the screen bottom.
const OVERLAY_TOP = 90;
const OVERLAY_BOTTOM_MARGIN = 24;
const OVERLAY_PAD = 70; // top pad inside the scroll content so the first row clears the viewport edge
const OVERLAY_COLS = 5;
const OVERLAY_COL_W = 110;
const OVERLAY_ROW_H = 130;
const OVERLAY_FACE_SCALE = 0.8;
const CARD_FAN_ROTATION = 2; // each hand position away from center is rotated
const OUTLINE_EXTEND_PX = 0.5; // range-outline segments overshoot each end by this many px so convex corners close fully

/** A pixel point — a hexagon vertex / edge endpoint. */
type Pt = { x: number; y: number };

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
  private rangeOutline!: Phaser.GameObjects.Graphics; // yellow max-range boundary while a range card is armed
  private tooltip!: Phaser.GameObjects.Container;
  // Shared Deck/Discard overlay: a dim backdrop + a fixed title + a geometry-masked, scrollable card grid.
  private overlay!: Phaser.GameObjects.Container;
  private overlayTitle!: Phaser.GameObjects.Text;
  private overlayContent!: Phaser.GameObjects.Container; // the scrollable card grid (clipped by the mask)
  private overlayFaces: Phaser.GameObjects.Container[] = []; // overlay card faces, rebuilt each open
  private overlayPile: 'deck' | 'discard' | null = null; // which pile is shown (null = closed)
  private overlayScrollMin = 0; // most-negative content.y offset from the top (0 if it all fits)
  private overlayDrag: { startY: number; startContentY: number; moved: boolean } | null = null;
  private deckCount!: Phaser.GameObjects.Text; // draw-pile count over the deck icon (lower-left)
  private discardCount!: Phaser.GameObjects.Text; // discard-pile count over the discard icon (lower-right)

  constructor(ctx: CardUiContext) {
    this.ctx = ctx;
    this.scene = ctx.scene;
  }

  create(): void {
    this.highlight = this.scene.add.graphics().setDepth(HL_DEPTH);
    this.rangeOutline = this.scene.add.graphics().setDepth(HL_DEPTH);
    this.tooltip = this.scene.add.container(0, 0).setDepth(HUD_DEPTH + 10).setVisible(false);
    this.buildSpellSidebar();
    this.buildDeckIcon();
    this.buildDiscardIcon();
    this.buildOverlay();
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
    if (this.ctx.grid.inBounds(hex) && !this.blocksOwnHex(hex)) this.advanceTarget(hex);
    else this.disarm(); // dragged off the grid, or onto the caster's own hex (attacks): cancel
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

  /**
   * (Re)build the hand fan from DeckState.hand (called whenever the hand composition or a card's
   * cost changes — turn start, a play, or an effect). The hand now holds card-INSTANCE entity ids;
   * each card renders its def art, its EFFECTIVE cost, and the cost colour (green if free this hand).
   */
  refreshHand(): void {
    for (const c of this.handCards) c.destroy();
    this.handCards = [];
    const world = this.ctx.world();
    const deck = world.store(DeckState).get(this.ctx.player());
    const hand = deck?.hand ?? [];
    const layout = this.fanLayout(hand.length);
    hand.forEach((instance, i) => {
      const defId = world.store(Card).get(instance)?.defId;
      const def = defId !== undefined ? cardDef(defId) : undefined;
      if (def === undefined) return;
      const card = this.makeCardFace(def, 1, cardEffectiveCost(world, instance), isTempFree(world, instance));
      card.setData('cardEntity', instance);
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
    this.refreshPileCounts();
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
    // Downward fan arc: the centre card (odd) or two centre cards (even) sit flat, and each
    // position outward drops more, symmetric both ways. floor(|centerOffset|) is 0 for the 
    // middle card(s), then 1, 2, ... — the same mirroring as the rotation above.
    const cardFanDrop = (x: number) => x == 0 ? 0 : x == 1 ? 2 : x == 2 ? 4 : x == 3 ? 6 : x == 4 ? 12 : 0; 
    const y = layout.baseY + s(cardFanDrop(Math.floor(Math.abs(centerOffset))));
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
   * Animate a played card-instance leaving the hand and reflow the survivors — presentation ONLY.
   * The card system already moved the instance to the discard pile (the authority); this is driven
   * by the CardDiscarded event carrying the instance id. The sprite is found by its stored
   * cardEntity. (A full rebuild happens separately on HandDrawn, e.g. at turn start.)
   */
  animateCardOut(instance: EntityId): void {
    const card = this.handCards.find((c) => (c.getData('cardEntity') as EntityId) === instance);
    if (card === undefined) return;
    this.handCards.splice(this.handCards.indexOf(card), 1);
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
    this.refreshPileCounts();
  }

  // ---- internals ---------------------------------------------------------

  /** Activate a card/spell (from its pointerdown). Re-pressing the SAME instance cancels; picking a different card (even one of the same type) switches the arm to it. */
  private arm(
    kind: 'card' | 'spell',
    def: CardDef | SpellDef,
    obj: Phaser.GameObjects.Container,
    p: Phaser.Input.Pointer,
  ): void {
    if (p.rightButtonDown()) return; // right-click cancels (handled by the scene), never arms
    if (this.armed !== null && this.armed.obj === obj) {
      this.disarm();
      return;
    }
    if (!this.ctx.canAct()) return;
    // Tell the player at SELECTION time if it can't be played (not enough energy/mana, or out of
    // phase), rather than only after they target a hex. Cards use their EFFECTIVE per-instance cost.
    const cost = kind === 'card' ? this.cardCost(obj) : def.cost;
    const v =
      kind === 'card'
        ? canPlayCard(this.ctx.world(), this.ctx.player(), cost)
        : canPlaySpell(this.ctx.world(), this.ctx.player(), cost);
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
    this.drawRangeOutline(); // yellow max-range boundary, if this card has a range
    this.redrawHighlight(); // selfAoe paints its fixed burst immediately; other targets wait for a hover
  }

  /** Apply one target selection; play if the spec is satisfied, else await the next. */
  private advanceTarget(hex: Hex): void {
    if (this.armed === null) return;
    const spec = this.armed.def.target;
    // Out-of-range (but in-bounds) click: ignore it and stay armed so the player can pick a
    // valid hex (the range outline stays up). Decision flagged for review.
    const maxRange = targetMaxRange(spec);
    const origin = this.originHex();
    if (maxRange !== undefined && origin !== null && hexDistance(origin, hex) > maxRange) return;
    if (this.blocksOwnHex(hex)) return; // attacks can't target the caster's own hex: ignore (stay armed)
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
    // Record the aimed hex(es) for when effects land: the selected hex, both picks for a two-step,
    // the in-bounds burst hexes for a self-AOE (so it mirrors how targeted attacks record their
    // hits), or none for a plain self-target (whose chosen hex is ignored).
    const origin = this.originHex();
    const targets: Hex[] =
      spec.kind === 'self'
        ? []
        : spec.kind === 'selfAoe'
          ? origin === null
            ? []
            : resolveTargeting(spec, origin, finalHex).primary.filter((h) => this.ctx.grid.inBounds(h))
          : spec.kind === 'twoStep' && firstPick !== null
            ? [firstPick, finalHex]
            : [finalHex];
    const player = this.ctx.player();
    if (kind === 'card') {
      const cardEntity = obj.getData('cardEntity') as EntityId; // the played card-instance
      const energyCost = this.cardCost(obj); // effective cost (base + permanent; 0 if free this hand)
      // An attack turns the player to face the hex it was aimed at (the target hex, or the clicked
      // hex for a self-AOE); the scene applies it. Non-attack cards keep their current facing.
      this.ctx.submit({
        kind: 'PlayCard',
        entity: player,
        cardId: def.id,
        energyCost,
        cardEntity,
        ...(targets.length > 0 ? { targets } : {}),
        ...(isAttackCard(def.id) ? { faceToward: finalHex } : {}),
      });
    } else {
      this.ctx.submit(
        targets.length > 0
          ? { kind: 'PlaySpell', entity: player, spellId: def.id, manaCost: def.cost, targets }
          : { kind: 'PlaySpell', entity: player, spellId: def.id, manaCost: def.cost },
      );
    }
    this.disarm();
    // The played card leaves the hand for the turn, but the SIMULATION owns that: the card system
    // moves the instance to the discard pile (and resolves its effect) and emits CardDiscarded,
    // which the scene turns into animateCardOut(). Spells stay in the sidebar. (No deck write here.)
  }

  /** Effective energy cost of a hand card object (reads its instance's base + permanent + temp modifiers). */
  private cardCost(obj: Phaser.GameObjects.Container): number {
    const instance = obj.getData('cardEntity') as EntityId | undefined;
    return instance === undefined ? 0 : cardEffectiveCost(this.ctx.world(), instance);
  }

  private disarm(): void {
    this.armed = null;
    this.pressDown = null;
    this.hovered = null;
    this.highlight.clear();
    this.rangeOutline.clear();
    for (const c of this.spellCircles) this.setSpellSelected(c, false);
    for (const c of this.handCards) {
      this.setCardSelected(c, false);
      c.setY(c.getData('homeY') as number);
      c.setDepth(HUD_DEPTH + (c.getData('handIndex') as number)); // restore the fan draw order
    }
  }

  private redrawHighlight(): void {
    this.highlight.clear();
    if (this.armed === null) return;
    const origin = this.originHex();
    if (origin === null) return;
    const spec = this.armed.def.target;
    // selfAoe is a fixed, self-centered burst: paint it regardless of the pointer (even off-grid /
    // before the first move). Every other target needs a valid hovered hex (off-board = no overlay,
    // matching the rule that an off-grid click cancels the armed action).
    if (spec.kind !== 'selfAoe' && (this.hovered === null || !this.ctx.grid.inBounds(this.hovered))) return;
    const hovered = this.hovered ?? origin; // selfAoe ignores it; origin is a harmless default
    if (this.blocksOwnHex(hovered)) return; // attacks: no indicator on the caster's own hex
    const firstPick = this.armed.firstPick ?? undefined;
    const { primary, secondary } = resolveTargeting(spec, origin, hovered, firstPick);
    // Clip each highlighted hex to the board so a multi-hex target (e.g. an areaOfEffect disk near
    // an edge) never paints off-grid — the hovered centre being in-bounds is not enough.
    for (const h of secondary) if (this.ctx.grid.inBounds(h)) this.fillHex(h, TINT_SECONDARY);
    for (const h of primary) if (this.ctx.grid.inBounds(h)) this.fillHex(h, TINT_PRIMARY);
  }

  private originHex(): Hex | null {
    return this.ctx.world().store(HexPosition).get(this.ctx.player())?.hex ?? null;
  }

  /**
   * An attack can never target the caster's own hex. True when an ATTACK card with a single-target
   * or ranged spec (singleHex / lineOfSight) is armed and `hex` is the player's own hex. selfAoe,
   * area spells and self cards are unaffected (they ignore the hovered hex or legitimately cover it).
   */
  private blocksOwnHex(hex: Hex): boolean {
    if (this.armed === null) return false;
    if (this.armed.kind !== 'card' || !isAttackCard(this.armed.def.id)) return false;
    const spec = this.armed.def.target;
    if (spec.kind !== 'singleHex' && spec.kind !== 'lineOfSight') return false;
    const origin = this.originHex();
    return origin !== null && hexEquals(hex, origin);
  }

  /** The 6 pointy-top hexagon vertices (px) for a hex: top, upper-right, lower-right, bottom, lower-left, upper-left. */
  private hexVertices(hex: Hex): [Pt, Pt, Pt, Pt, Pt, Pt] {
    const { x, y } = hexToPixel(this.ctx.layout, hex);
    const hw = this.ctx.layout.width / 2;
    const q1 = this.ctx.layout.height / 4;
    const q2 = this.ctx.layout.height / 2;
    return [
      { x, y: y - q2 },
      { x: x + hw, y: y - q1 },
      { x: x + hw, y: y + q1 },
      { x, y: y + q2 },
      { x: x - hw, y: y + q1 },
      { x: x - hw, y: y - q1 },
    ];
  }

  /**
   * Draw the yellow max-range boundary for the armed card (if its target has a maxRange):
   * the outer edges of the in-bounds hexes within range. An edge is stroked wherever its
   * neighbour is OUT of range — whether that neighbour is on or off the board — so the outline
   * closes along the board edge when the range boundary lands exactly on it (e.g. range 1 a single
   * tile from the edge). In-range neighbours are skipped: an in-bounds one is an internal edge, and
   * an off-board one means the range extends past the board, where we still draw nothing so it
   * bleeds cleanly to the rim. Every stroked edge belongs to an in-bounds hex, so the line never
   * leaves the board. Range is purely hex distance.
   */
  private drawRangeOutline(): void {
    this.rangeOutline.clear();
    if (this.armed === null) return;
    const maxRange = targetMaxRange(this.armed.def.target);
    if (maxRange === undefined) return;
    const origin = this.originHex();
    if (origin === null) return;
    this.rangeOutline.lineStyle(s(2), TINT_SECONDARY, 0.9);
    for (const hex of hexesWithinRange(origin, maxRange)) {
      if (!this.ctx.grid.inBounds(hex)) continue;
      const verts = this.hexVertices(hex);
      for (const n of neighbors(hex)) {
        // Skip in-range neighbours (an in-bounds one is an internal edge; an off-board one means the
        // range bleeds past the rim — draw nothing). Stroke the boundary edge toward any out-of-range
        // neighbour, on or off the board: it is this in-bounds hex's own edge, so it stays on-board.
        if (hexDistance(origin, n) <= maxRange) continue;
        this.strokeNearestEdge(verts, hexToPixel(this.ctx.layout, n));
      }
    }
  }

  /** Stroke the hex edge (of the 6 in `v`) whose midpoint is nearest `target` — the edge shared with that neighbour. */
  private strokeNearestEdge(v: [Pt, Pt, Pt, Pt, Pt, Pt], target: Pt): void {
    const edges: [Pt, Pt][] = [
      [v[0], v[1]], [v[1], v[2]], [v[2], v[3]], [v[3], v[4]], [v[4], v[5]], [v[5], v[0]],
    ];
    let best: [Pt, Pt] | null = null;
    let bestDist = Infinity;
    for (const [a, b] of edges) {
      const dx = (a.x + b.x) / 2 - target.x;
      const dy = (a.y + b.y) / 2 - target.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = [a, b];
      }
    }
    if (best === null) return;
    // Overshoot both ends along the edge direction so neighbouring segments overlap at the
    // shared vertex and the convex corners close fully (no gaps between separate strokes).
    const [a, b] = best;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const t = s(OUTLINE_EXTEND_PX) / len;
    this.rangeOutline.lineBetween(
      a.x - (b.x - a.x) * t,
      a.y - (b.y - a.y) * t,
      b.x + (b.x - a.x) * t,
      b.y + (b.y - a.y) * t,
    );
  }

  private fillHex(hex: Hex, color: number): void {
    const v = this.hexVertices(hex);
    this.highlight.fillStyle(color, 0.4);
    this.highlight.beginPath();
    this.highlight.moveTo(v[0].x, v[0].y);
    this.highlight.lineTo(v[1].x, v[1].y);
    this.highlight.lineTo(v[2].x, v[2].y);
    this.highlight.lineTo(v[3].x, v[3].y);
    this.highlight.lineTo(v[4].x, v[4].y);
    this.highlight.lineTo(v[5].x, v[5].y);
    this.highlight.closePath();
    this.highlight.fillPath();
  }

  /**
   * Build a card face showing its EFFECTIVE cost. The cost is GREEN when a temporary override is
   * active (free this hand), else YELLOW — the normal colour, including a permanently-reduced cost.
   */
  private makeCardFace(def: CardDef, scale: number, cost: number, tempFree: boolean): Phaser.GameObjects.Container {
    const w = s(96);
    const h = s(144);
    const c = this.scene.add.container(0, 0);
    const bg = this.scene.add
      .rectangle(0, 0, w, h, 0x1f2430)
      .setStrokeStyle(s(2), this.frameColor(def.id))
      .setOrigin(0.5);
    const costText = this.scene.add
      .text(-w / 2 + s(6), -h / 2 + s(4), `E${cost}`, {
        fontFamily: 'monospace',
        fontSize: `${s(14)}px`,
        color: tempFree ? '#22c55e' : '#facc15', // green = temporary free; yellow = base/permanent
      })
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
    c.add([bg, costText, name, art, eff]);
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
    // Cards still in the draw pile, shown over the stack (kept current by refreshPileCounts).
    this.deckCount = this.scene.add
      .text(0, -s(2), '0', { fontFamily: 'monospace', fontSize: `${s(16)}px`, color: '#e5e7eb' })
      .setOrigin(0.5);
    const label = this.scene.add
      .text(0, s(26), 'Deck', { fontFamily: 'monospace', fontSize: `${s(11)}px`, color: '#9ca3af' })
      .setOrigin(0.5, 0);
    icon.add([r1, r2, this.deckCount, label]);
    icon.setInteractive(new Phaser.Geom.Rectangle(-s(22), -s(28), s(44), s(64)), Phaser.Geom.Rectangle.Contains);
    icon.on('pointerdown', () => this.toggleOverlay('deck'));
  }

  /** A discard-pile icon mirroring the deck icon at the lower-right, showing the discard count. */
  private buildDiscardIcon(): void {
    const { width, height } = this.scene.scale;
    const icon = this.scene.add.container(width - s(44), height - s(40)).setDepth(HUD_DEPTH);
    const r1 = this.scene.add.rectangle(s(4), -s(4), s(28), s(38), 0x394150).setStrokeStyle(s(2), 0x9ca3af);
    const r2 = this.scene.add.rectangle(-s(2), s(2), s(28), s(38), 0x4b5563).setStrokeStyle(s(2), 0x9ca3af);
    this.discardCount = this.scene.add
      .text(0, -s(2), '0', { fontFamily: 'monospace', fontSize: `${s(16)}px`, color: '#e5e7eb' })
      .setOrigin(0.5);
    const label = this.scene.add
      .text(0, s(26), 'Discard', { fontFamily: 'monospace', fontSize: `${s(11)}px`, color: '#9ca3af' })
      .setOrigin(0.5, 0);
    icon.add([r1, r2, this.discardCount, label]);
    icon.setInteractive(new Phaser.Geom.Rectangle(-s(22), -s(28), s(44), s(64)), Phaser.Geom.Rectangle.Contains);
    icon.on('pointerdown', () => this.toggleOverlay('discard'));
  }

  /** Refresh the draw-pile (Deck) and discard-pile counters from the live DeckState. */
  private refreshPileCounts(): void {
    const deck = this.ctx.world().store(DeckState).get(this.ctx.player());
    this.deckCount.setText(String(deck?.drawPile.length ?? 0));
    this.discardCount.setText(String(deck?.discardPile.length ?? 0));
  }

  private buildOverlay(): void {
    const { width, height } = this.scene.scale;
    this.overlay = this.scene.add.container(0, 0).setDepth(HUD_DEPTH + 100).setVisible(false);
    const dim = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0).setInteractive();
    // A press on the backdrop starts a potential scroll-drag; a release WITHOUT a drag (a tap) closes.
    dim.on('pointerdown', (p: Phaser.Input.Pointer) => this.beginOverlayDrag(p));
    this.overlayTitle = this.scene.add
      .text(width / 2, s(40), 'Deck', { fontFamily: 'monospace', fontSize: `${s(24)}px`, color: '#e5e7eb' })
      .setOrigin(0.5);
    this.overlayContent = this.scene.add.container(0, s(OVERLAY_TOP)); // scrolled by moving its y
    // Clip the card grid to the viewport (below the title, above the bottom margin) so a long list
    // scrolls inside a window instead of running off the bottom of the screen.
    const viewportH = height - s(OVERLAY_BOTTOM_MARGIN) - s(OVERLAY_TOP);
    const maskShape = this.scene.make.graphics({}, false);
    maskShape.fillStyle(0xffffff).fillRect(0, s(OVERLAY_TOP), width, viewportH);
    this.overlayContent.setMask(maskShape.createGeometryMask());
    this.overlay.add([dim, this.overlayTitle, this.overlayContent]);
    // Scroll input — mouse WHEEL + DRAG (touch-friendly) — guarded to act only while an overlay is open.
    this.scene.input.on('wheel', (_p: Phaser.Input.Pointer, _o: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      if (this.overlay.visible) this.scrollOverlay(this.overlayContent.y - dy);
    });
    this.scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onOverlayDragMove(p));
    this.scene.input.on('pointerup', () => this.endOverlayDrag());
  }

  /** Open the shared overlay on a pile (or close it if that pile is already showing), rebuilding its sorted grid. */
  private toggleOverlay(pile: 'deck' | 'discard'): void {
    if (this.overlay.visible && this.overlayPile === pile) {
      this.closeOverlay();
      return;
    }
    const deck = this.ctx.world().store(DeckState).get(this.ctx.player());
    const ids = pile === 'deck' ? deck?.drawPile ?? [] : deck?.discardPile ?? [];
    this.overlayTitle.setText(pile === 'deck' ? 'Deck' : 'Discard');
    this.populateOverlay(ids);
    this.overlayContent.y = s(OVERLAY_TOP); // reset scroll to the top on each open
    this.overlayDrag = null;
    this.overlayPile = pile;
    this.overlay.setVisible(true);
  }

  private closeOverlay(): void {
    this.overlay.setVisible(false);
    this.overlayPile = null;
    this.overlayDrag = null;
  }

  /**
   * Rebuild the overlay's card faces from `ids`, SORTED for display (attacks first, then effective cost
   * ascending — see sortPileForDisplay). Faces live in the scrollable content container; the scroll
   * clamp is recomputed from the resulting content height. Costs are effective (base + permanent).
   */
  private populateOverlay(ids: readonly EntityId[]): void {
    const { width, height } = this.scene.scale;
    for (const f of this.overlayFaces) f.destroy();
    this.overlayFaces = [];
    const world = this.ctx.world();
    const sorted = sortPileForDisplay(world, ids);
    sorted.forEach((instance, i) => {
      const defId = world.store(Card).get(instance)?.defId;
      const def = defId !== undefined ? cardDef(defId) : undefined;
      if (def === undefined) return;
      const face = this.makeCardFace(def, OVERLAY_FACE_SCALE, cardEffectiveCost(world, instance), isTempFree(world, instance));
      const col = i % OVERLAY_COLS;
      const row = Math.floor(i / OVERLAY_COLS);
      face.setPosition(width / 2 + (col - (OVERLAY_COLS - 1) / 2) * s(OVERLAY_COL_W), s(OVERLAY_PAD) + row * s(OVERLAY_ROW_H));
      this.overlayContent.add(face);
      this.overlayFaces.push(face);
    });
    const rows = Math.ceil(sorted.length / OVERLAY_COLS);
    const contentH = s(OVERLAY_PAD) + rows * s(OVERLAY_ROW_H);
    const viewportH = height - s(OVERLAY_BOTTOM_MARGIN) - s(OVERLAY_TOP);
    this.overlayScrollMin = Math.min(0, viewportH - contentH); // <= 0: how far up the grid can scroll
  }

  /** Clamp the content container's y to the scroll range [top + scrollMin, top]. */
  private scrollOverlay(y: number): void {
    const top = s(OVERLAY_TOP);
    this.overlayContent.y = Phaser.Math.Clamp(y, top + this.overlayScrollMin, top);
  }

  private beginOverlayDrag(p: Phaser.Input.Pointer): void {
    if (this.overlay.visible) this.overlayDrag = { startY: p.y, startContentY: this.overlayContent.y, moved: false };
  }

  private onOverlayDragMove(p: Phaser.Input.Pointer): void {
    if (this.overlayDrag === null) return;
    const dy = p.y - this.overlayDrag.startY;
    if (Math.abs(dy) > s(DRAG_THRESHOLD)) this.overlayDrag.moved = true;
    this.scrollOverlay(this.overlayDrag.startContentY + dy);
  }

  /** End a backdrop press: a tap (no drag) closes the overlay; a drag just ends. */
  private endOverlayDrag(): void {
    if (this.overlayDrag === null) return;
    const wasTap = !this.overlayDrag.moved;
    this.overlayDrag = null;
    if (wasTap) this.closeOverlay();
  }
}
