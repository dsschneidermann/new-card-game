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
  Enemy,
  Obstacle,
  applyObstacles,
  TurnState,
  ResourcePool,
  MovementBudget,
  makeMovementSystem,
  makeTurnSystem,
  makeCardSystem,
  DeckState,
  reshuffle,
  drawUpTo,
  Equipment,
  equipStartingItems,
  Chest,
  spawnChest,
  unopenedChestAt,
  takeChestCard,
  isAttackCard,
  isHeavyAttack,
  facingToward,
  hexToPixel,
  pixelToHex,
  offsetToAxial,
  hexDistance,
  findPath,
  worldPixelBounds,
  terrainTile,
  terrainOverlay,
  terrainLeaf,
  FOREST_LEVEL,
  s,
  type Hex,
  type HexLayout,
  type LevelDef,
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
import type { ScreenRouter } from '@scenes/ScreenRouter';
import { CardController } from '@scenes/CardController';
import { MovePlanner } from '@scenes/MovePlanner';
import { MoveAnimator } from '@render/MoveAnimator';
import { terrainThemeForLevel, type TerrainTheme } from '@render/terrainTheme';

/** Scene-start payload: Resume rebuilds from the save, otherwise a fresh run. */
interface WorldSceneData {
  resume?: boolean;
}

// Pointy-top, perspective-foreshortened hexes in offset (odd-r) rows (ADR-006).
// The LAYOUT pixel fields are base (iPad) values scaled via s() into this.layout at
// create time (s() must not run at module load).
// The world size, start hex, enemy spawns and terrain seed now live in the active LevelDef (FOREST_LEVEL);
// WorldScene reads them off this.level. The Larger World feature made the forest 4x the original 26x21 area.
// The visible window stays exactly the original 26x21 grid (same on-screen frame + full hexes); the
// camera shows this 26x21 window into the larger world and content outside it is hidden.
const VIEW_COLS = 26;
const VIEW_ROWS = 21;
const VIEW_CENTER_COL = Math.floor(VIEW_COLS / 2); // the window cell the player is centred on (13)
const VIEW_CENTER_ROW = Math.floor(VIEW_ROWS / 2); // (10)

