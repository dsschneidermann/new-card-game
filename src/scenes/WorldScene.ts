import Phaser from 'phaser';
import {
  advance,
  createWorld,
  applySave,
  loadRun,
  saveRun,
  AssetKeys,
  HexGrid,
  HexPosition,
  FacingState,
  Player,
  Health,
  CombatStats,
  Shield,
  TurnState,
  ResourcePool,
  MovementBudget,
  makeMovementSystem,
  makeTurnSystem,
  makeCardSystem,
  makeCardAttackSystem,
  makeSpellSystem,
  makeShieldSystem,
  makeEnemyTurnSystem,
  makeInteractSystem,
  playerMoveBlockers,
  DeckState,
  reshuffle,
  drawUpTo,
  Equipment,
  KnownSpells,
  equipStartingItems,
  Enemy,
  ChestOffer,
  MIMIC_ART,
  isAttackCard,
  isHeavyAttack,
  facingToward,
  hexToPixel,
  pixelToHex,
  offsetToAxial,
  hexDistance,
  worldPixelBounds,
  LevelState,
  selectLevelId,
  FOREST_ID,
  s,
  BASE_HEX_LAYOUT,
  FOREST_TILE_W,
  FOREST_TILE_H,
  type Hex,
  type HexLayout,
  type EntityId,
  type World,
  type StorageAdapter,
  type GameEvent,
  type Command,
  type DeckStateData,
} from '@core/index';
import { SceneSync } from '@render/SceneSync';
import {
  Renderable,
  AnimState,
  buildCharacterViews,
  attackDurationMs,
  type AnimStateData,
} from '@render/characterViews';
import { ItemRenderable, buildItemViews } from '@render/itemViews';
import { enemyCardAt } from '@render/enemyCardData';
import { buildEnemyCard, enemyCardSize } from '@render/enemyCard';
import type { ScreenRouter } from '@scenes/ScreenRouter';
import { CardController } from '@scenes/CardController';
import { MovePlanner } from '@scenes/MovePlanner';
import { MoveAnimator } from '@render/MoveAnimator';
import { TelegraphOverlay } from '@render/TelegraphOverlay';
import { makeLevel, type Level, type LevelBuildContext } from '@render/levels/level';

/** Scene-start payload: Resume rebuilds the saved run; Restart Level replays the saved level from the start; otherwise a fresh run. */
interface WorldSceneData {
  resume?: boolean;
  restart?: boolean;
}

// Pointy-top, perspective-foreshortened hexes in offset (odd-r) rows (ADR-006).
// The LAYOUT pixel fields are base (iPad) values scaled via s() into this.layout at
// create time (s() must not run at module load).
// The world size, start hex, obstacles, chests, enemies and terrain are now owned by the active Level
// (the seam); WorldScene reads cols/rows/startHex off this.level and everything else off the ECS. The
// Larger World feature made the forest 4x the original 26x21 area. The visible window stays exactly the
// original 26x21 grid (same on-screen frame + full hexes); the camera shows this window into the larger
// world and content outside it is hidden.
const VIEW_COLS = 26;
const VIEW_ROWS = 21;
const VIEW_CENTER_COL = Math.floor(VIEW_COLS / 2); // the window cell the player is centred on (13)
const VIEW_CENTER_ROW = Math.floor(VIEW_ROWS / 2); // (10)

// Ground-terrain tile FOOTPRINT (display): the level builds its terrain as world-sized TilemapLayer(s) at
// this skewed tile size (width != height although the source art is a natural 16x16 square); WorldScene
// passes the s()-scaled size into the level's buildTerrain and clips the returned layers to the hex frame.
// Forest-owned single source (src/core/levels/forest/terrain): the forest's terrain classifier reads the
// same base tile size, so placement and rendering can't drift.
const TERRAIN_TILE_W = FOREST_TILE_W; // Desktop base px tile WIDTH
const TERRAIN_TILE_H = FOREST_TILE_H; // Desktop base px tile HEIGHT -> vertical squish vs the 16x16 source
// Staggered follow: re-anchor the camera only after the player drifts this many hexes from the current
// reference, so the camera pans every N hex instead of every hop (tunable; 2 = tighter).
const CAMERA_STAGGER_HEXES = 2;
const HOP_MS = 200; // per-hex hop duration: the SceneSync slide tween + the MoveAnimator replay cadence (must match)
// After a failed card/spell play, click-to-move is suppressed for this long so a reflexive follow-up
// board click (the player trying to play the card on the world) is swallowed instead of starting a move.
const MOVE_LOCKOUT_AFTER_REJECT_MS = 750;

// Turn defaults (ADR-005); all tunable, persisted per-run once set.
const ENERGY_MAX = 3;
const MANA_MAX = 5;
const MANA_REGEN = 1;
const MOVE_BUDGET = 5;
const HAND_SIZE = 4;
// Player combat stats (ADR-007). The player is a damageable combatant — shared Health/CombatStats with
// enemies — so the player takes hits like anything else; the loss condition when HP reaches 0 is deferred
// to the run-lifecycle feature (ADR-010). Tunable, persisted per-run.
const PLAYER_MAX_HP = 30;
const PLAYER_ARMOR = 0;
// The opened chest shows the final frame of the 3-frame chest_1_opening sheet (frame 2 = fully open).
const CHEST_OPENED_FRAME = 2;
// The chest's opening animation: the auto-registered one-shot for the 3-frame chest_1_opening sheet
// (PreloadScene keys every animated descriptor `${key}.right`). It plays once and holds frame 2.
const CHEST_OPENING_ANIM = `${AssetKeys.chest1Opening}.right`;
// Beat between the chest opening animation starting and the reward picker opening, so the player sees the
// chest open first. The 3-frame sheet runs ~250ms at 10fps, so the picker opens just as the lid finishes.
const CHEST_OPEN_BEAT_MS = 350;

// Enemy inspect card (Enemy Hover Card): the hovered enemy's name/HP/Shield/Armor/attack card sits to the
// RIGHT of its hex, clamped on-screen. It only appears while an enemy is actively hovered, so it draws
// TOPMOST — above the WorldScene HUD (1_000_000) AND the CardController hand-card fan (HUD_DEPTH 2_000_000 ..
// CARD_FRONT_DEPTH 2_000_050) — so a fanned or hovered hand card never occludes it. It is already hidden while
// a modal overlay is open (cards.isOverlayOpen(): deck/discard browse, chest picker, equipment panel, ~2_000_100),
// so sitting above that band here never lets the hover card fight those modals for the top. Tunable, surfaced at visual-QA.
const ENEMY_CARD_DEPTH = 2_001_000;
const ENEMY_CARD_GAP = 24; // base-px gap between the enemy's hex and the card's near edge

/**
 * Gameplay scene (the InLevel state): wiring only. It owns a hex world grid
 * (feature 05) and the animated player (feature 14) over the ECS, and drives the
 * Turn Engine (feature 07): clicking a hex submits a RequestMove the turn engine
 * validates against the movement budget; Space ends the turn (refilling energy,
 * regenerating mana); R restarts the turn from the per-turn autosave. A HUD shows
 * the round, phase and resources. Esc opens Pause.
 */
