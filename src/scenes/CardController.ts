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
  hasLineOfSight,
  pixelToHex,
  hexDistance,
  hexEquals,
  SPELL_DEFS,
  s,
  AssetKeys,
  resolveKey,
  assetScale,
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
  /** True when `hex` is FULLY inside the visible board window (not just within grid bounds). */
  isHexVisible(hex: Hex): boolean;
  /** The shared visible-window mask (WorldScene): clips the targeting paint to the on-screen board. */
  readonly effectMask: Phaser.Display.Masks.GeometryMask;
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
// While a card is ARMED it lifts this far above its fan slot — the persistent "armed" affordance. Once
// the pointer drops back down over the raised card, it returns to its slot AND goes click-through, so the
// covered hex can be targeted (see updateArmedCardLift). TUNABLE (matches the hover-lift today).
const ARMED_CARD_RAISE_PX = 28;

// Card face layout (presentation; tunable in one place, reviewed live). makeCardFace / setCardSelected /
// frameColor / cardFaceBase read these. Lengths are "base px" (before s() scaling); colours are hex.
const CARD_FACE_ART_W = 195; // the card-background art's native width; the face base is this at 0.5 display scale
const CARD_FACE_ART_H = 284; // ...native height
const CARD_COST_OFFSET_X = 6; // cost text inset from the face's LEFT edge
const CARD_COST_OFFSET_Y = 22; // cost text inset from the face's TOP edge
const CARD_COST_FONT_PX = 14; // cost text font size
const CARD_COST_COLOR_FREE = '#22c55e'; // cost GREEN when temporarily free this hand
const CARD_COST_COLOR_BASE = '#facc15'; // cost YELLOW for base/permanent cost
const CARD_NAME_OFFSET_Y_ATTACK = 8.5; // name inset from the TOP (attack faces)
const CARD_NAME_OFFSET_Y_SKILL = 5.5; // name inset from the TOP (skill faces)
const CARD_NAME_FONT_PX = 9; // name font size
const CARD_NAME_COLOR = '#e5e7eb'; // name text colour
const CARD_EFFECT_OFFSET_Y_ATTACK = 38; // effect text inset from the BOTTOM (attack faces)
const CARD_EFFECT_OFFSET_Y_SKILL = 39; // effect text inset from the BOTTOM (skill faces)
const CARD_EFFECT_FONT_PX = 8; // effect text font size
const CARD_EFFECT_COLOR = '#020202'; // effect text colour
const CARD_EFFECT_WRAP_INSET = 24; // total horizontal inset for the effect text word-wrap width
const CARD_BORDER_WIDTH_OFF = 0; // border stroke width when unselected (invisible)
const CARD_BORDER_WIDTH_ON = 2; // border stroke width when selected/armed
const CARD_BORDER_COLOR_SELECTED = 0xfacc15; // selected/armed border colour (yellow)
const CARD_FRAME_COLOR_ATTACK = 0xb91c1c; // unselected border colour, attack (red)
const CARD_FRAME_COLOR_SKILL = 0x2563eb; // unselected border colour, skill (blue)
const CARD_ART_OFFSET_Y_ATTACK = -15; // base px: per-card art centre in the frame's top-half window (reviewed live)
const CARD_ART_OFFSET_Y_SKILL = -15; // base px: per-card art centre in the frame's top-half window (reviewed live)
const CARD_ART_FALLBACK_SIZE = 256; // per-card art size used when the asset descriptor is missing
const CARD_ART_FALLBACK_SCALE = 0.5; // per-card art display scale used when the descriptor is missing