// Ground terrain (Hex Ground Terrain): a background tile grid, independent of the hexes, drawn as a
// world-sized TilemapLayer (below the hex outline) MASKED to the visible hex frame. Per-cell tile: core terrainTile.
// Tiles are drawn SKEWED (width != height) although the source art is a natural 16x16 square.
const TERRAIN_TILE_W = 24; // Desktop base px tile WIDTH
const TERRAIN_TILE_H = 16; // Desktop base px tile HEIGHT -> vertical squish vs the 16x16 source
const TERRAIN_DEPTH = -1_100_000; // below the hex outline (gridGfx at -1_000_000)
const TERRAIN_OVERLAY_DEPTH = -1_050_000; // grass-edge overlay layer: above the terrain fill, below the hex outline
const LEAF_DEPTH = -1_025_000; // grass-leaf detail layer: above the grass-edge overlay, below the hex outline
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
  // The active level (size / start hex / enemy spawns / terrain seed) and its renderer terrain theme
  // (tileset keys + fill/overlay/leaf frames & shapes). Resolved at the top of create().
  private level!: LevelDef;
  private theme!: TerrainTheme;
  private sync!: SceneSync;
  private player!: EntityId;
  private storage!: StorageAdapter;
  private hud!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private cards!: CardController;
  private moveAnimator!: MoveAnimator;
  private move!: MovePlanner;
  private layout!: HexLayout;
  // The grass grid, drawn in WORLD space and redrawn (only on a camera pan) for the world cells that
  // fall fully inside the visible frame — so every drawn hex is a real, in-bounds world cell.
  private gridGfx!: Phaser.GameObjects.Graphics;
  // Ground terrain: a world-sized TilemapLayer (tile indices, no baked texture — Phaser culls to the viewport)
  // MASKED to the visible hex frame, so terrain shows only under the hexes, not in the HUD margins.
  private terrainLayer!: Phaser.Tilemaps.TilemapLayer;
  // The grass-edge OVERLAY layer drawn on top of the terrain fill (auto-tiling; dirt cells only).
  private overlayLayer!: Phaser.Tilemaps.TilemapLayer;
  // The grass-leaf detail layer drawn on top of the grass-edge overlay (decorative; all-grass 2x2 blocks only).
  private leafLayer!: Phaser.Tilemaps.TilemapLayer;
  private terrainCols = 0;
  private terrainRows = 0;
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
  // A chest the player TARGETED to interact with, queued to open once the move to the preceding hex settles
  // (see requestChestInteract / maybeOpenChest). Set only by an explicit chest target, never by adjacency.
  private pendingChest: EntityId | null = null;

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
    const router = this.registry.get('router') as ScreenRouter;
    this.storage = this.registry.get('storage') as StorageAdapter;
    // Resolve the active level + its terrain theme. For now the game is the single Forest level; level
    // transitions (later) will choose which LevelDef to load here.
    this.level = FOREST_LEVEL;
    this.theme = terrainThemeForLevel(this.level.id);
    this.grid = new HexGrid(this.level.cols, this.level.rows);
    applyObstacles(this.grid, this.level.obstacles); // obstacles block movement; tall obstacles also block line of sight
    this.sync = new SceneSync(this, HOP_MS);
    // Hex layout in current-scale pixels (s() — must run here, not at module load).
    this.layout = { width: s(64), height: s(48), rowPitch: s(36), originX: s(192), originY: s(76) };
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

    this.world = data?.resume === true ? this.resumeOrFresh() : this.freshWorld();
    this.installSystems();

    this.createTerrain(); // ground-tile background as a TilemapLayer windowed to the visible viewport
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
      // isHexVisible stays for the ACTION gate only: MovePlanner.onRelease cancels a move released off the
      // visible board (onVisibleBoard). The visual clipping of the reachable fill + route numbers now rides
      // the shared effectMask below, like the card-targeting paint.
      isHexVisible: (hex) => {
        const { x, y } = hexToPixel(this.layout, hex);
        return this.fullyInFrame(x, y);
      },
      effectMask: this.effectMask,
      // Targeting an unopened chest is a zero-cost interact rather than a stand-on move (see requestChestInteract).
      chestInteractAt: (hex) => unopenedChestAt(this.world, hex) ?? null,
      requestChestInteract: (chest) => this.requestChestInteract(chest),
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
    const views = [...buildCharacterViews(this.world, this.layout, this.moveAnimator.visualHexes())].filter(
      (v) => this.fullyInFrame(v.x, v.y),
    );
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
    }
    this.maybeOpenChest();
  }

  /**
   * Resolve a chest INTERACT: the player TARGETED an unopened chest, a zero movement-point action. Walk the
   * planner's path to the chest MINUS its last step — stop on the hex immediately preceding the chest, paying
   * only for that travel — then open it once the move settles (maybeOpenChest). If the player is already
   * adjacent to (or standing on) the chest, no move is issued and the picker opens on the next tick. Activation
   * happens ONLY here, never automatically by ending a move near a chest.
   */
  private requestChestInteract(chest: EntityId): void {
    const chestHex = this.world.store(HexPosition).get(chest)?.hex;
    const from = this.world.store(HexPosition).get(this.player)?.hex;
    if (chestHex === undefined || from === undefined) return;
    const path = findPath(this.grid, from, chestHex);
    if (path.length === 0) return; // unreachable (defensive — the planner already gated on reachability)
    this.pendingChest = chest;
    if (path.length > 2) {
      // path = [from, ..., penultimate, chest]; move to the penultimate so the chest's own last step is free.
      const penultimate = path[path.length - 2] as Hex;
      this.submitPlayerCommand({ kind: 'RequestMove', entity: this.player, q: penultimate.q, r: penultimate.r });
    }
    // path.length 1 (standing on the chest) or 2 (already adjacent): no travel — maybeOpenChest opens it next tick.
  }

  /**
   * Open the chest reward picker once the player's move has visually settled on the hex preceding the chest
   * (or immediately, when no move was needed). Deferred to here (not a move event) so the dim modal appears
   * after the sprite arrives, not mid-slide. Opens once: pendingChest is cleared when the picker opens; the
   * pick is applied in the callback — the chosen card goes to the player's discard pile and the chest becomes
   * a purely-visual opened chest (its sprite is swapped to the opened-chest art); a cancel leaves it closed.
   */
  private maybeOpenChest(): void {
    if (this.pendingChest === null) return;
    if (this.moveAnimator.isMoving(this.player)) return; // wait for the move slide to finish
    if (this.cards.isOverlayOpen()) return; // don't stack over an already-open overlay
    const chest = this.pendingChest;
    this.pendingChest = null;
    const data = this.world.store(Chest).get(chest);
    if (data === undefined) return; // chest already gone (defensive)
    this.cards.openChestChoice(data.offered, (chosen) => {
      if (chosen === null) return; // cancelled — the chest stays closed for a later visit
      takeChestCard(this.world, this.player, chest, chosen);
      // The chest is now looted: swap its Renderable to the opened-chest sprite (purely visual).
      this.world.store(Renderable).add(chest, { texture: AssetKeys.chestOpen });
      this.cards.refreshPiles();
      this.autosave();
    });
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
    return this.moveAnimator.isMoving(this.player) || this.world.commands().length > 0;
  }

  /** Register the turn, movement & card systems and re-attach the transient Renderable. */
  private installSystems(): void {
    // Order: turn -> movement -> card. The turn engine validates actions and emits CardPlayed /
    // TurnStarted; the movement system executes a same-step MoveTo; the card system (last) reacts
    // to those events to draw/discard cards and resolve effects.
    this.world.addSystem(makeTurnSystem(this.grid));
    this.world.addSystem(makeMovementSystem(this.grid, this.layout));
    this.world.addSystem(makeCardSystem(HAND_SIZE));
    this.world.store(Renderable).add(this.player, {
      texture: AssetKeys.playerIdle,
      animBase: 'player',
    });
    // Transient animation stance (card-play feel), rebuilt here so Resume/Restart Turn
    // start the player in a neutral idle. Driven each frame from input + this turn's events.
    this.world.store(AnimState).add(this.player, { base: 'idle', armed: false, oneShot: null });
    // Enemies render through the same pipeline: a transient Renderable per enemy carrying its own
    // roster art base (Enemy.art), re-attached here on Resume/Restart Turn like the player's.
    for (const [enemy, { art }] of this.world.store(Enemy).entries()) {
      this.world.store(Renderable).add(enemy, { texture: `${art}.idle`, animBase: art });
    }
    // Obstacles render through the same pipeline as a STATIC sprite (no animBase): a transient Renderable
    // carrying the level theme's art for the obstacle's kind, re-attached here on Resume/Restart Turn.
    for (const [obstacle, { kind }] of this.world.store(Obstacle).entries()) {
      this.world.store(Renderable).add(obstacle, { texture: this.theme.obstacleArt[kind] });
    }
    // Chests render as a STATIC sprite too (no animBase), re-attached here on Resume/Restart Turn.
    // An already-opened chest (restored from save) shows the purely-visual opened-chest art.
    for (const [chest, data] of this.world.store(Chest).entries()) {
      this.world.store(Renderable).add(chest, { texture: data.opened ? AssetKeys.chestOpen : AssetKeys.chest });
    }
  }

  /** A brand-new run: a clock-seeded world with the player and its turn state. */
  private freshWorld(): World {
    const seed = Date.now() >>> 0;
    console.info('[world] new run seed:', seed);
    const world = createWorld(seed);
    this.player = world.createEntity();
    const start = this.level.startHex;
    world.store(Player).add(this.player, { isPlayer: true });
    world.store(HexPosition).add(this.player, { hex: start });
    world.store(FacingState).add(this.player, { facing: 'right' });
    world.store(TurnState).add(this.player, { phase: 'player', round: 1, activeActor: this.player });
    world.store(ResourcePool).add(this.player, {
      energy: ENERGY_MAX,
      energyMax: ENERGY_MAX,
      mana: 0,
      manaMax: MANA_MAX,
      manaRegen: MANA_REGEN,
    });
    world.store(MovementBudget).add(this.player, { remaining: MOVE_BUDGET, max: MOVE_BUDGET });
    // The deck is DERIVED from the player's starting equipment: equipping each basic item instantiates
    // its granted cards into the draw pile (sword -> 2 Melee Strike, shield -> 2 Defend, bow -> 2 Ranged
    // Shot, boots -> 2 Jump). There is no static starter collection any more.
    const deck: DeckStateData = { drawPile: [], hand: [], discardPile: [] };
    world.store(DeckState).add(this.player, deck);
    world.store(Equipment).add(this.player, { slots: {} });
    equipStartingItems(world, this.player); // populates the draw pile with the basics' granted cards
    reshuffle(deck, world.rng); // shuffle the draw pile (the discard pile is empty)
    drawUpTo(deck, HAND_SIZE, world.rng); // opening hand (later turns draw via the card system on TurnStarted)
    // Enemies are spawned from the active level definition. The forest has none for now — the temporary
    // "one of every enemy" showcase was removed; curated per-level rosters arrive with the enemy features.
    for (const spawn of this.level.enemySpawns) {
      const enemy = world.createEntity();
      world.store(Enemy).add(enemy, { isEnemy: true, art: spawn.art });
      world.store(HexPosition).add(enemy, { hex: spawn.hex });
    }
    // Obstacles are entities too (Obstacle{kind} + HexPosition): installSystems attaches their art
    // Renderable and create() already applied their walkability/sight flags to the grid.
    for (const spawn of this.level.obstacles) {
      const obstacle = world.createEntity();
      world.store(Obstacle).add(obstacle, { kind: spawn.kind });
      world.store(HexPosition).add(obstacle, { hex: spawn.hex });
    }
    // Chests are entities too (Chest{offered} + HexPosition) on WALKABLE tiles; the player opens one by
    // TARGETING it with a move (a zero-cost interact). Each rolls its three offered cards from world.rng at build (persisted);
    // installSystems attaches the chest art Renderable.
    for (const spawn of this.level.chests) {
      spawnChest(world, spawn.hex);
    }
    return world;
  }

  /** Rebuild the world from the save; fall back to a fresh run if none is usable. */
  private resumeOrFresh(): World {
    const loaded = loadRun(this.storage);
    if (loaded.ok) {
      const world = applySave(loaded.state);
      const player = world.entitiesWith(Player)[0];
      if (player !== undefined) {
        this.player = player;
        console.info('[world] resumed from save');
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
    this.installSystems();
    this.cards.cancel();
    this.cards.refreshHand();
  }

  private autosave(): void {
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
    const ts = this.world.store(TurnState).get(this.player);
    const pool = this.world.store(ResourcePool).get(this.player);
    const budget = this.world.store(MovementBudget).get(this.player);
    if (ts === undefined || pool === undefined || budget === undefined) return;
    const phase = ts.phase === 'player' ? 'Your turn' : 'Enemy turn';
    this.hud.setText(
      `Round ${ts.round}  ·  ${phase}    Energy ${pool.energy}/${pool.energyMax}    ` +
        `Mana ${pool.mana}/${pool.manaMax}    Move ${budget.remaining}/${budget.max}`,
    );
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
   * Create the ground-terrain TilemapLayer sized to the whole hex GAME WORLD (worldPixelBounds of the
   * GRID_COLS x GRID_ROWS grid), snapped to the terrain grid and filled ONCE from the pure core terrainTile.
   * A TilemapLayer stores tile INDICES (no baked texture) and Phaser culls rendering to the viewport, so a
   * world-sized layer stays cheap — the whole point of moving off the RenderTexture. It is world-space (scrolls
   * with the camera) but MASKED to the visible hex frame (a screen-fixed rect) so terrain shows only under the
   * hexes, not in the HUD margins.
   */
  private createTerrain(): void {
    const tileWpx = s(TERRAIN_TILE_W);
    const tileHpx = s(TERRAIN_TILE_H);
    const key = this.theme.groundKey;
    const leafKey = this.theme.leafKey;
    const seed = this.level.terrainSeed;
    // Per-kind variant count = its fill-frame list length, passed into the pure terrainTile so the variant
    // index always lands within the available frames (no separate count to keep in sync with the frames).
    const variantCounts = {
      grass: this.theme.fillFrames.grass.length,
      dirt: this.theme.fillFrames.dirt.length,
    };
    // NEAREST so the 16px pixel-art tiles stay crisp scaled up.
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get(leafKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
    const wb = worldPixelBounds(this.layout, this.level.cols, this.level.rows);
    const originCol = Math.floor(wb.minX / tileWpx);
    // Extend the layer's TOP up by the mask's one-hex-height top-pad (layout.height) so real tiles fill it —
    // no empty sliver above the terrain when scrolled hard against the world's top edge.
    const topPadRows = Math.ceil(this.layout.height / tileHpx);
    const originRow = Math.floor(wb.minY / tileHpx) - topPadRows;
    this.terrainCols = Math.ceil(wb.maxX / tileWpx) - originCol + 1;
    this.terrainRows = Math.ceil(wb.maxY / tileHpx) - originRow + 1;
    const map = this.make.tilemap({ tileWidth: 16, tileHeight: 16, width: this.terrainCols, height: this.terrainRows });
    const tileset = map.addTilesetImage('terrain', key, 16, 16) as Phaser.Tilemaps.Tileset;
    // Second tileset on the SAME map for the grass-leaf decals (the stairs_grass foliage sheet). Its firstgid sits
    // just past the ground tileset's range, so leaf tile gids never collide with the fill/overlay (ground) gids.
    const leafFirstGid = tileset.firstgid + tileset.total;
    const leafTileset = map.addTilesetImage('stairs_grass', leafKey, 16, 16, 0, 0, leafFirstGid) as Phaser.Tilemaps.Tileset;
    this.terrainLayer = map
      .createBlankLayer('terrain', tileset as Phaser.Tilemaps.Tileset, originCol * tileWpx, originRow * tileHpx)!
      .setScale(tileWpx / 16, tileHpx / 16)
      .setDepth(TERRAIN_DEPTH);
    // Second layer (same map/tileset) for the grass-edge overlays, on top of the terrain fill.
    this.overlayLayer = map
      .createBlankLayer('overlay', tileset as Phaser.Tilemaps.Tileset, originCol * tileWpx, originRow * tileHpx)!
      .setScale(tileWpx / 16, tileHpx / 16)
      .setDepth(TERRAIN_OVERLAY_DEPTH);
    // Third layer for the grass-leaf decals, drawn from the stairs_grass tileset, on top of the grass-edge overlays.
    this.leafLayer = map
      .createBlankLayer('leaf', [tileset, leafTileset], originCol * tileWpx, originRow * tileHpx)!
      .setScale(tileWpx / 16, tileHpx / 16)
      .setDepth(LEAF_DEPTH);
    for (let ty = 0; ty < this.terrainRows; ty += 1) {
      for (let tx = 0; tx < this.terrainCols; tx += 1) {
        const { kind, variant } = terrainTile(originCol + tx, originRow + ty, seed, variantCounts);
        this.terrainLayer.putTileAt(this.theme.fillFrames[kind][variant] as number, tx, ty);
        const overlay = terrainOverlay(originCol + tx, originRow + ty, seed);
        if (overlay !== null) this.overlayLayer.putTileAt(this.theme.overlayFrames[overlay], tx, ty);
        const leafFrame = terrainLeaf(originCol + tx, originRow + ty, seed, this.theme.leafShapes);
        // leaf frame indices are LOCAL to the stairs_grass sheet -> offset past the ground tileset's gid range.
        if (leafFrame !== null) this.leafLayer.putTileAt(leafFirstGid + leafFrame, tx, ty);
      }
    }
    // Clip the world-sized layer to the visible hex FRAME so terrain shows only under the hexes, not in the HUD
    // margins. The layer scrolls (world-space); the mask is screen-pinned (scrollFactor 0), like PileOverlay's.
    // The TOP edge is extended up by an extra height so ground stays visible below sprites standing on the
    // top-row hexes (sprites are bottom-anchored and tall; otherwise the terrain clips right at their shoulders).
    const topPad = this.layout.height * 1.5; // one and half hex height
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
    const mask = maskShape.createGeometryMask();
    this.terrainLayer.setMask(mask);
    this.overlayLayer.setMask(mask);
    this.leafLayer.setMask(mask);
    console.info(
      `[terrain] world layer: ${this.terrainCols} x ${this.terrainRows} = ${this.terrainCols * this.terrainRows} tiles (tile ${tileWpx}x${tileHpx}px)`,
    );
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