export class WorldScene extends Phaser.Scene {
  private world!: World;
  private grid!: HexGrid;
  // The active level (the seam): WorldScene reads cols/rows/startHex off it and calls populate/reinstall/
  // buildTerrain; all level content (obstacles, chests, enemies, terrain) is owned by the Level. Built in
  // freshWorld (selectLevelId — today always the forest) or resumeOrFresh (from the saved LevelState).
  private level!: Level;
  private sync!: SceneSync;
  private player!: EntityId;
  private storage!: StorageAdapter;
  private hud!: Phaser.GameObjects.Text;
  // Light-blue "+N" shield readout overlaid on the status line, right after the HP value (Core Gaps). Its own
  // text object because Phaser cannot colour a substring of a single Text; positioned by monospace char width.
  private shieldHud!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private cards!: CardController;
  private moveAnimator!: MoveAnimator;
  private move!: MovePlanner;
  private layout!: HexLayout;
  // The grass grid, drawn in WORLD space and redrawn (only on a camera pan) for the world cells that
  // fall fully inside the visible frame — so every drawn hex is a real, in-bounds world cell.
  private gridGfx!: Phaser.GameObjects.Graphics;
  // Ground terrain: the world-sized TilemapLayer(s) the active level builds (tile indices, no baked texture
  // — Phaser culls to the viewport), MASKED to the visible hex frame so terrain shows only under the hexes,
  // not in the HUD margins. The layer count is the level's (the forest's fill/overlay/leaf).
  private terrainLayers: Phaser.Tilemaps.TilemapLayer[] = [];
  // The on-screen frame (the original 26x21 grid rect): only full hexes inside it are drawn and shown.
  private frame!: { left: number; right: number; top: number; bottom: number };
  // Camera scroll is clamped to this pixel box so the frame never scrolls past the world edge.
  private scrollBounds!: { minX: number; maxX: number; minY: number; maxY: number };
  // Screen pixel of the frame's centre cell — the camera scrolls so the reference hex lands here.
  private viewCenterPx!: { x: number; y: number };
  // Tight visible-window geometry mask (the EXACT frame rect, no terrain sprite-feet pad), screen-pinned.
  // Shared by the targeting + movement effect layers so their off-board visuals clip to the board edge, the
  // same way the terrain layer is masked. Built once in create().
  private effectMask!: Phaser.Display.Masks.GeometryMask;
  // The world hex the camera is currently anchored on; re-anchored only when the player drifts
  // CAMERA_STAGGER_HEXES from it (staggered pan). undefined until the first updateCamera().
  private camRefHex: Hex | undefined;
  // Last scroll the grid was redrawn at, so the grid only redraws when the camera actually pans.
  private lastGridScrollX = NaN;
  private lastGridScrollY = NaN;
  // Pending timer that clears the player's one-shot attack overlay back to idle/ready.
  private attackClearTimer: Phaser.Time.TimerEvent | undefined;
  // Scene-clock deadline: click-to-move is suppressed until this.time.now passes it. Set when a play is
  // rejected (see flashRejected) so a reflexive board click right after the ✗ toast can't start a move.
  private moveLockedUntilMs = 0;
  // A chest the core interact system reported ready (ChestInteractReady), queued to open once the move to the
  // preceding hex settles (see maybeOpenChest). Set only from that event, never by adjacency at move-end.
  private pendingChest: EntityId | null = null;
  // A mimic the core revealed (MimicRevealed), queued to swap from its chest disguise to its monster
  // animation once the move settles (see maybeRevealMimic) — so the reveal lands when the player arrives,
  // not mid-slide, mirroring how the chest opening is deferred. The data reveal already happened in the sim.
  private pendingMimicReveal: EntityId | null = null;
  // True from when a chest's opening animation begins (after the move settles) until the player resolves the
  // reward picker. Locks input through the opening beat + the modal, and stops maybeOpenChest re-triggering.
  private chestOpening = false;
  // True once the player has been defeated (0 HP) this run — set when PlayerDefeated drains, so the defeat
  // screen is opened exactly once and further in-level input is locked while the overlay shows.
  private defeated = false;
  // The enemy inspect card currently shown on hover (Enemy Hover Card), and a cache key of what it shows so
  // the per-frame hover refresh rebuilds it only when the hovered enemy or its stats change. null when hidden.
  private enemyCard: Phaser.GameObjects.Container | null = null;
  private enemyCardKey: string | null = null;
  // The enemy attack-telegraph overlay (Enemy AI: Movement & Telegraphed Attacks): light-red threatened
  // tiles + the red hover threat line, read from PlannedAttack each frame. Recreated per run (scene reuse).
  private telegraph: TelegraphOverlay | null = null;

  constructor() {
    super('WorldScene');
  }