// Spell sidebar layout (presentation; tunable in one place, reviewed live). buildSpellSidebar /
// setSpellSelected / showTooltip read these. Lengths are "base px" (before s() scaling); colours are hex.
const SPELL_SIDEBAR_X = 44; // spell column inset from the LEFT edge
const SPELL_FIRST_Y = 150; // y of the first spell disc
const SPELL_SPACING_Y = 84; // vertical gap between successive spell discs
const SPELL_DISC_RADIUS = 30; // backing-disc / ring / hit-area radius
const SPELL_DISC_COLOR = 0x394150; // grey backing-disc fill
const SPELL_ART_FALLBACK_SIZE = 64; // spell art size when the asset descriptor is missing
const SPELL_RING_WIDTH_OFF = 1; // ring stroke width, unselected
const SPELL_RING_WIDTH_ON = 2; // ring stroke width, selected/armed
const SPELL_RING_COLOR_OFF = 0x6b7280; // ring colour, unselected (grey)
const SPELL_RING_COLOR_ON = 0xfacc15; // ring colour, selected/armed (yellow)
const SPELL_TOOLTIP_DX = 44; // tooltip x offset from the spell disc
const SPELL_TOOLTIP_PAD_X = 8; // tooltip label inset from the bg LEFT
const SPELL_TOOLTIP_PAD_Y = 6; // tooltip label inset from the bg TOP
const SPELL_TOOLTIP_FONT_PX = 11; // tooltip text font size
const SPELL_TOOLTIP_COLOR = '#e5e7eb'; // tooltip text colour
const SPELL_TOOLTIP_WRAP_PX = 180; // tooltip text word-wrap width
const SPELL_TOOLTIP_BG_PAD_X = 16; // horizontal padding added around the label for the bg
const SPELL_TOOLTIP_BG_PAD_Y = 12; // vertical padding added around the label for the bg
const SPELL_TOOLTIP_BG_COLOR = 0x111418; // tooltip background fill
const SPELL_TOOLTIP_BG_ALPHA = 0.92; // tooltip background fill alpha
const SPELL_TOOLTIP_BORDER_WIDTH = 1; // tooltip background border width
const SPELL_TOOLTIP_BORDER_COLOR = 0x6b7280; // tooltip background border colour (grey)
const SPELL_TOOLTIP_OFFSET_Y = 16; // tooltip rises this far above its anchor y

// Hand entry/exit animation (presentation-only; tunable, reviewed live).
const DRAW_FADE_MS = 150; // per-card fade-in when dealt into the hand
const DRAW_STAGGER_MS = 120; // gap between successive cards dealt (leftmost first)
const DRAW_SLIDE_PX = 36; // cards enter from this far to the RIGHT of their slot, settling left
const DISCARD_FADE_MS = 90; // per-card fade-out at end of turn (faster than the deal)
const DISCARD_STAGGER_MS = 60; // gap between successive cards discarded (rightmost first)
const DISCARD_SLIDE_PX = 12; // cards exit this far to the RIGHT as they fade
const DRAW_AFTER_DISCARD_MS = 100; // beat between the discard sweep finishing and the deal-in starting
/** Total time the end-of-turn discard sweep of `n` cards takes; the deal-in waits this long so the two sweeps don't overlap. */
const discardTotalMs = (n: number): number => (n - 1) * DISCARD_STAGGER_MS + DISCARD_FADE_MS;

