import Phaser from 'phaser';
import {
  HexPosition,
  DeckState,
  Card,
  cardDef,
  cardEffectiveCost,
  isTempFree,
  sortPileForDisplay,
  pickCandidates,
  isAttackCard,
  resolveTargeting,
  targetMaxRange,
  pixelToHex,
  hexDistance,
  hexEquals,
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
import { PileOverlay, OVERLAY_FACE_SCALE, type OverlayItem } from './PileOverlay';
import { TargetingPainter } from './TargetingPainter';

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
const DRAG_THRESHOLD = 8; // px of pointer travel that distinguishes a drag from a click
const CARD_FAN_ROTATION = 2; // each hand position away from center is rotated

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
  private painter!: TargetingPainter; // the ground-layer targeting tint + range outline (its own widget)
  private tooltip!: Phaser.GameObjects.Container;
  // The Deck/Discard/card-picker overlay (its own widget); CardController only opens/closes it.
  private overlay!: PileOverlay;
  private overlayPile: 'deck' | 'discard' | null = null; // which pile the browse overlay shows (null = closed)
  private deckCount!: Phaser.GameObjects.Text; // draw-pile count over the deck icon (lower-left)
  private discardCount!: Phaser.GameObjects.Text; // discard-pile count over the discard icon (lower-right)

  constructor(ctx: CardUiContext) {
    this.ctx = ctx;
    this.scene = ctx.scene;
  }

  create(): void {
    this.painter = new TargetingPainter(this.scene, this.ctx.grid, this.ctx.layout);
    this.tooltip = this.scene.add.container(0, 0).setDepth(HUD_DEPTH + 10).setVisible(false);
    this.buildSpellSidebar();
    this.buildDeckIcon();
    this.buildDiscardIcon();
    this.overlay = new PileOverlay(this.scene);
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

  /**
   * Esc / cancel / turn change: drop any armed card/spell AND close the Deck/Discard overlay. Ending
   * the turn (Space) and restarting it (R) both call this, and after either the piles change — so a
   * still-open overlay would show stale cards. Closing here also covers TurnStarted. (When a card is
   * armed the overlay is already closed, so this is a no-op in the Esc/right-click cancel paths.)
   */
  cancel(): void {
    this.disarm();
    this.overlay.close();
    this.overlayPile = null;
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
    // A card-picker card (e.g. Recall) needs at least one candidate in its source pile; reject at
    // selection (with a toast) if the pile is empty or the pick's filter matches nothing.
    if (kind === 'card') {
      const pick = cardDef(def.id)?.pickFrom;
      if (pick !== undefined) {
        const deck = this.ctx.world().store(DeckState).get(this.ctx.player());
        if (deck === undefined || pickCandidates(this.ctx.world(), deck, pick).length === 0) {
          this.ctx.notify('No cards to pick');
          return;
        }
      }
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
    // A card that picks a target card from a pile (e.g. Recall from the discard) DEFERS its play: open
    // the card picker; a selected card commits the play (cardTargets), tapping outside cancels.
    if (kind === 'card' && cardDef(def.id)?.pickFrom !== undefined) {
      this.openCardPick(obj, def);
      return;
    }
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

  /**
   * A pickFrom card defers its play: open the card picker on its source pile (discard). A selected card
   * commits the play with cardTargets=[picked]; tapping outside cancels (the card stays in hand). The
   * pile is non-empty here (arm() rejects an empty one); the guard is defensive.
   */
  private openCardPick(obj: Phaser.GameObjects.Container, def: CardDef | SpellDef): void {
    const world = this.ctx.world();
    const deck = world.store(DeckState).get(this.ctx.player());
    const pick = cardDef(def.id)?.pickFrom;
    if (deck === undefined || pick === undefined) {
      this.disarm();
      return;
    }
    const candidates = pickCandidates(world, deck, pick);
    if (candidates.length === 0) {
      this.disarm(); // defensive: arm() already rejects a card with no candidates
      return;
    }
    const player = this.ctx.player();
    const cardEntity = obj.getData('cardEntity') as EntityId;
    const energyCost = this.cardCost(obj);
    this.overlay.openPicker('Select a card to return to hand', this.buildOverlayItems(candidates), (picked) => {
      if (picked !== null) {
        this.ctx.submit({ kind: 'PlayCard', entity: player, cardId: def.id, energyCost, cardEntity, cardTargets: [picked] });
      }
      this.disarm();
    });
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
    this.painter.clear();
    for (const c of this.spellCircles) this.setSpellSelected(c, false);
    for (const c of this.handCards) {
      this.setCardSelected(c, false);
      c.setY(c.getData('homeY') as number);
      c.setDepth(HUD_DEPTH + (c.getData('handIndex') as number)); // restore the fan draw order
    }
  }

  /** Repaint the armed card's target tint (delegated to the painter; nothing to paint when not armed). */
  private redrawHighlight(): void {
    if (this.armed === null) return;
    const origin = this.originHex();
    if (origin === null) return;
    this.painter.redrawHighlight(
      this.armed.def.target,
      origin,
      this.hovered,
      this.armed.firstPick ?? undefined,
      (h) => this.blocksOwnHex(h),
    );
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

  /** Repaint the armed card's yellow max-range boundary (delegated; a no-op for unranged targets). */
  private drawRangeOutline(): void {
    if (this.armed === null) return;
    const origin = this.originHex();
    if (origin === null) return;
    this.painter.drawRange(this.armed.def.target, origin);
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
      .text(-s(2), -s(2), '0', { fontFamily: 'monospace', fontSize: `${s(16)}px`, color: '#e5e7eb' })
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
      .text(-s(2), -s(2), '0', { fontFamily: 'monospace', fontSize: `${s(16)}px`, color: '#e5e7eb' })
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

  /** Open the Deck or Discard browse overlay on a pile, or close it if that pile is already showing. */
  private toggleOverlay(pile: 'deck' | 'discard'): void {
    if (this.overlay.isOpen() && this.overlayPile === pile) {
      this.overlay.close();
      this.overlayPile = null;
      return;
    }
    const deck = this.ctx.world().store(DeckState).get(this.ctx.player());
    const ids = pile === 'deck' ? deck?.drawPile ?? [] : deck?.discardPile ?? [];
    this.overlay.openBrowse(pile === 'deck' ? 'Deck' : 'Discard', this.buildOverlayItems(ids));
    this.overlayPile = pile;
  }

  /**
   * Build the overlay's items from pile instance ids: sorted for display (sortPileForDisplay), each
   * paired with a card face (effective cost + colour). PileOverlay lays them out and hit-tests them.
   */
  private buildOverlayItems(ids: readonly EntityId[]): OverlayItem[] {
    const world = this.ctx.world();
    const items: OverlayItem[] = [];
    for (const id of sortPileForDisplay(world, ids)) {
      const def = cardDef(world.store(Card).get(id)?.defId ?? '');
      if (def === undefined) continue;
      items.push({ id, face: this.makeCardFace(def, OVERLAY_FACE_SCALE, cardEffectiveCost(world, id), isTempFree(world, id)) });
    }
    return items;
  }
}