  create(data?: WorldSceneData): void {
    // This scene INSTANCE is reused across runs (New Game / Restart / Resume all re-run create() on the same
    // WorldScene via mgr.start), and class-field initializers run only at CONSTRUCTION. Reset the per-run
    // camera-redraw gate here so a fresh world always redraws its hex outline: lastGridScroll back to NaN (so
    // the first updateCamera() trips the redraw gate even when the new run's start scroll equals the previous
    // run's) and camRefHex back to undefined (so staggered-follow re-anchors on the new start hex). Without
    // this, a New Game started at the same position as the abandoned run leaves the re-created, empty gridGfx
    // never redrawn — a blank hex outline. (bug mqr8a6be)
    this.lastGridScrollX = NaN;
    this.lastGridScrollY = NaN;
    this.camRefHex = undefined;
    this.pendingChest = null; // no chest pickup is queued at the start of a fresh/resumed run
    this.pendingMimicReveal = null; // nor a deferred mimic reveal
    this.chestOpening = false;
    this.defeated = false; // a fresh/restarted/resumed run starts un-defeated (the scene instance is reused)
    this.hideEnemyCard(); // drop any inspect card left over from a previous run of this reused scene
    const router = this.registry.get('router') as ScreenRouter;
    this.storage = this.registry.get('storage') as StorageAdapter;
    this.sync = new SceneSync(this, HOP_MS);
    // Hex layout in current-scale pixels (s() — must run here, not at module load). BASE_HEX_LAYOUT is the
    // shared, unscaled source the forest's terrain classifier also reads (so they can't drift).
    this.layout = {
      width: s(BASE_HEX_LAYOUT.width),
      height: s(BASE_HEX_LAYOUT.height),
      rowPitch: s(BASE_HEX_LAYOUT.rowPitch),
      originX: s(BASE_HEX_LAYOUT.originX),
      originY: s(BASE_HEX_LAYOUT.originY),
    };
    // Build the run's world. This is the SEAM: it picks the active level (the forest, via selectLevelId;
    // else the level recorded in the save), builds the grid from the level's size, populates a fresh
    // run's content / reinstalls a resumed one, and sets this.level / this.grid / this.player.
    this.world =
      data?.resume === true
        ? this.resumeOrFresh()
        : data?.restart === true
          ? this.restartLevelWorld()
          : this.freshWorld();
    // Hex-snap camera follow. The visible frame is the original 26x21 grid rect (full hexes only); the
    // reference hex sits at the frame's centre-cell screen position so the player is where it was
    // originally, and the scroll is clamped so the frame never reveals anything past the world edge.
    const hw = this.layout.width / 2;
    const hh = this.layout.height / 2;
    this.frame = {
      left: this.layout.originX - hw,
      right: this.layout.originX + (VIEW_COLS - 1) * this.layout.width + this.layout.width,
      top: this.layout.originY - hh,
      bottom: this.layout.originY + (VIEW_ROWS - 1) * this.layout.rowPitch + hh,
    };
    const wb = worldPixelBounds(this.layout, this.level.cols, this.level.rows);
    this.scrollBounds = {
      minX: wb.minX - this.frame.left,
      maxX: wb.maxX - this.frame.right,
      minY: wb.minY - this.frame.top,
      maxY: wb.maxY - this.frame.bottom,
    };
    this.viewCenterPx = hexToPixel(this.layout, offsetToAxial({ col: VIEW_CENTER_COL, row: VIEW_CENTER_ROW }));

    this.installSystems();

    this.buildTerrain(); // the active level builds its terrain layer(s); WorldScene masks + tracks them
    this.gridGfx = this.add.graphics().setDepth(-1_000_000); // world-space hex outline; drawn by redrawGrid()
    this.buildHud();

    // Tight visible-window mask (the exact frame rect — no terrain sprite-feet pad), built like the terrain
    // mask in createTerrain() and shared by the effect layers so off-board targeting/move visuals clip to the
    // board edge. Screen-pinned (scrollFactor 0); the effect graphics are world-space, like the terrain layer.
    const effectMaskShape = this.make.graphics({}, false);
    effectMaskShape
      .fillStyle(0xffffff)
      .fillRect(
        this.frame.left,
        this.frame.top,
        this.frame.right - this.frame.left,
        this.frame.bottom - this.frame.top,
      );
    effectMaskShape.setScrollFactor(0);
    this.effectMask = effectMaskShape.createGeometryMask();

    // Enemy attack-telegraph overlay: shares the visible-window mask so its threatened-tile fill + hover
    // threat line clip to the board like every other effect layer. Drop a previous run's overlay first
    // (this scene instance is reused across New Game / Resume / Restart).
    this.telegraph?.destroy();
    this.telegraph = new TelegraphOverlay(this, this.layout, this.effectMask);

    this.cards = new CardController({
      scene: this,
      grid: this.grid,
      layout: this.layout,
      world: () => this.world,
      player: () => this.player,
      submit: (cmd) => this.submitPlayerCommand(cmd),
      canAct: () => !this.inputLocked && this.isPlayerPhase(),
      notify: (m) => this.flashRejected(m),
      // isHexVisible stays for the cursor-over-board gate (clears the self/selfAoe tint when the cursor
      // leaves the board) and the commit-path action checks (onVisibleBoard / isValidTarget). The per-hex
      // visual clipping of the targeting paint now rides the shared effectMask below.
      isHexVisible: (hex) => {
        const { x, y } = hexToPixel(this.layout, hex);
        return this.fullyInFrame(x, y);
      },
      effectMask: this.effectMask,
    });
    this.cards.create();

    // Movement: the render-side replay of move hop-logs (sprite lags the sim) + the press-hold
    // reachable-range gesture (a press previews, a release on a reachable hex moves).
    this.moveAnimator = new MoveAnimator(HOP_MS);
    this.move = new MovePlanner({
      scene: this,
      grid: this.grid,
      layout: this.layout,
      world: () => this.world,
      player: () => this.player,
      submit: (cmd) => this.submitPlayerCommand(cmd),
      canStart: () =>
        !this.inputLocked &&
        this.isPlayerPhase() &&
        !this.cards.isArmed() &&
        this.time.now >= this.moveLockedUntilMs, // brief post-rejection lockout (see flashRejected)
      // isHexVisible stays for the ACTION gate only: MovePlanner.onPointerUp cancels a move released off the
      // visible board (onVisibleBoard). The visual clipping of the reachable fill + route numbers now rides
      // the shared effectMask below, like the card-targeting paint.
      isHexVisible: (hex) => {
        const { x, y } = hexToPixel(this.layout, hex);
        return this.fullyInFrame(x, y);
      },
      effectMask: this.effectMask,
    });

    // A transparent, interactive world zone (below the HUD) takes grid clicks;
    // cards/spells/deck-icon at higher depth consume their own clicks.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0)
      .setOrigin(0)
      .setDepth(-500_000)
      .setScrollFactor(0)
      .setInteractive()
      .on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) return; // right-click is handled globally (cancel), never a move/target
        if (this.cards.isArmed()) {
          this.cards.onWorldDown(); // arm a click-mode target; it COMMITS on the pointer-up (touch-settled position)
        } else {
          const hex = pixelToHex(this.layout, p.worldX, p.worldY);
          this.move.onPointerDown(hex, p); // begin the press-hold reachable-range move preview
        }
      });

    // Right-click cancels an armed card/spell and never opens the browser context menu.
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) {
        if (this.cards.isArmed()) this.cards.cancel();
        this.move.cancel(); // right-click also aborts an in-progress move preview
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.cards.onPointerMove(p);
      this.move.onPointerMove(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.cards.onPointerUp(p);
      this.move.onPointerUp(p);
    });

    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.inputLocked) return;
      this.move.cancel();
      this.cards.cancel();
      this.world.submit({ kind: 'EndTurn', entity: this.player });
    });
    this.input.keyboard?.on('keydown-R', () => {
      if (this.inputLocked) return;
      this.move.cancel();
      this.restartTurn();
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.move.isPreviewing()) this.move.cancel(); // abort an in-progress move preview first
      else if (this.cards.isArmed()) this.cards.cancel();
      else router.dispatch('Pause');
    });

    this.updateCamera(); // centre on the player's start hex on frame 1 (before the sprite exists)
    this.autosave(); // checkpoint at the start of round 1 (later turns checkpoint on TurnStarted)
  }

  update(_time: number, delta: number): void {
    // Process queued commands once per frame; a whole move resolves in ONE advance (Movement
    // Resolution) and the MoveAnimator replays its hop-log over real time, so the sprite lags the sim.
    const events = advance(this.world);
    this.syncPlayerAnim(events);
    this.moveAnimator.ingest(events);
    this.moveAnimator.update(delta);
    this.updateCamera(); // hex-snap follow: set the scroll BEFORE culling so off-frame sprites are hidden
    // Show only the sprites whose hex falls fully inside the visible frame; entities elsewhere in the
    // larger world are dropped so nothing renders in the margins around the grid.
    // Characters (player/enemies, incl. revealed mimics) come from buildCharacterViews; props (chests, and a
    // disguised mimic's chest sprite) come from the item view system. SceneSync reconciles both streams.
    const views = [
      ...buildCharacterViews(this.world, this.layout, this.moveAnimator.visualHexes()),
      ...buildItemViews(this.world, this.layout),
    ].filter((v) => this.fullyInFrame(v.x, v.y));
    this.sync.sync(views);
    this.refreshHud();
    for (const e of events) {
      if (e.kind === 'ActionRejected') this.flashRejected(e.reason);
      // A played card-instance left the hand for the discard pile: animate it out + reflow.
      else if (e.kind === 'CardDiscarded' && e.entity === this.player) this.cards.animateCardOut(e.instance);
      // The whole hand was replaced at turn start: discard every card, then deal the new hand in.
      else if (e.kind === 'HandDealt' && e.entity === this.player) this.cards.dealNewHand();
      // An effect drew a card or changed a cost mid-turn: refresh the fan incrementally.
      else if (e.kind === 'HandChanged' && e.entity === this.player) this.cards.refreshHand();
      // A new player turn opened: drop any armed card and checkpoint the freshly-drawn turn-start state.
      else if (e.kind === 'TurnStarted' && e.phase === 'player') {
        this.cards.cancel();
        this.autosave();
      }
      // The core interact system says a chest is ready (the player reached its stop hex, or was already
      // adjacent — its reward offer is rolled): queue it. maybeOpenChest defers the opening animation + picker
      // until the move animation settles.
      else if (e.kind === 'ChestInteractReady' && e.entity === this.player) this.pendingChest = e.chest;
      // A chest was looted in the sim: hold the opened-chest frame, refresh pile counts, checkpoint.
      else if (e.kind === 'ChestOpened') this.onChestOpened(e.chest);
      // A disguised mimic was reached and woke (data flip already done in the sim): queue the sprite swap so
      // it lands after the move animation settles, not mid-slide. maybeRevealMimic performs it.
      else if (e.kind === 'MimicRevealed') this.pendingMimicReveal = e.mimic;
      // The player reached 0 HP (the sim left the player entity intact): open the defeat screen once. The
      // router pauses this scene under the GameOverOverlay; the defeated flag also locks any lingering input.
      else if (e.kind === 'PlayerDefeated' && e.entity === this.player && !this.defeated) {
        this.defeated = true;
        (this.registry.get('router') as ScreenRouter).dispatch('PlayerDied');
      }
    }
    this.maybeOpenChest();
    this.maybeRevealMimic();
    this.telegraph?.refresh(this.world); // repaint the threatened-tile fill from this step's telegraphs
    this.refreshEnemyHover();
  }

  /**
   * Once the player's move has visually settled on the hex preceding a ready chest (or immediately, when no
   * move was needed), begin the opening sequence. pendingChest is set from the core ChestInteractReady event;
   * the open is deferred to here so the chest opens after the sprite arrives, not mid-slide. Triggers once:
   * pendingChest is cleared and chestOpening gates re-entry through the opening beat + the modal.
   */
  private maybeOpenChest(): void {
    if (this.pendingChest === null) return;
    if (this.moveAnimator.isMoving(this.player)) return; // wait for the move slide to finish
    if (this.cards.isOverlayOpen()) return; // don't stack over an already-open overlay
    if (this.chestOpening) return; // already opening (animation beat / picker up)
    const chest = this.pendingChest;
    this.pendingChest = null;
    this.beginChestOpen(chest);
  }

  /**
   * Once the player's move has visually settled on the hex preceding a reached mimic, swap the disguise to
   * its monster animation — mirroring maybeOpenChest, so the reveal lands when the sprite arrives, not
   * mid-slide. pendingMimicReveal is set from the core MimicRevealed event (the data flip already happened);
   * this defers only the PRESENTATION until the move animation finishes. Fires immediately when the mimic was
   * adjacent (no slide to wait on).
   */
  private maybeRevealMimic(): void {
    if (this.pendingMimicReveal === null) return;
    if (this.moveAnimator.isMoving(this.player)) return; // wait for the move slide to finish, like the chest
    const mimic = this.pendingMimicReveal;
    this.pendingMimicReveal = null;
    this.onMimicRevealed(mimic);
  }

  /**
   * Per-frame hover inspect (Enemy Hover Card): if the active pointer rests on a living enemy's hex (and no
   * modal overlay is open), show that enemy's inspect card to the RIGHT of its hex, clamped fully on-screen;
   * otherwise hide it. Driven from update() off the active pointer so HP/Shield stay live during combat
   * without needing a mouse move. Read-only — it submits no command and never touches world.rng. A cache key
   * (hex + the shown stats) skips the rebuild while the same thing is hovered, so this is cheap every frame.
   */
  private refreshEnemyHover(): void {
    if (this.cards.isOverlayOpen()) {
      this.hideEnemyCard(); // a modal overlay (pile / chest picker / equipment) owns the screen
      this.telegraph?.refreshHover(this.world, null); // and no threat line while a modal owns the screen
      return;
    }
    const p = this.input.activePointer;
    const hex = pixelToHex(this.layout, p.worldX, p.worldY);
    const { x: ex, y: ey } = hexToPixel(this.layout, hex);
    const onFrame = this.fullyInFrame(ex, ey);
    // The hover threat line follows the same on-board hex as the inspect card, but shows for any TELEGRAPHING
    // enemy (the overlay finds it on that hex) — independent of whether the inspect card itself has data.
    this.telegraph?.refreshHover(this.world, onFrame ? hex : null);
    const data = enemyCardAt(this.world, hex);
    // Only inspect an enemy whose hex is actually on-screen (the same cull the sprites use), so an enemy in
    // the HUD margin around the board is never shown.
    if (data === null || !onFrame) {
      this.hideEnemyCard();
      return;
    }
    // Open the card to the LEFT of the enemy when the enemy is left of the player, otherwise to the RIGHT
    // (the default) — so it sits toward open space rather than across the player. Compared in world pixels
    // (enemy hex centre vs the player's). The side is part of the cache key so it re-lays out if it flips.
    const playerPos = this.world.store(HexPosition).get(this.player)?.hex;
    const enemyLeftOfPlayer = playerPos !== undefined && ex < hexToPixel(this.layout, playerPos).x;
    const key = `${hex.q},${hex.r}|${data.name}|${data.hp}/${data.maxHp}|${data.shield}|${data.armor}|${data.attackName ?? ''}|${enemyLeftOfPlayer ? 'L' : 'R'}`;
    if (this.enemyCard !== null && this.enemyCardKey === key) return; // unchanged: keep the current card
    this.hideEnemyCard();
    const card = buildEnemyCard(this, data);
    const cam = this.cameras.main;
    const { w: cardW, h: cardH } = enemyCardSize();
    const halfW = cardW / 2;
    const halfH = cardH / 2;
    const { width, height } = this.scale;
    // Sit the card beside the enemy's hex (clear of its tall, bottom-anchored sprite) on the chosen side,
    // clamped so the whole card stays on-screen — mirrors EquipmentOverlay.showTooltip's beside-the-slot + clamp.
    const offsetX = this.layout.width / 2 + s(ENEMY_CARD_GAP) + halfW;
    const rawX = ex - cam.scrollX + (enemyLeftOfPlayer ? -offsetX : offsetX);
    const cx = Phaser.Math.Clamp(rawX, halfW + s(8), width - halfW - s(8));
    const cy = Phaser.Math.Clamp(ey - cam.scrollY, halfH + s(8), height - halfH - s(8));
    card.setPosition(cx, cy).setDepth(ENEMY_CARD_DEPTH);
    this.enemyCard = card;
    this.enemyCardKey = key;
  }

  /** Hide and drop the enemy inspect card, if any (Enemy Hover Card). */
  private hideEnemyCard(): void {
    this.enemyCard?.destroy();
    this.enemyCard = null;
    this.enemyCardKey = null;
  }

  /**
   * Play the chest's opening animation, then (after a short beat so the player sees it open) show the reward
   * picker. The animation rides the chest's ItemRenderable: set its anim to the one-shot opening key and bump
   * animEpoch so SceneSync (re)plays it. Input is locked for the whole beat (chestOpening). The picker reads
   * the offer the core interact system already rolled at ChestInteractReady.
   */
  private beginChestOpen(chest: EntityId): void {
    this.chestOpening = true;
    const r = this.world.store(ItemRenderable).get(chest);
    if (r !== undefined) {
      r.texture = AssetKeys.chest1Opening;
      delete r.frame;
      r.anim = CHEST_OPENING_ANIM;
      r.animEpoch = (r.animEpoch ?? 0) + 1;
    }
    this.time.delayedCall(CHEST_OPEN_BEAT_MS, () => this.openChestPicker(chest));
  }

  /**
   * Open the reward picker for `chest`, reading the option entities the interact system rolled. Picking
   * submits a TakeChestReward command (the core applies it and emits ChestOpened, handled in onChestOpened);
   * dismissing just reverts the chest to its closed sprite — the rolled offer is KEPT (persisted), so a later
   * visit re-opens the same choices. The input lock (chestOpening) is released here, when the player resolves
   * the picker.
   */
  private openChestPicker(chest: EntityId): void {
    const offer = this.world.store(ChestOffer).get(chest);
    if (offer === undefined) {
      this.chestOpening = false; // defensive: nothing to choose (offer gone)
      return;
    }
    this.cards.openChestChoice(offer.options, (chosen) => {
      this.chestOpening = false;
      if (chosen === null) {
        this.revertChestSprite(chest); // back to the closed chest; it re-opens the same offer later
        return;
      }
      this.world.submit({ kind: 'TakeChestReward', entity: this.player, chest, chosen });
    });
  }

  /** Revert a chest's sprite to its closed art (after the player cancels the reward picker). */
  private revertChestSprite(chest: EntityId): void {
    const r = this.world.store(ItemRenderable).get(chest);
    if (r === undefined) return;
    r.texture = AssetKeys.chest1Unopened;
    delete r.frame;
    delete r.anim;
  }

  /**
   * A chest was looted in the sim (the core interact system applied the pick and emitted ChestOpened): hold
   * the opened-chest frame (the opening animation already ran), refresh pile counts now the reward has landed,
   * and checkpoint. Driven by the event, not the pick callback, so the mutation stays core-owned.
   */
  private onChestOpened(chest: EntityId): void {
    const r = this.world.store(ItemRenderable).get(chest);
    if (r !== undefined) {
      r.texture = AssetKeys.chest1Opening;
      r.frame = CHEST_OPENED_FRAME;
      delete r.anim;
    }
    this.cards.refreshPiles();
    // A taken chest reward may have equipped a spellbook, changing the player's KnownSpells — rebuild the
    // spell sidebar so newly-granted spells appear (and a swapped-out book's spells leave).
    this.cards.refreshSpellSidebar();
    this.autosave();
  }

  /**
   * A disguised mimic woke (the core interact system revealed it and emitted MimicRevealed): swap its
   * Renderable from the static chest-disguise frame to its looping idle monster animation, and flash a notice.
   * Purely presentation — the reveal itself is owned by the core (Mimic.revealed persists).
   */
  private onMimicRevealed(mimic: EntityId): void {
    const art = this.world.store(Enemy).get(mimic)?.art ?? MIMIC_ART;
    this.world.store(Renderable).add(mimic, { texture: `${art}.idle`, animBase: art });
    this.toast.setText("It's a mimic!");
    this.time.delayedCall(1200, () => this.toast?.setText(''));
  }

  /**
   * Submit a player command. For a card/spell play, optimistically enter the 'ready'
   * stance the same frame: the engine only processes the queued command on the next
   * frame's advance() (one frame later), so without this the player briefly falls
   * back to 'idle' between disarming and the CardPlayed/SpellCast event — the
   * split-second idle flash after playing a skill card. That later event re-asserts
   * 'ready' (and adds the attack overlay for attack cards), so this is purely a head start.
   */
  private submitPlayerCommand(cmd: Command): void {
    this.world.submit(cmd);
    if (cmd.kind === 'PlayCard' || cmd.kind === 'PlaySpell') {
      const anim = this.world.store(AnimState).get(this.player);
      if (anim !== undefined) anim.base = 'ready';
    }
    // An attack turns the player to face the hex it was aimed at (the target hex, or the clicked hex
    // for a self-AOE), mirroring how a move faces its destination — so the attack animation plays the
    // right way round. Non-attack cards omit faceToward and keep the current facing.
    if (cmd.kind === 'PlayCard' && cmd.faceToward !== undefined) {
      const pos = this.world.store(HexPosition).get(this.player);
      if (pos !== undefined) {
        const facings = this.world.store(FacingState);
        const prev = facings.get(this.player)?.facing ?? 'right';
        facings.add(this.player, { facing: facingToward(this.layout, prev, pos.hex, cmd.faceToward) });
      }
    }
  }

  /**
   * Drive the player's transient AnimState (card-play feel). 'armed' mirrors the
   * CardController each frame; 'base' becomes 'ready' after playing any card or spell
   * and 'idle' at turn start or after a move. An attack card additionally plays a
   * one-shot overlay (attack1 by default, attack2 for a heavyAttack card) that a scene
   * timer clears back to the resting stance — deterministic and presentation-only.
   */
  private syncPlayerAnim(events: GameEvent[]): void {
    const anim = this.world.store(AnimState).get(this.player);
    if (anim === undefined) return;
    anim.armed = this.cards.isArmed();
    for (const e of events) {
      switch (e.kind) {
        case 'CardPlayed':
          if (e.entity !== this.player) break;
          anim.base = 'ready';
          if (isAttackCard(e.cardId)) this.playAttack(anim, isHeavyAttack(e.cardId) ? 'attack2' : 'attack1');
          break;
        case 'SpellCast':
          if (e.entity === this.player) anim.base = 'ready';
          break;
        case 'EntityStepped':
          if (e.entity === this.player) anim.base = 'idle';
          break;
        case 'TurnStarted':
          if (e.phase === 'player') {
            anim.base = 'idle';
            anim.oneShot = null;
            this.attackClearTimer?.remove();
            this.attackClearTimer = undefined;
          }
          break;
      }
    }
  }

  /** Start the given attack overlay (attack1 default / attack2 for heavy attacks) and clear it after it plays once. */
  private playAttack(anim: AnimStateData, variant: 'attack1' | 'attack2'): void {
    anim.oneShot = variant;
    this.attackClearTimer?.remove(); // a rapid second attack restarts the clear timer
    const durationMs = attackDurationMs(variant); // per-variant timing from the registry (frames / fps)
    this.attackClearTimer = this.time.delayedCall(durationMs, () => {
      const a = this.world.store(AnimState).get(this.player);
      if (a !== undefined && a.oneShot === variant) a.oneShot = null;
      this.attackClearTimer = undefined;
    });
  }

  /**
   * Input is locked for the whole move bracket: while the MoveAnimator is replaying the player's
   * move (movementStart..settle) or a command is queued but not yet resolved — so the full move
   * intent completes before any new move / End Turn / Restart Turn is accepted. Esc/Pause stays live.
   */
  private get inputLocked(): boolean {
    return (
      this.moveAnimator.isMoving(this.player) ||
      this.world.commands().length > 0 ||
      this.chestOpening ||
      this.defeated
    );
  }

  /**
   * Register the chest, turn, movement & card systems and re-attach the PLAYER's transient Renderable +
   * AnimState. The level's content (enemy/obstacle/chest) Renderables and grid flags are (re)attached by the
   * active level — this.level.populate (fresh) / reinstall (resume/restart) — not here, so WorldScene holds
   * no per-kind art or content loops.
   */
  private installSystems(): void {
    // Order: interact -> turn -> movement -> card. The interact system runs FIRST so the RequestMove it
    // submits for a chest/mimic interact is validated + executed by the turn/movement systems the SAME step (a
    // command submitted by a later system is dropped at step end); it also resolves a prior step's arrival,
    // emitting ChestInteractReady / MimicRevealed. The turn engine validates actions and emits CardPlayed /
    // TurnStarted; the movement system executes a same-step MoveTo; the card system (last) reacts to cards.
    this.world.addSystem(makeInteractSystem(this.grid));
    this.world.addSystem(makeTurnSystem(this.grid));
    // The enemy-turn system runs AFTER the turn engine (so it sees TurnStarted{enemy}) and BEFORE the
    // movement system (so each enemy MoveTo it submits resolves the SAME step) — and before the shield
    // system below (so a telegraph resolves against the player's live Shield before TurnStarted{player}
    // wipes it). On the enemy turn it resolves last turn's telegraphs, then moves + re-telegraphs each enemy
    // (Enemy AI: Movement & Telegraphed Attacks). The turn engine has no enemy-phase loop of its own.
    this.world.addSystem(makeEnemyTurnSystem(this.grid));
    // playerMoveBlockers makes a living enemy a LOW obstacle for the PLAYER's move resolution (route around it),
    // while every enemy MoveTo resolves unblocked — the enemy AI's path-through is untouched (player-only scope).
    this.world.addSystem(makeMovementSystem(this.grid, this.layout, playerMoveBlockers));
    this.world.addSystem(makeCardSystem(HAND_SIZE));
    // The card-attack system runs AFTER the card system so it sees the AttackRequested the card system emits
    // from a played Attack card, and resolves the damage (Defense & Shielding).
    this.world.addSystem(makeCardAttackSystem());
    // The spell system runs after the turn engine emitted SpellCast (and after the card system, mirroring it);
    // it lands a cast spell's effect — area damage via the combat resolver, self heal, or enemy teleport.
    this.world.addSystem(makeSpellSystem(this.grid));
    // The shield system runs LAST so it sees the turn engine's same-step events (TurnEnded/TurnStarted) and
    // the card system's Defend resolution: it resets the player's shield each player turn, wipes enemy shield
    // each player-turn end, and self-shields enemies on the enemy turn (Defense & Shielding).
    this.world.addSystem(makeShieldSystem());
    this.world.store(Renderable).add(this.player, {
      texture: AssetKeys.playerIdle,
      animBase: 'player',
    });
    // Transient animation stance (card-play feel), rebuilt here so Resume/Restart Turn
    // start the player in a neutral idle. Driven each frame from input + this turn's events.
    this.world.store(AnimState).add(this.player, { base: 'idle', armed: false, oneShot: null });
  }

  /**
   * A brand-new run: roll a fresh clock seed, pick the active level (selectLevelId — today always the
   * forest, the first production level) and build the run from it.
   */
  private freshWorld(): World {
    const seed = Date.now() >>> 0;
    const id = selectLevelId(seed); // the seam's level pick (forest today; a future level would join here)
    return this.buildRun(id, seed);
  }

  /**
   * Restart Level (from the pause menu): rebuild the SAME level from the start. The run's level id + seed
   * are read back from the autosave (persisted as LevelState) and replayed, so the terrain, obstacles and
   * chests regenerate IDENTICALLY — the level is reset to round 1, not re-randomised (the seed IS the level).
   * Falls back to a fresh run only if no save is readable.
   */
  private restartLevelWorld(): World {
    const loaded = loadRun(this.storage);
    if (loaded.ok) {
      const saved = applySave(loaded.state);
      const savedPlayer = saved.entitiesWith(Player)[0];
      const level = savedPlayer !== undefined ? saved.store(LevelState).get(savedPlayer) : undefined;
      if (level !== undefined) return this.buildRun(level.id, level.seed);
    }
    console.info('[world] restart level: no usable save; starting a fresh run');
    return this.freshWorld();
  }

  /**
   * Build the run for a GIVEN level id + seed: construct the world, the player and its equipment-derived
   * deck, persist the LevelState, and let the level generate + spawn its own content. Shared by a fresh run
   * (a rolled seed) and Restart Level (the run's saved seed), so the seed alone determines the whole level.
   */
  private buildRun(id: string, seed: number): World {
    this.level = makeLevel(id, seed);
    this.grid = new HexGrid(this.level.cols, this.level.rows);
    console.info('[world] build run — seed:', seed, '· level:', id);
    const world = createWorld(seed);
    this.player = world.createEntity();
    const start = this.level.startHex;
    world.store(Player).add(this.player, { isPlayer: true });
    world.store(HexPosition).add(this.player, { hex: start });
    world.store(FacingState).add(this.player, { facing: 'right' });
    // Persist the active level (id + seed) so a resumed run rebuilds the SAME level and regenerates its terrain.
    world.store(LevelState).add(this.player, { id, seed });
    world.store(TurnState).add(this.player, { phase: 'player', round: 1, activeActor: this.player });
    world.store(ResourcePool).add(this.player, {
      energy: ENERGY_MAX,
      energyMax: ENERGY_MAX,
      mana: 0,
      manaMax: MANA_MAX,
      manaRegen: MANA_REGEN,
    });
    world.store(MovementBudget).add(this.player, { remaining: MOVE_BUDGET, max: MOVE_BUDGET });
    // The player is a damageable combatant (ADR-007): full HP + armour, shared Health/CombatStats with
    // enemies so combat is symmetric. Reaching 0 HP (the loss condition) is the run-lifecycle feature (ADR-010).
    // The Shield pool starts empty; Defend banks it (reset each player turn by the shield system) — Defense & Shielding.
    world.store(Health).add(this.player, { hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP });
    // armor is the derived total (baseArmor + equipped item armour); equipStartingItems below recomputes it.
    world.store(CombatStats).add(this.player, { armor: PLAYER_ARMOR, baseArmor: PLAYER_ARMOR });
    world.store(Shield).add(this.player, { shield: 0 });
    // The deck is DERIVED from the player's starting equipment: equipping each basic item instantiates
    // its granted cards into the draw pile (sword -> 2 Melee Strike, shield -> 2 Defend, bow -> 2 Ranged
    // Shot, boots -> 2 Jump). There is no static starter collection any more.
    const deck: DeckStateData = { drawPile: [], hand: [], discardPile: [] };
    world.store(DeckState).add(this.player, deck);
    world.store(Equipment).add(this.player, { slots: {} });
    // Available spells are DERIVED from the equipped loadout (a spellbook grants them). Start empty; the
    // starter equipment has no spellbook, so the player begins with no spells until one is picked up.
    world.store(KnownSpells).add(this.player, { spellIds: [] });
    equipStartingItems(world, this.player); // populates the draw pile + recomputes armour/known-spells
    reshuffle(deck, world.rng); // shuffle the draw pile (the discard pile is empty)
    drawUpTo(deck, HAND_SIZE, world.rng); // opening hand (later turns draw via the card system on TurnStarted)
    // The active level generates + spawns its content (obstacles, chests, enemies) as entities with their
    // Renderables and applies the grid's walkability/sight flags. Chests roll their offered cards from
    // world.rng here (persisted), so this stays after the deck is dealt to keep the rng stream stable.
    this.level.populate(world, this.grid);
    return world;
  }

  /**
   * Rebuild the world from the save; fall back to a fresh run if none is usable. The active level (id +
   * seed) is read from the restored LevelState so the SAME level is rebuilt — its terrain regenerated from
   * the saved seed and its restored obstacle/chest/enemy entities re-applied + re-rendered via reinstall.
   */
  private resumeOrFresh(): World {
    const loaded = loadRun(this.storage);
    if (loaded.ok) {
      const world = applySave(loaded.state);
      const player = world.entitiesWith(Player)[0];
      if (player !== undefined) {
        this.player = player;
        const saved = world.store(LevelState).get(player);
        const id = saved?.id ?? FOREST_ID; // defensive: a save without LevelState resumes as the forest
        const seed = saved?.seed ?? (Date.now() >>> 0);
        this.level = makeLevel(id, seed);
        this.grid = new HexGrid(this.level.cols, this.level.rows);
        this.level.reinstall(world, this.grid); // re-apply grid flags + re-attach content Renderables
        console.info('[world] resumed from save — level:', id);
        return world;
      }
    }
    console.info('[world] no usable save; starting a new run');
    return this.freshWorld();
  }

  /**
   * Restart Turn: reload the per-turn autosave (start of the current turn), but
   * KEEP the live RNG so the stream continues (the brief's rule — no save-scum).
   * Reuses the same restore path as Resume / Restart Level.
   */
  private restartTurn(): void {
    const loaded = loadRun(this.storage);
    if (!loaded.ok) return;
    const liveRng = this.world.rng.state();
    const restored = applySave(loaded.state);
    const player = restored.entitiesWith(Player)[0];
    if (player === undefined) return;
    restored.rng.setState(liveRng);
    this.world = restored;
    this.player = player;
    this.pendingChest = null; // a queued chest pickup from the abandoned turn is dropped on restart
    this.pendingMimicReveal = null; // and any deferred mimic reveal
    this.chestOpening = false;
    this.level.reinstall(restored, this.grid); // re-apply grid flags + re-attach content Renderables
    this.installSystems();
    this.cards.cancel();
    this.cards.refreshHand();
  }

  private autosave(): void {
    // Never checkpoint a DEFEATED run: if the player is at 0 HP, leaving the prior checkpoint (the start of
    // the fatal turn, player alive) intact keeps Restart Level / Resume returning to a playable state.
    if ((this.world.store(Health).get(this.player)?.hp ?? 1) <= 0) return;
    saveRun(this.storage, this.world);
  }

  private isPlayerPhase(): boolean {
    return this.world.store(TurnState).get(this.player)?.phase === 'player';
  }

  private buildHud(): void {
    // Top-left button strip (see makeHudButton), laid out left-to-right. Each button is backed by the
    // ui.button art texture, so real 3-state button art drops in behind the same asset key later. The
    // boxes are square art slabs in the top strip; at this height they dip a few px below frame.top, over
    // the top hex row — cosmetic, since the HUD draws above the board. Dimensions are s()-wrapped and tuned
    // at visual-QA. The status line (and the toast) are shifted right of the row (textX) so the buttons
    // never cover them.
    const margin = s(20); // slight inset from the screen's left edge
    const gap = s(12); // gap between boxes, and after the row before the text column
    const btnW = s(56); // box width (short labels)
    const stripTop = s(8); // strip top inset
    const btnH = s(56); // box height — square box (matches btnW); dips ~s(12) below frame.top (s(52))
    const buttons: ReadonlyArray<{ label: string; onClick: () => void }> = [
      { label: 'Esc', onClick: () => this.openPauseLikeEsc() },
      {
        label: 'Full',
        onClick: () => (this.scale.isFullscreen ? this.scale.stopFullscreen() : this.scale.startFullscreen()),
      },
      { label: 'Turn', onClick: () => this.endTurnLikeSpace() },
    ];
    let x = margin;
    for (const b of buttons) {
      this.makeHudButton(x, stripTop, btnW, btnH, b.label, b.onClick);
      x += btnW + gap;
    }
    const textX = x; // the left text column starts just right of the button row

    this.hud = this.add
      .text(textX, s(16), '', { fontFamily: 'monospace', fontSize: `${s(28)}px`, color: '#cbd5e1' })
      .setDepth(1_000_000)
      .setScrollFactor(0);
    // The shield "+N" rides on the same baseline as the HUD line, light blue; refreshHud positions it in the
    // reserved gap after the HP value and blanks it when the player has no shield.
    this.shieldHud = this.add
      .text(textX, s(16), '', { fontFamily: 'monospace', fontSize: `${s(28)}px`, color: '#7dd3fc' })
      .setDepth(1_000_000)
      .setScrollFactor(0);
    this.toast = this.add
      .text(textX, s(96), '', { fontFamily: 'monospace', fontSize: `${s(26)}px`, color: '#f0a0a0' })
      .setDepth(1_000_000)
      .setScrollFactor(0);
    this.refreshHud();
  }

  /**
   * A top-left HUD button: the ui.button art slab with a centred label, screen-fixed at HUD depth.
   * Backed by the same `ui.button` texture as the menu buttons (3 frames: 0 normal, 1 hover, 2 disabled),
   * so real button art drops in behind the same asset key without touching this code. It is interactive and
   * sits at HUD depth above the transparent world input zone, so Phaser's top-only hit test routes the press
   * here and it never leaks to the board move/target handler; the action fires on pointerdown (before the
   * global pointer-up), mirroring its matching key. (x, y) is the top-left corner, in already-scaled px.
   */
  private makeHudButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void,
  ): void {
    const FRAME_NORMAL = '0';
    const FRAME_HOVER = '1';
    // A flat (single-frame) placeholder texture has only frame 0; degrade to an alpha-only hover then.
    const hasHover = this.textures.get(AssetKeys.uiButton).has(FRAME_HOVER);
    const bg = this.add
      .image(x, y, AssetKeys.uiButton, FRAME_NORMAL)
      .setOrigin(0, 0)
      .setDisplaySize(w, h)
      .setScrollFactor(0)
      .setDepth(1_000_000)
      .setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      if (hasHover) bg.setFrame(FRAME_HOVER, false); // keep the display size when swapping frames
      bg.setAlpha(0.85);
    });
    bg.on('pointerout', () => {
      if (hasHover) bg.setFrame(FRAME_NORMAL, false);
      bg.setAlpha(1);
    });
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return; // leave right-click to the global cancel path
      onClick();
    });
    this.add
      .text(x + w / 2, y + h / 2, label, { fontFamily: 'monospace', fontSize: `${s(22)}px`, color: '#cbd5e1' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1_000_001); // label sits just above the art
  }

  /** 'Esc to menu' button — mirrors keydown-ESC in create(): cancel an active move-preview / armed card first, else open Pause. */
  private openPauseLikeEsc(): void {
    if (this.move.isPreviewing()) this.move.cancel();
    else if (this.cards.isArmed()) this.cards.cancel();
    else (this.registry.get('router') as ScreenRouter).dispatch('Pause');
  }

  /** 'End turn' button — mirrors keydown-SPACE in create(): no-op while input is locked, else cancel move + cards and submit EndTurn. */
  private endTurnLikeSpace(): void {
    if (this.inputLocked) return;
    this.move.cancel();
    this.cards.cancel();
    this.world.submit({ kind: 'EndTurn', entity: this.player });
  }

  private refreshHud(): void {
    const health = this.world.store(Health).get(this.player);
    const pool = this.world.store(ResourcePool).get(this.player);
    const budget = this.world.store(MovementBudget).get(this.player);
    if (health === undefined || pool === undefined || budget === undefined) return;
    // The player's HP leads the status line (it replaced the former 'Round N · Your turn' segment); the
    // resource readouts follow. Refreshed every frame, so damage and heals show immediately. The wide gap
    // after the HP value reserves room for the light-blue "+N" shield overlay drawn on top (see below).
    const hpSegment = `HP ${health.hp}/${health.maxHp}`;
    this.hud.setText(
      `${hpSegment}        Energy ${pool.energy}/${pool.energyMax}    ` +
        `Mana ${pool.mana}/${pool.manaMax}    Move ${budget.remaining}/${budget.max}`,
    );
    // Overlay the shield as a light-blue "+N" right after the HP value (blank when 0). The HUD font is
    // monospace, so every glyph is the same width — char width = total width / char count — and the overlay
    // lands exactly on the column after `HP x/y ` regardless of the digit counts.
    const shield = this.world.store(Shield).get(this.player)?.shield ?? 0;
    const charWidth = this.hud.width / Math.max(1, this.hud.text.length);
    this.shieldHud.setText(shield > 0 ? `+${shield}` : '');
    this.shieldHud.setPosition(this.hud.x + charWidth * (hpSegment.length + 1), this.hud.y);
  }

  private flashRejected(reason: string): void {
    this.toast.setText(`✗ ${reason}`);
    this.time.delayedCall(1200, () => this.toast?.setText(''));
    // Every failed play funnels through here (CardController's notify + sim ActionRejected), so arming the
    // move-lockout once here covers them all: the next board click is swallowed instead of moving.
    this.moveLockedUntilMs = this.time.now + MOVE_LOCKOUT_AFTER_REJECT_MS;
  }

  /**
   * Hex-snap camera follow, staggered. The reference is the player's current VISUAL hex (the
   * MoveAnimator's replay cursor during a move, else the committed HexPosition), re-anchored only once
   * the player has drifted CAMERA_STAGGER_HEXES from it — so the camera pans every ~3rd hex rather than
   * every hop. The reference sits at the frame's centre cell, then the scroll is CLAMPED to scrollBounds
   * so the frame never reveals anything past the world edge (the camera simply stops at the edge). The
   * grid is redrawn only when the scroll actually changes.
   */
  private updateCamera(): void {
    const visual =
      this.moveAnimator.visualHexes().get(this.player) ??
      this.world.store(HexPosition).get(this.player)?.hex;
    if (visual === undefined) return;
    if (this.camRefHex === undefined || hexDistance(visual, this.camRefHex) >= CAMERA_STAGGER_HEXES) {
      this.camRefHex = visual;
    }
    const { x, y } = hexToPixel(this.layout, this.camRefHex);
    const sx = Math.min(Math.max(x - this.viewCenterPx.x, this.scrollBounds.minX), this.scrollBounds.maxX);
    const sy = Math.min(Math.max(y - this.viewCenterPx.y, this.scrollBounds.minY), this.scrollBounds.maxY);
    this.cameras.main.setScroll(sx, sy);
    if (sx !== this.lastGridScrollX || sy !== this.lastGridScrollY) {
      this.lastGridScrollX = sx;
      this.lastGridScrollY = sy;
      this.redrawGrid();
    }
  }

  /**
   * True when a hex centred at world pixel (worldX, worldY) sits FULLY inside the on-screen frame — so
   * only complete hexes show and nothing renders in the margins. Shared by the grid draw and the sprite
   * cull so they agree on exactly which cells are visible.
   */
  private fullyInFrame(worldX: number, worldY: number): boolean {
    const cam = this.cameras.main;
    const sx = worldX - cam.scrollX;
    const sy = worldY - cam.scrollY;
    const hw = this.layout.width / 2;
    const hh = this.layout.height / 2;
    return (
      sx - hw >= this.frame.left &&
      sx + hw <= this.frame.right &&
      sy - hh >= this.frame.top &&
      sy + hh <= this.frame.bottom
    );
  }

  /**
   * Build the active level's ground-terrain layer(s) and clip them to the visible hex frame. The level OWNS
   * the terrain content + the tilemap build (the forest's grass/dirt fill + grass-edge overlay + leaf
   * decals); WorldScene supplies the display context (scaled tile size + world bounds),
   * masks the returned layers to the frame, and tracks them. The layers are world-space (scroll with the
   * camera) but MASKED to a screen-fixed rect so terrain shows only under the hexes, not in the HUD margins.
   */
  private buildTerrain(): void {
    const ctx: LevelBuildContext = {
      scene: this,
      layout: this.layout,
      worldBounds: worldPixelBounds(this.layout, this.level.cols, this.level.rows),
      tileW: s(TERRAIN_TILE_W),
      tileH: s(TERRAIN_TILE_H),
    };
    this.terrainLayers = this.level.buildTerrain(ctx);
    const mask = this.buildTerrainMask();
    for (const layer of this.terrainLayers) layer.setMask(mask);
  }

  /**
   * The screen-pinned geometry mask clipping the terrain layers to the visible hex frame (mirrors
   * PileOverlay's mask). The TOP edge is extended up by an extra height so ground stays visible below the
   * tall, bottom-anchored sprites standing on the top-row hexes (otherwise terrain clips at their
   * shoulders); the bottom a little for the same reason.
   */
  private buildTerrainMask(): Phaser.Display.Masks.GeometryMask {
    const topPad = this.layout.height * 1.5; // one and a half hex height
    const bottomPad = this.layout.height * 0.25; // quarter hex height
    const maskShape = this.make.graphics({}, false);
    maskShape
      .fillStyle(0xffffff)
      .fillRect(
        this.frame.left,
        this.frame.top - topPad,
        this.frame.right - this.frame.left,
        this.frame.bottom - this.frame.top + topPad + bottomPad,
      );
    maskShape.setScrollFactor(0);
    return maskShape.createGeometryMask();
  }

  /**
   * Redraw the hex OUTLINE for the current camera scroll: every WORLD cell whose hexagon falls fully
   * inside the frame is stroked at its true world position; partial cells at the frame edge are skipped.
   * The terrain layer supplies the fill now, so this strokes only the hex outline. Runs
   * only on a camera pan.
   */
  private redrawGrid(): void {
    const gridLine = 0x000000; // faint dark hex outline over the textured terrain (tactical grid; tunable)
    const hw = this.layout.width / 2;
    const q1 = this.layout.height / 4;
    const q2 = this.layout.height / 2;
    const g = this.gridGfx;
    g.clear();
    g.lineStyle(s(2), gridLine, 0.18);
    for (let row = 0; row < this.level.rows; row += 1) {
      for (let col = 0; col < this.level.cols; col += 1) {
        const { x, y } = hexToPixel(this.layout, offsetToAxial({ col, row }));
        if (!this.fullyInFrame(x, y)) continue;
        g.beginPath();
        g.moveTo(x, y - q2);
        g.lineTo(x + hw, y - q1);
        g.lineTo(x + hw, y + q1);
        g.lineTo(x, y + q2);
        g.lineTo(x - hw, y + q1);
        g.lineTo(x - hw, y - q1);
        g.closePath();
        g.strokePath();
      }
    }
  }
}