// Card mod flash: when a hand card's cost/effect changes mid-turn, a white frame quickly highlights it
// then fades away (presentation-only feedback). Tunable.
const FLASH_IN_MS = 80; // the white frame ramps to full fast
const FLASH_OUT_MS = 1200; // then fades away
const FLASH_COLOR = 0xffffff;
const FLASH_THICKNESS = 3;

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
  /** True between a click-mode world target PRESS and its release — the target commits on release (touch). */
  private worldPressArmed = false;
  /**
   * False until the pointer has moved off the just-armed card UP into the grid; the armed-card
   * lower-toggle (updateArmedCardLift) only drops the card once it is true. This keeps the card RAISED
   * through the arming press and the start of a drag — when the pointer is still on the card and would
   * otherwise read as "over a covered hex" and lower it instantly. Matches the owner's gesture: arm,
   * move into the centre, THEN back down onto the covered hex.
   */
  private armedLiftEngaged = false;
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
    this.painter = new TargetingPainter(
      this.scene,
      this.ctx.grid,
      this.ctx.layout,
      (h) => this.ctx.isHexVisible(h),
      this.ctx.effectMask,
    );
    this.tooltip = this.scene.add.container(0, 0).setDepth(HUD_DEPTH + 10).setVisible(false).setScrollFactor(0);
    this.buildSpellSidebar();
    this.buildDeckIcon();
    this.buildDiscardIcon();
    this.overlay = new PileOverlay(this.scene);
    this.refreshHand();
  }

  isArmed(): boolean {
    return this.armed !== null;
  }

  /** Pointer moved: update the targeting highlight if something is armed, and raise/lower the armed card. */
  onPointerMove(p: Phaser.Input.Pointer): void {
    if (this.armed === null) return;
    this.hovered = pixelToHex(this.ctx.layout, p.worldX, p.worldY);
    this.redrawHighlight();
    this.updateArmedCardLift(p.y); // p.y is the SCREEN Y (the card is screen-pinned)
  }

  /**
   * Keep an armed CARD raised as the armed affordance, but drop it to its fan slot — and let clicks pass
   * THROUGH it — once the pointer comes back down over the card, where it would otherwise cover and
   * intercept the board hex the player is aiming at. Driven by pointer-move (mouse hover, mouse drag, and
   * touch drag; touch taps produce no move, so that path is unaffected — see bug-report touch targeting).
   *
   * Both halves of the toggle key off ONE value: the screen Y of the raised card's TOP edge.
   *  - Pointer ABOVE it (up in the grid): engage the toggle (armedLiftEngaged) and keep the card RAISED.
   *  - Pointer at/below it once engaged (back over the card): LOWER to the fan slot and disable the card's
   *    hit-testing, so the click reaches the hex underneath. The lowered card can still visually overlap
   *    that hex, so the click-through — not geometry — is what keeps it targetable.
   * The gate keeps the card raised through the arming press and the first frames of a drag, when the
   * pointer is still on the card (per the owner's gesture: arm, move into the centre, THEN back down onto
   * the covered hex). Spells are untouched (no board overlap from the sidebar).
   */
  private updateArmedCardLift(screenY: number): void {
    if (this.armed === null || this.armed.kind !== 'card') return;
    const card = this.armed.obj;
    const homeY = card.getData('homeY') as number;
    const raisedY = homeY - s(ARMED_CARD_RAISE_PX);
    const raisedTopY = raisedY - s(this.cardFaceBase().h) / 2; // screen Y of the raised card's top edge
    if (screenY < raisedTopY) this.armedLiftEngaged = true; // pointer rose above the card, up into the grid
    const lowered = this.armedLiftEngaged && screenY >= raisedTopY;
    card.setY(lowered ? homeY : raisedY);
    if (card.input) card.input.enabled = !lowered; // click-through while lowered; re-press cancels while raised
  }

  /**
   * Pointer released. Two cases:
   * 1. It ended the ACTIVATING press: a travelled release is drag-to-cast (commit the target), a
   *    near-stationary one is click-activation (stay armed, await a target tap).
   * 2. It ended a click-mode world TARGET tap that onWorldDown deferred here (so the target commits on
   *    release, not press — required for touch, where a fresh touch's pointerdown position is unsettled).
   */
  onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.armed === null) return;
    if (this.pressDown !== null) {
      const moved = Phaser.Math.Distance.Between(this.pressDown.x, this.pressDown.y, p.x, p.y) > s(DRAG_THRESHOLD);
      this.pressDown = null;
      if (!moved) return; // click-activation: await a hex tap
      const hex = pixelToHex(this.ctx.layout, p.worldX, p.worldY);
      if (this.isValidTarget(hex)) this.advanceTarget(hex);
      else this.disarm(); // dragged off the visible board, out of range / no LoS, or onto own hex: cancel
      return;
    }
    if (this.worldPressArmed) {
      // Resolve the deferred click-mode target at the SETTLED release position. On the visible board,
      // advanceTarget handles it (and ignores an out-of-range / no-LoS / own-hex pick, staying armed so
      // the player can re-aim); off the visible board, cancel — same rule the press path used to apply.
      this.worldPressArmed = false;
      const hex = pixelToHex(this.ctx.layout, p.worldX, p.worldY);
      if (this.onVisibleBoard(hex)) this.advanceTarget(hex);
      else this.disarm();
    }
  }

  /**
   * A world press while armed: the click-mode first target (or a two-step second). The selection is
   * DEFERRED to the pointer-up — see onPointerUp case 2 — so it commits on release. On touch a fresh
   * tap's pointerdown position can be stale/unsettled; resolving on release (the settled position) is
   * what makes tap-to-target work. Mouse clicks (press+release at one spot) are unaffected.
   */
  onWorldDown(): void {
    if (this.armed === null || this.pressDown !== null) return;
    this.worldPressArmed = true;
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
   * Deal a brand-new hand at turn start (driven by the HandDealt event): discard EVERY card on
   * screen, then deal EVERY card of the new hand in. The hand is wholesale-replaced here, so a card
   * that was discarded and then reshuffled + redrawn this turn is a genuinely new draw and must still
   * animate out then back in. Instance coincidence must NOT suppress that — which is exactly why this
   * does NOT diff by instance id (unlike refreshHand, which is for incremental mid-turn changes).
   */
  dealNewHand(): void {
    const leaving = this.handCards; // the whole hand is being discarded
    this.animateHandDiscard(leaving);
    const dealBase = leaving.length > 0 ? discardTotalMs(leaving.length) + DRAW_AFTER_DISCARD_MS : 0;
    this.buildHand(dealBase, () => true); // every card is freshly dealt, so all fade in
  }

  /**
   * Incrementally refresh the fan mid-turn (driven by HandChanged: an effect drew a card or changed a
   * cost). Existing cards stay put; only a genuinely-new instance fades in. This diffs the on-screen
   * sprites against the hand by instance id — valid ONLY mid-turn, where a card leaves the hand by
   * being PLAYED (animateCardOut), never by being discarded-and-redrawn (that is dealNewHand's job).
   */
  refreshHand(): void {
    const newSet = new Set(this.ctx.world().store(DeckState).get(this.ctx.player())?.hand ?? []);
    const leaving = this.handCards.filter((c) => !newSet.has(c.getData('cardEntity') as EntityId));
    const staying = this.handCards.filter((c) => newSet.has(c.getData('cardEntity') as EntityId));
    // Snapshot, BEFORE destroying the sprites (getData/x/y are gone after destroy): which instances are
    // already on screen (so they don't re-deal), WHERE they are (so they slide to their new slot), and
    // their face signature (so a card whose surfaced state changed this refresh can be flashed afterwards).
    const wasPresent = new Set(staying.map((c) => c.getData('cardEntity') as EntityId));
    const fromPos = new Map<EntityId, { x: number; y: number; angle: number }>();
    const oldSig = new Map<EntityId, string>();
    for (const c of staying) {
      const id = c.getData('cardEntity') as EntityId;
      fromPos.set(id, { x: c.x, y: c.y, angle: c.angle });
      oldSig.set(id, c.getData('faceSig') as string);
    }
    this.animateHandDiscard(leaving);
    for (const c of staying) c.destroy(); // replaced by a fresh face (so a changed cost re-renders)
    const dealBase = leaving.length > 0 ? discardTotalMs(leaving.length) + DRAW_AFTER_DISCARD_MS : 0;
    // Genuinely-new cards fade in; kept cards slide from their old position to the (shifted) new slot.
    this.buildHand(dealBase, (instance) => !wasPresent.has(instance), fromPos);
    // A card that stayed in hand but whose face signature changed had a surfaced parameter change this
    // refresh (e.g. Sharpen's cost reduction) — flash a white frame to draw the eye to it. The rebuilt
    // card already carries its new signature (buildHandCard), so this is a single comparison.
    for (const [instance, prevSig] of oldSig) {
      const card = this.handCards.find((c) => (c.getData('cardEntity') as EntityId) === instance);
      if (card !== undefined && (card.getData('faceSig') as string) !== prevSig) this.flashCard(card);
    }
  }

  /**
   * Flash a white frame over a hand card whose cost/effect just changed (presentation only): a stroked
   * frame that ramps up fast then fades out and self-destroys. Added as a CHILD of the card container,
   * so it tracks the card if the fan reflows and is destroyed with the card if it leaves mid-flash; it
   * is independent of the card's selection border (yellow) and frame colour (attack red / skill blue).
   */
  private flashCard(card: Phaser.GameObjects.Container): void {
    const frame = this.scene.add
      .rectangle(0, 0, s(96), s(144), FLASH_COLOR, 0) // white, fill-transparent: only the stroke shows
      .setStrokeStyle(s(FLASH_THICKNESS), FLASH_COLOR)
      .setAlpha(0);
    card.add(frame);
    this.scene.tweens.chain({
      targets: frame,
      onComplete: () => frame.destroy(),
      tweens: [
        { alpha: 1, duration: FLASH_IN_MS, ease: 'Quad.easeOut' },
        { alpha: 0, duration: FLASH_OUT_MS, ease: 'Quad.easeIn' },
      ],
    });
  }

  /**
   * The signature of everything the card face surfaces — cost, cost colour (temp-free), name, and effect
   * text. refreshHand flashes a hand card whose signature changed mid-turn. INVARIANT: every parameter
   * rendered on the face by makeCardFace MUST be added here, or a change to it won't trigger the flash.
   */
  private cardFaceSignature(def: CardDef, cost: number, tempFree: boolean): string {
    // Join on the unit-separator control char (31), which cannot occur in cost/name/effect text.
    return [cost, tempFree, def.name, def.effectText].join(String.fromCharCode(31));
  }

  /**
   * (Re)build the hand fan from DeckState.hand, replacing this.handCards. The hand holds card-INSTANCE
   * entity ids; each card renders its def art, EFFECTIVE cost and cost colour (green if free this hand)
   * and snaps to its fan slot. A card for which shouldFadeIn(instance) is true instead starts offset to
   * the right + transparent and fades into its slot, staggered leftmost-first after `dealBase`.
   */
  private buildHand(
    dealBase: number,
    shouldFadeIn: (instance: EntityId) => boolean,
    fromPos?: Map<EntityId, { x: number; y: number; angle: number }>,
  ): void {
    const world = this.ctx.world();
    const hand = world.store(DeckState).get(this.ctx.player())?.hand ?? [];
    const layout = this.fanLayout(hand.length);
    this.handCards = [];
    let newOrdinal = 0; // stagger position among the cards fading in (leftmost first)
    hand.forEach((instance, i) => {
      const defId = world.store(Card).get(instance)?.defId;
      const def = defId !== undefined ? cardDef(defId) : undefined;
      if (def === undefined) return;
      const card = this.buildHandCard(def, instance, i, hand.length, layout);
      this.handCards.push(card);
      if (shouldFadeIn(instance)) {
        this.fadeCardIn(card, dealBase + newOrdinal * DRAW_STAGGER_MS);
        newOrdinal += 1;
        return;
      }
      // A card that was already on screen: start it at its previous position and SLIDE to its new
      // (possibly shifted) slot rather than snapping — e.g. when an effect adds a card and the fan
      // widens. buildHandCard already snapped it to the new slot, so that slot is the tween target.
      const prev = fromPos?.get(instance);
      if (prev !== undefined) {
        card.setPosition(prev.x, prev.y).setAngle(prev.angle);
        this.placeCard(card, i, hand.length, layout, true);
      }
    });
    this.refreshPileCounts();
  }

  /** Create + wire one hand-card sprite (hover lift, arm-on-press) and snap it to fan slot `i`. */
  private buildHandCard(
    def: CardDef,
    instance: EntityId,
    i: number,
    count: number,
    layout: { spacing: number; baseX: number; baseY: number },
  ): Phaser.GameObjects.Container {
    const world = this.ctx.world();
    const cost = cardEffectiveCost(world, instance);
    const tempFree = isTempFree(world, instance);
    const card = this.makeCardFace(def, 1, cost, tempFree);
    card.setData('cardEntity', instance);
    // Record a signature of everything the face surfaces so refreshHand can flash the card when its
    // displayed state changes mid-turn (cardFaceSignature is the single place that lists those params).
    card.setData('faceSig', this.cardFaceSignature(def, cost, tempFree));
    this.placeCard(card, i, count, layout, false);
    const { w: hitW, h: hitH } = this.cardFaceBase(); // hit area tracks the face size (matches the art)
    const hitBot = s(20); // hit area extends off the bottom of the card so hover stays while the mouse is there
    card.setInteractive(new Phaser.Geom.Rectangle(-s(hitW) / 2, -s(hitH) / 2, s(hitW), s(hitH) + hitBot), Phaser.Geom.Rectangle.Contains);
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
    return card;
  }

  /** Begin a card's deal-in: it starts offset to the RIGHT + transparent and slides/fades into its slot. */
  private fadeCardIn(card: Phaser.GameObjects.Container, delay: number): void {
    const homeX = card.x;
    card.setAlpha(0).setX(homeX + s(DRAW_SLIDE_PX));
    this.scene.tweens.add({
      targets: card,
      x: homeX,
      alpha: 1,
      duration: DRAW_FADE_MS,
      delay,
      ease: 'Quad.easeOut',
    });
  }

  /**
   * Fan geometry for a hand of `count` cards. Spacing is the base s(104) but shrinks
   * for larger hands so the whole fan stays within the screen width (half-card margins
   * each side); cards are centred horizontally and tucked near the bottom edge.
   */
  private fanLayout(count: number): { spacing: number; baseX: number; baseY: number } {
    const { width, height } = this.scene.scale;
    const maxSpan = width - s(250); // outermost card centres stay inside the screen
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
   * cardEntity. (The hand is rebuilt separately: refreshHand on an effect draw, dealNewHand at turn start.)
   */
  animateCardOut(instance: EntityId): void {
    const card = this.handCards.find((c) => (c.getData('cardEntity') as EntityId) === instance);
    if (card === undefined) return;
    this.handCards.splice(this.handCards.indexOf(card), 1);
    this.scene.tweens.killTweensOf(card); // drop any in-flight deal-in/reflow tween so it can't fight this fade or destroy the card early
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

  /**
   * Animate the leftover hand leaving at end of turn: each card fades out while sliding to the RIGHT,
   * staggered RIGHTMOST-first and faster than the deal-in, so it reads as a quick sequential sweep
   * rather than a wait. The cards are already detached from this.handCards (by refreshHand's diff),
   * so they just self-destroy when done.
   */
  private animateHandDiscard(leaving: Phaser.GameObjects.Container[]): void {
    const ordered = [...leaving].sort(
      (a, b) => (b.getData('handIndex') as number) - (a.getData('handIndex') as number),
    );
    ordered.forEach((card, k) => {
      card.disableInteractive(); // a stray hover must not perturb a card on its way out
      this.scene.tweens.killTweensOf(card); // drop a still-running deal-in tween so it can't fight this fade or destroy the card early
      const homeX = card.x;
      this.scene.tweens.add({
        targets: card,
        x: homeX + s(DISCARD_SLIDE_PX),
        alpha: 0,
        duration: DISCARD_FADE_MS,
        delay: k * DISCARD_STAGGER_MS,
        ease: 'Quad.easeIn',
        onComplete: () => card.destroy(),
      });
    });
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
    // An armed card RAISES above its fan slot and shows a yellow selected border (the armed affordance);
    // a spell lights up its ring — the same "selected" affordance. The raise begins NOW and is held for
    // the arm; updateArmedCardLift (driven by pointer-move) later drops it back to its slot once the
    // pointer comes back down over it, so the hex it covers stays targetable.
    if (kind === 'card') {
      this.setCardSelected(obj, true);
      obj.setY((obj.getData('homeY') as number) - s(ARMED_CARD_RAISE_PX));
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
    // An invalid pick (out of range, no line of sight, or an attack's own hex) is IGNORED here so a
    // CLICK stays armed and the player can re-aim — the range outline stays up. (A drag-RELEASE on an
    // invalid hex dearms instead; that split lives in onPointerUp, which gates on isValidTarget. Both
    // share isSelectableTarget so the click and drag paths judge "valid pick" by the SAME rule.)
    if (!this.isSelectableTarget(hex)) return;
    const spec = this.armed.def.target;
    if (spec.kind === 'twoStep' && this.armed.firstPick === null) {
      this.armed.firstPick = hex; // lock the first; the next click is the second
      this.redrawHighlight();
      return;
    }
    this.play(hex);
  }

  /**
   * True when `hex` is a SELECTABLE pick for the armed spec: within the card's max range, with a clear
   * line of sight (ranged / reach attacks), and not the caster's own hex (attacks). Independent of the
   * board-bounds / on-screen check (callers do that) — it answers only "is this a legal pick for the
   * spec". Single-sourced so the click path (advanceTarget — ignore on false, stay armed) and the
   * drag-release path (onPointerUp via isValidTarget — dearm on false) apply the SAME rule.
   */
  private isSelectableTarget(hex: Hex): boolean {
    if (this.armed === null) return false;
    const spec = this.armed.def.target;
    const maxRange = targetMaxRange(spec);
    const origin = this.originHex();
    if (maxRange !== undefined && origin !== null && hexDistance(origin, hex) > maxRange) return false;
    if (
      origin !== null &&
      (spec.kind === 'lineOfSight' || (spec.kind === 'singleHex' && spec.maxRange !== undefined)) &&
      !hasLineOfSight((h) => this.ctx.grid.blocksSight(h), origin, hex)
    ) {
      return false;
    }
    if (this.blocksOwnHex(hex)) return false;
    return true;
  }

  /**
   * True when `hex` is on the VISIBLE board: within grid bounds AND inside the on-screen window. After
   * the larger world (52x42) with a 26x21 camera window, in-bounds != visible, so the input cancel
   * rule must test visibility (not just grid bounds) or a release/click in the off-board margin lands
   * on an in-bounds-but-off-screen hex and never cancels. Mirrors the painter's grid.inBounds && isVisible.
   */
  private onVisibleBoard(hex: Hex): boolean {
    return this.ctx.grid.inBounds(hex) && this.ctx.isHexVisible(hex);
  }

  /**
   * True when a drag-RELEASE on `hex` should commit the play: the hex is on the visible board AND a
   * selectable pick for the armed spec. A release anywhere else — off the visible board, out of range,
   * no line of sight, or an attack's own hex — dearms instead, because a drag-release is a committed
   * gesture that cancels when it misses (unlike a click, which stays armed so the player can re-aim).
   */
  private isValidTarget(hex: Hex): boolean {
    return this.onVisibleBoard(hex) && this.isSelectableTarget(hex);
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
            : resolveTargeting(spec, origin, finalHex, undefined, (h) => this.ctx.grid.blocksSight(h)).primary.filter(
                (h) => this.ctx.grid.inBounds(h),
              )
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
    this.worldPressArmed = false;
    this.armedLiftEngaged = false;
    this.hovered = null;
    this.painter.clear();
    for (const c of this.spellCircles) this.setSpellSelected(c, false);
    for (const c of this.handCards) {
      this.setCardSelected(c, false);
      c.setY(c.getData('homeY') as number);
      c.setDepth(HUD_DEPTH + (c.getData('handIndex') as number)); // restore the fan draw order
      if (c.input) c.input.enabled = true; // re-arm hit-testing (updateArmedCardLift may have disabled the armed card's)
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
   * The card face's base size (px before s()): the card-background art (195x284) at its 0.5 display
   * scale, so the face matches the art's aspect EXACTLY (no squish) and renders natively at the desktop
   * 2x scale. Attack and skill backgrounds share one size.
   */
  private cardFaceBase(): { w: number; h: number } {
    const d = resolveKey(AssetKeys.cardSkill)?.descriptor;
    if (d === undefined) return { w: CARD_FACE_ART_W / 2, h: CARD_FACE_ART_H / 2 }; // unreachable (the key is registered) — safe fallback
    return { w: d.size[0] * assetScale(d), h: d.size[1] * assetScale(d) };
  }

  /**
   * Build a card face showing its EFFECTIVE cost. The cost is GREEN when a temporary override is
   * active (free this hand), else YELLOW — the normal colour, including a permanently-reduced cost.
   */
  private makeCardFace(def: CardDef, scale: number, cost: number, tempFree: boolean): Phaser.GameObjects.Container {
    const { w: baseW, h: baseH } = this.cardFaceBase();
    const w = s(baseW);
    const h = s(baseH);
    const c = this.scene.add.container(0, 0).setScrollFactor(0); // pinned: hand cards stay put while the world scrolls
    // Full-card background art by class (attack vs skill), sized to the face so it matches the art's
    // aspect exactly; degrades to a generated placeholder texture if the file is missing (PreloadScene).
    const bgKey = isAttackCard(def.id) ? AssetKeys.cardAttack : AssetKeys.cardSkill;
    const background = this.scene.add.image(0, 0, bgKey).setOrigin(0.5).setDisplaySize(w, h);
    const bg = this.scene.add
      .rectangle(0, 0, w, h, 0x000000, 0) // fill-transparent: only the frame + selection border, over the art
      .setStrokeStyle(s(CARD_BORDER_WIDTH_OFF), this.frameColor(def.id)) // no visible border for cards normally
      .setOrigin(0.5);
    const costText = this.scene.add
      .text(-w / 2 + s(CARD_COST_OFFSET_X), -h / 2 + s(CARD_COST_OFFSET_Y), `E${cost}`, {
        fontFamily: 'monospace',
        fontSize: `${s(CARD_COST_FONT_PX)}px`,
        color: tempFree ? CARD_COST_COLOR_FREE : CARD_COST_COLOR_BASE, // green = temporary free; yellow = base/permanent
      })
      .setOrigin(0, 0);
    const nameOffset = isAttackCard(def.id) ? s(CARD_NAME_OFFSET_Y_ATTACK) : s(CARD_NAME_OFFSET_Y_SKILL);
    const name = this.scene.add
      .text(0, -h / 2 + nameOffset, def.name, { fontFamily: 'monospace', fontSize: `${s(CARD_NAME_FONT_PX)}px`, color: CARD_NAME_COLOR })
      .setOrigin(0.5, 0);
    const effOffset = isAttackCard(def.id) ? s(CARD_EFFECT_OFFSET_Y_ATTACK) : s(CARD_EFFECT_OFFSET_Y_SKILL);
    const eff = this.scene.add
      .text(0, h / 2 - effOffset, def.effectText, {
        fontFamily: 'monospace',
        fontSize: `${s(CARD_EFFECT_FONT_PX)}px`,
        color: CARD_EFFECT_COLOR,
        align: 'center',
        wordWrap: { width: w - s(CARD_EFFECT_WRAP_INSET) },
      })
      .setOrigin(0.5, 0);
    const layers = [background, bg, costText, name, eff];
    // Per-card art BEHIND the frame, revealed through the frame's transparent top-half window (the frame is
    // opaque around that window, so it masks the art's in-card overflow). Missing art -> generated placeholder.
    const artKey = def.art;
    if (this.scene.textures.exists(artKey)) {
      const ad = resolveKey(artKey)?.descriptor;
      const artScale = ad ? assetScale(ad) : CARD_ART_FALLBACK_SCALE;
      const cardArt = this.scene.add
        .image(0, isAttackCard(def.id) ? s(CARD_ART_OFFSET_Y_ATTACK) : s(CARD_ART_OFFSET_Y_SKILL), artKey)
        .setOrigin(0.5)
        .setDisplaySize(s((ad?.size[0] ?? CARD_ART_FALLBACK_SIZE) * artScale), s((ad?.size[1] ?? CARD_ART_FALLBACK_SIZE) * artScale));
      layers.unshift(cardArt); // backmost: behind the frame
    }
    c.add(layers);
    c.setData('bg', bg);
    c.setData('frameColor', this.frameColor(def.id));
    c.setScale(scale);
    return c;
  }

  private frameColor(id: string): number {
    return isAttackCard(id) ? CARD_FRAME_COLOR_ATTACK : CARD_FRAME_COLOR_SKILL; // attack red / skill blue
  }

  /** Toggle a hand card's "selected" border: yellow when armed, its frame colour otherwise. */
  private setCardSelected(card: Phaser.GameObjects.Container, on: boolean): void {
    const bg = card.getData('bg') as Phaser.GameObjects.Rectangle | undefined;
    if (bg === undefined) return;
    bg.setStrokeStyle(on ? s(CARD_BORDER_WIDTH_ON) : s(CARD_BORDER_WIDTH_OFF), on ? CARD_BORDER_COLOR_SELECTED : (card.getData('frameColor') as number));
  }

  private buildSpellSidebar(): void {
    SPELL_DEFS.forEach((def, i) => {
      const x = s(SPELL_SIDEBAR_X);
      const y = s(SPELL_FIRST_Y) + i * s(SPELL_SPACING_Y);
      const circle = this.scene.add.container(x, y).setDepth(HUD_DEPTH).setScrollFactor(0);
      // Grey backing disc; the art (if any) fills it, and a stroke-only border rings it on top (also the selection highlight).
      const fill = this.scene.add.circle(0, 0, s(SPELL_DISC_RADIUS), SPELL_DISC_COLOR);
      const parts: Phaser.GameObjects.GameObject[] = [fill];
      // Per-spell art keyed def.art, clipped to the ring by a circular geometry mask so it fills the disc. The mask is
      // screen-fixed at the spell's pinned position (scrollFactor 0), mirroring PileOverlay's masked content.
      if (this.scene.textures.exists(def.art)) {
        const ad = resolveKey(def.art)?.descriptor;
        const d = ad ? s(ad.size[0] * assetScale(ad)) : s(SPELL_ART_FALLBACK_SIZE);
        const art = this.scene.add.image(0, 0, def.art).setOrigin(0.5).setDisplaySize(d, d);
        const maskShape = this.scene.make.graphics({}, false);
        maskShape.fillStyle(0xffffff).fillCircle(x, y, s(SPELL_DISC_RADIUS));
        maskShape.setScrollFactor(0);
        art.setMask(maskShape.createGeometryMask());
        parts.push(art);
      }
      const border = this.scene.add.circle(0, 0, s(SPELL_DISC_RADIUS), 0x000000, 0).setStrokeStyle(s(SPELL_RING_WIDTH_OFF), SPELL_RING_COLOR_OFF);
      parts.push(border);
      circle.add(parts);
      circle.setData('ring', border);
      circle.setInteractive(new Phaser.Geom.Circle(0, 0, s(SPELL_DISC_RADIUS)), Phaser.Geom.Circle.Contains);
      circle.on('pointerover', () => {
        if (this.armed === null) this.showTooltip(def, x + s(SPELL_TOOLTIP_DX), y);
      });
      circle.on('pointerout', () => this.tooltip.setVisible(false));
      circle.on('pointerdown', (p: Phaser.Input.Pointer) => this.arm('spell', def, circle, p));
      this.spellCircles.push(circle);
    });
  }

  private setSpellSelected(circle: Phaser.GameObjects.Container, on: boolean): void {
    const ring = circle.getData('ring') as Phaser.GameObjects.Arc;
    ring.setStrokeStyle(on ? s(SPELL_RING_WIDTH_ON) : s(SPELL_RING_WIDTH_OFF), on ? SPELL_RING_COLOR_ON : SPELL_RING_COLOR_OFF);
  }

  private showTooltip(def: SpellDef, x: number, y: number): void {
    this.tooltip.removeAll(true);
    const text = `${def.name}  (M${def.cost})\n${def.effectText}`;
    const label = this.scene.add.text(s(SPELL_TOOLTIP_PAD_X), s(SPELL_TOOLTIP_PAD_Y), text, {
      fontFamily: 'monospace',
      fontSize: `${s(SPELL_TOOLTIP_FONT_PX)}px`,
      color: SPELL_TOOLTIP_COLOR,
      wordWrap: { width: s(SPELL_TOOLTIP_WRAP_PX) },
    });
    const bg = this.scene.add
      .rectangle(0, 0, label.width + s(SPELL_TOOLTIP_BG_PAD_X), label.height + s(SPELL_TOOLTIP_BG_PAD_Y), SPELL_TOOLTIP_BG_COLOR, SPELL_TOOLTIP_BG_ALPHA)
      .setStrokeStyle(s(SPELL_TOOLTIP_BORDER_WIDTH), SPELL_TOOLTIP_BORDER_COLOR)
      .setOrigin(0, 0);
    this.tooltip.setPosition(x, y - s(SPELL_TOOLTIP_OFFSET_Y));
    this.tooltip.add([bg, label]);
    this.tooltip.setVisible(true);
  }

  private buildDeckIcon(): void {
    const { height } = this.scene.scale;
    const icon = this.scene.add.container(s(44), height - s(40)).setDepth(HUD_DEPTH).setScrollFactor(0);
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
    const icon = this.scene.add.container(width - s(44), height - s(40)).setDepth(HUD_DEPTH).setScrollFactor(0);
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
