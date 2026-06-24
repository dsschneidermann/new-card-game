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
  hexEquals,
  TurnState,
  ResourcePool,
  MovementBudget,
  makeMovementSystem,
  makeTurnSystem,
  makeCardSystem,
  DeckState,
  buildCardInstances,
  reshuffle,
  drawUpTo,
  STARTER_COLLECTION,
  isAttackCard,
  isHeavyAttack,
  facingToward,
  hexToPixel,
  pixelToHex,
  offsetToAxial,
  hexDistance,
  worldPixelBounds,
  terrainTile,
  terrainOverlay,
  terrainLeaf,
  s,
  type Hex,
  type HexLayout,
  type TerrainKind,
  type TerrainOverlay,
  type LeafShape,
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

/** Scene-start payload: Resume rebuilds from the save, otherwise a fresh run. */
interface WorldSceneData {
  resume?: boolean;
}

// Pointy-top, perspective-foreshortened hexes in offset (odd-r) rows (ADR-006).
// The LAYOUT pixel fields are base (iPad) values scaled via s() into this.layout at
// create time (s() must not run at module load).
// 4x the original area (was 26x21) — the camera follows the player and renders only the visible window
// of hexes (Larger World & Hex-Snap Camera Follow feature).
const GRID_COLS = 52;
const GRID_ROWS = 42;
// The visible window stays exactly the original 26x21 grid (same on-screen frame + full hexes); the
// camera shows this 26x21 window into the larger world and content outside it is hidden.
const VIEW_COLS = 26;
const VIEW_ROWS = 21;
const VIEW_CENTER_COL = Math.floor(VIEW_COLS / 2); // the window cell the player is centred on (13)
const VIEW_CENTER_ROW = Math.floor(VIEW_ROWS / 2); // (10)

// Ground terrain (Hex Ground Terrain): a SQUARE background tile grid, independent of the hexes, drawn as a
// world-sized TilemapLayer (below the hex outline) MASKED to the visible hex frame. Per-cell tile: core terrainTile.
const TERRAIN_TILE = 16; // base px of a square terrain tile; at desktop 2x this is s(16)=32px = twice the source's native 16px.
const TERRAIN_DEPTH = -1_100_000; // below the hex outline (gridGfx at -1_000_000)
const TERRAIN_SEED = 0x7e44a1; // fixed -> a consistent designed ground (could key off the world seed for per-run variation)
// (kind, variant) -> frame index in the terrain.ground_grass 16x16 sheet. Curated PLAIN fill tiles: the only clean
// GRASS fill is the flat green; the textured fills are the DIRT/rock tiles. These lists are the single source of
// truth for how many variants each kind has (see TERRAIN_VARIANT_COUNTS). Tuned at review.
const TERRAIN_FILL_FRAMES: Record<TerrainKind, readonly number[]> = {
  grass: [527],
  dirt: [422]
};
// Per-kind variant count = its fill-frame list length, derived ONCE from the lists above and passed into the core
// terrainTile, so the variant index always lands within the available frames (no separate count to keep in sync).
const TERRAIN_VARIANT_COUNTS: Record<TerrainKind, number> = {
  grass: TERRAIN_FILL_FRAMES.grass.length,
  dirt: TERRAIN_FILL_FRAMES.dirt.length,
};
const TERRAIN_OVERLAY_DEPTH = -1_050_000; // grass-edge overlay layer: above the terrain fill, below the hex outline
// Grass-edge overlay descriptor -> Ground_grass frame: pairs (two adjacent cardinals) / edges / diagonal corners.
const OVERLAY_FRAMES: Record<TerrainOverlay, number> = {
  pairWN: 571, pairNE: 572, pairES: 593, pairSW: 592,
  edgeW: 591, edgeN: 611, edgeE: 589, edgeS: 578,
  cornerNW: 612, cornerNE: 610, cornerSE: 568, cornerSW: 570,
};
const LEAF_DEPTH = -1_025_000; // grass-leaf detail layer: above the grass-edge overlay, below the hex outline
// Grass-leaf decals from the stairs_grass foliage sheet (AssetKeys.terrainStairsGrass). Each decal is a SHAPE: a
// list of { dx, dy, frame } tiles anchored at its top-left (frame = LOCAL stairs_grass index, 21 cols; the renderer
// offsets it past the ground tileset). These 41 shapes were extracted from the gap-separated clusters in the TMX
// "reeds" layer. The core scatters them one-per-slot on grass; each decal must fit within LEAF_SLOT (5) cells.
const LEAF_SHAPES: readonly LeafShape[] = [
  [{ dx: 0, dy: 0, frame: 113 }, { dx: 1, dy: 0, frame: 114 }, { dx: 0, dy: 1, frame: 134 }, { dx: 1, dy: 1, frame: 135 }, { dx: 0, dy: 2, frame: 155 }, { dx: 1, dy: 2, frame: 156 }], // 2x3
  [{ dx: 0, dy: 0, frame: 115 }, { dx: 1, dy: 0, frame: 116 }, { dx: 2, dy: 0, frame: 117 }, { dx: 0, dy: 1, frame: 136 }, { dx: 1, dy: 1, frame: 137 }, { dx: 2, dy: 1, frame: 138 }, { dx: 0, dy: 2, frame: 157 }, { dx: 1, dy: 2, frame: 158 }, { dx: 2, dy: 2, frame: 159 }], // 3x3
  [{ dx: 0, dy: 0, frame: 118 }, { dx: 1, dy: 0, frame: 119 }, { dx: 2, dy: 0, frame: 120 }, { dx: 0, dy: 1, frame: 139 }, { dx: 1, dy: 1, frame: 140 }, { dx: 2, dy: 1, frame: 141 }, { dx: 0, dy: 2, frame: 160 }, { dx: 1, dy: 2, frame: 161 }, { dx: 2, dy: 2, frame: 162 }], // 3x3
  [{ dx: 0, dy: 0, frame: 121 }, { dx: 1, dy: 0, frame: 122 }, { dx: 0, dy: 1, frame: 142 }, { dx: 1, dy: 1, frame: 143 }, { dx: 0, dy: 2, frame: 163 }, { dx: 1, dy: 2, frame: 164 }], // 2x3
  [{ dx: 0, dy: 0, frame: 169 }, { dx: 1, dy: 0, frame: 170 }, { dx: 2, dy: 0, frame: 171 }, { dx: 0, dy: 1, frame: 190 }, { dx: 1, dy: 1, frame: 191 }, { dx: 2, dy: 1, frame: 192 }, { dx: 0, dy: 2, frame: 211 }, { dx: 1, dy: 2, frame: 212 }, { dx: 2, dy: 2, frame: 213 }], // 3x3
  [{ dx: 0, dy: 0, frame: 175 }, { dx: 1, dy: 0, frame: 176 }, { dx: 2, dy: 0, frame: 177 }, { dx: 0, dy: 1, frame: 196 }, { dx: 1, dy: 1, frame: 197 }, { dx: 2, dy: 1, frame: 198 }, { dx: 0, dy: 2, frame: 217 }, { dx: 1, dy: 2, frame: 218 }, { dx: 2, dy: 2, frame: 219 }], // 3x3
  [{ dx: 0, dy: 0, frame: 178 }, { dx: 1, dy: 0, frame: 179 }, { dx: 0, dy: 1, frame: 199 }, { dx: 1, dy: 1, frame: 200 }, { dx: 0, dy: 2, frame: 220 }, { dx: 1, dy: 2, frame: 221 }], // 2x3
  [{ dx: 0, dy: 0, frame: 180 }, { dx: 1, dy: 0, frame: 181 }, { dx: 0, dy: 1, frame: 201 }, { dx: 1, dy: 1, frame: 202 }], // 2x2
  [{ dx: 0, dy: 0, frame: 182 }, { dx: 1, dy: 0, frame: 183 }, { dx: 0, dy: 1, frame: 203 }, { dx: 1, dy: 1, frame: 204 }], // 2x2
  [{ dx: 0, dy: 0, frame: 184 }, { dx: 1, dy: 0, frame: 185 }, { dx: 0, dy: 1, frame: 205 }, { dx: 1, dy: 1, frame: 206 }], // 2x2
  [{ dx: 0, dy: 0, frame: 193 }, { dx: 1, dy: 0, frame: 194 }, { dx: 2, dy: 0, frame: 195 }, { dx: 0, dy: 1, frame: 214 }, { dx: 1, dy: 1, frame: 215 }, { dx: 2, dy: 1, frame: 216 }], // 3x2
  [{ dx: 0, dy: 0, frame: 222 }, { dx: 1, dy: 0, frame: 223 }, { dx: 0, dy: 1, frame: 243 }, { dx: 1, dy: 1, frame: 244 }], // 2x2
  [{ dx: 0, dy: 0, frame: 224 }, { dx: 1, dy: 0, frame: 225 }, { dx: 0, dy: 1, frame: 245 }, { dx: 1, dy: 1, frame: 246 }], // 2x2
  [{ dx: 0, dy: 0, frame: 226 }, { dx: 1, dy: 0, frame: 227 }, { dx: 0, dy: 1, frame: 247 }, { dx: 1, dy: 1, frame: 248 }], // 2x2
  [{ dx: 0, dy: 0, frame: 232 }, { dx: 1, dy: 0, frame: 233 }, { dx: 2, dy: 0, frame: 234 }, { dx: 0, dy: 1, frame: 253 }, { dx: 1, dy: 1, frame: 254 }, { dx: 2, dy: 1, frame: 255 }], // 3x2
  [{ dx: 0, dy: 0, frame: 235 }, { dx: 1, dy: 0, frame: 236 }, { dx: 0, dy: 1, frame: 256 }, { dx: 1, dy: 1, frame: 257 }], // 2x2
  [{ dx: 0, dy: 0, frame: 237 }, { dx: 1, dy: 0, frame: 238 }, { dx: 0, dy: 1, frame: 258 }, { dx: 1, dy: 1, frame: 259 }], // 2x2
  [{ dx: 0, dy: 0, frame: 239 }, { dx: 1, dy: 0, frame: 240 }, { dx: 0, dy: 1, frame: 260 }, { dx: 1, dy: 1, frame: 261 }], // 2x2
  [{ dx: 0, dy: 0, frame: 241 }, { dx: 1, dy: 0, frame: 242 }, { dx: 0, dy: 1, frame: 262 }, { dx: 1, dy: 1, frame: 263 }], // 2x2
  [{ dx: 0, dy: 0, frame: 264 }, { dx: 1, dy: 0, frame: 265 }], // 2x1
  [{ dx: 0, dy: 0, frame: 266 }, { dx: 1, dy: 0, frame: 267 }], // 2x1
  [{ dx: 0, dy: 0, frame: 268 }], // 1x1
  [{ dx: 0, dy: 0, frame: 269 }], // 1x1
  [{ dx: 0, dy: 0, frame: 274 }, { dx: 1, dy: 0, frame: 275 }, { dx: 0, dy: 1, frame: 295 }, { dx: 1, dy: 1, frame: 296 }], // 2x2
  [{ dx: 0, dy: 0, frame: 276 }, { dx: 1, dy: 0, frame: 277 }, { dx: 0, dy: 1, frame: 297 }, { dx: 1, dy: 1, frame: 298 }], // 2x2
  [{ dx: 0, dy: 0, frame: 278 }, { dx: 1, dy: 0, frame: 279 }, { dx: 2, dy: 0, frame: 280 }, { dx: 0, dy: 1, frame: 299 }, { dx: 1, dy: 1, frame: 300 }, { dx: 2, dy: 1, frame: 301 }], // 3x2
  [{ dx: 0, dy: 0, frame: 281 }, { dx: 1, dy: 0, frame: 282 }, { dx: 0, dy: 1, frame: 302 }, { dx: 1, dy: 1, frame: 303 }], // 2x2
  [{ dx: 0, dy: 0, frame: 284 }, { dx: 1, dy: 0, frame: 285 }, { dx: 2, dy: 0, frame: 286 }, { dx: 0, dy: 1, frame: 305 }, { dx: 1, dy: 1, frame: 306 }, { dx: 2, dy: 1, frame: 307 }], // 3x2
  [{ dx: 0, dy: 0, frame: 287 }, { dx: 1, dy: 0, frame: 288 }, { dx: 0, dy: 1, frame: 308 }, { dx: 1, dy: 1, frame: 309 }], // 2x2
  [{ dx: 0, dy: 0, frame: 289 }, { dx: 1, dy: 0, frame: 290 }, { dx: 0, dy: 1, frame: 310 }, { dx: 1, dy: 1, frame: 311 }], // 2x2
  [{ dx: 0, dy: 0, frame: 316 }, { dx: 0, dy: 1, frame: 337 }], // 1x2
  [{ dx: 0, dy: 0, frame: 317 }, { dx: 1, dy: 0, frame: 318 }, { dx: 0, dy: 1, frame: 338 }, { dx: 1, dy: 1, frame: 339 }], // 2x2
  [{ dx: 0, dy: 0, frame: 319 }, { dx: 1, dy: 0, frame: 320 }, { dx: 0, dy: 1, frame: 340 }, { dx: 1, dy: 1, frame: 341 }], // 2x2
  [{ dx: 0, dy: 0, frame: 321 }, { dx: 0, dy: 1, frame: 342 }], // 1x2
  [{ dx: 0, dy: 0, frame: 322 }, { dx: 1, dy: 0, frame: 323 }, { dx: 0, dy: 1, frame: 343 }, { dx: 1, dy: 1, frame: 344 }], // 2x2
  [{ dx: 0, dy: 0, frame: 324 }, { dx: 0, dy: 1, frame: 345 }], // 1x2
  [{ dx: 0, dy: 0, frame: 325 }, { dx: 1, dy: 0, frame: 326 }, { dx: 0, dy: 1, frame: 346 }, { dx: 1, dy: 1, frame: 347 }], // 2x2
  [{ dx: 0, dy: 0, frame: 327 }, { dx: 0, dy: 1, frame: 348 }], // 1x2
  [{ dx: 0, dy: 0, frame: 328 }], // 1x1
  [{ dx: 0, dy: 0, frame: 329 }], // 1x1
];
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
    const router = this.registry.get('router') as ScreenRouter;
    this.storage = this.registry.get('storage') as StorageAdapter;
    this.grid = new HexGrid(GRID_COLS, GRID_ROWS);
    this.sync = new SceneSync(this, HOP_MS);
    // Hex layout in current-scale pixels (s() — must run here, not at module load).
    this.layout = { width: s(32), height: s(24), rowPitch: s(18), originX: s(96), originY: s(38) };
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
    const wb = worldPixelBounds(this.layout, GRID_COLS, GRID_ROWS);
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

    this.cards = new CardController({
      scene: this,
      grid: this.grid,
      layout: this.layout,
      world: () => this.world,
      player: () => this.player,
      submit: (cmd) => this.submitPlayerCommand(cmd),
      canAct: () => !this.inputLocked && this.isPlayerPhase(),
      notify: (m) => this.flashRejected(m),
      // Targeting paint is clipped to what's on-screen: only hexes fully inside the visible frame, so an
      // AOE/range highlight near the frame edge doesn't bleed into the off-board margin (larger world).
      isHexVisible: (hex) => {
        const { x, y } = hexToPixel(this.layout, hex);
        return this.fullyInFrame(x, y);
      },
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
        const hex = pixelToHex(this.layout, p.worldX, p.worldY);
        if (this.cards.isArmed()) {
          this.cards.onWorldDown(hex); // click-mode first target / two-step second
        } else {
          this.move.onPress(hex, p); // begin the press-hold reachable-range move preview
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
      this.move.onMove(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.cards.onPointerUp(p);
      this.move.onRelease(p);
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
  }

  /** A brand-new run: a clock-seeded world with the player and its turn state. */
  private freshWorld(): World {
    const seed = Date.now() >>> 0;
    console.info('[world] new run seed:', seed);
    const world = createWorld(seed);
    this.player = world.createEntity();
    const start = offsetToAxial({ col: Math.floor(GRID_COLS / 2), row: Math.floor(GRID_ROWS / 2) });
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
    // Build the deck as card-instance entities, shuffle them into the draw pile, then draw the
    // opening hand (later turns draw via the card system on TurnStarted).
    const deck: DeckStateData = {
      drawPile: buildCardInstances(world, STARTER_COLLECTION),
      hand: [],
      discardPile: [],
    };
    world.store(DeckState).add(this.player, deck);
    reshuffle(deck, world.rng); // shuffle the draw pile (the discard pile is empty)
    drawUpTo(deck, HAND_SIZE, world.rng); // opening hand
    // Showcase: one of every enemy in the manifest (each enemy's idle key, art base = key minus the
    // '.idle' suffix), spread EVENLY across the whole enlarged world (Larger World feature) so the
    // bigger map is demonstrated by panning to find them — an aspect-aware lattice inset from the edges,
    // sized to the enemy count, rather than packing them into the top-left. The player's start hex is
    // skipped. Each enemy carries its art base (Enemy.art); installSystems renders <art>.idle. (Real
    // encounters will later spawn a curated subset rather than every enemy.)
    const enemyArt = Object.values(AssetKeys)
      .filter((key) => key.endsWith('.idle') && key !== AssetKeys.playerIdle)
      .map((key) => key.slice(0, -'.idle'.length));
    const latticeCols = Math.max(1, Math.ceil(Math.sqrt((enemyArt.length * GRID_COLS) / GRID_ROWS)));
    const latticeRows = Math.max(1, Math.ceil(enemyArt.length / latticeCols));
    const stepCol = GRID_COLS / (latticeCols + 1); // cells sit at 1..n of n+1 divisions (inset from edges)
    const stepRow = GRID_ROWS / (latticeRows + 1);
    const slots: { col: number; row: number }[] = [];
    for (let latRow = 1; latRow <= latticeRows && slots.length < enemyArt.length; latRow += 1) {
      for (let latCol = 1; latCol <= latticeCols && slots.length < enemyArt.length; latCol += 1) {
        let col = Math.round(latCol * stepCol);
        const row = Math.round(latRow * stepRow);
        if (hexEquals(offsetToAxial({ col, row }), start)) col += 1; // never stack on the player's start hex
        slots.push({ col, row });
      }
    }
    enemyArt.forEach((art, i) => {
      const slot = slots[i];
      if (slot === undefined) return; // defensive: the lattice always yields >= enemyArt.length slots
      const enemy = world.createEntity();
      world.store(Enemy).add(enemy, { isEnemy: true, art });
      world.store(HexPosition).add(enemy, { hex: offsetToAxial(slot) });
    });
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
    this.hud = this.add
      .text(s(8), s(8), '', { fontFamily: 'monospace', fontSize: `${s(14)}px`, color: '#cbd5e1' })
      .setDepth(1_000_000)
      .setScrollFactor(0);
    this.add
      .text(s(8), s(28), 'click: move  ·  Space: end turn  ·  R: restart turn  ·  Esc: pause', {
        fontFamily: 'monospace',
        fontSize: `${s(12)}px`,
        color: '#6b7280',
      })
      .setDepth(1_000_000)
      .setScrollFactor(0);
    this.toast = this.add
      .text(s(8), s(48), '', { fontFamily: 'monospace', fontSize: `${s(13)}px`, color: '#f0a0a0' })
      .setDepth(1_000_000)
      .setScrollFactor(0);
    this.refreshHud();
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
    const tilePx = s(TERRAIN_TILE);
    const key = AssetKeys.terrainGroundGrass;
    const leafKey = AssetKeys.terrainStairsGrass;
    // NEAREST so the 16px pixel-art tiles stay crisp scaled up.
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get(leafKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
    const wb = worldPixelBounds(this.layout, GRID_COLS, GRID_ROWS);
    const originCol = Math.floor(wb.minX / tilePx);
    // Extend the layer's TOP up by the mask's one-hex-height top-pad (layout.height) so real tiles fill it —
    // no empty sliver above the terrain when scrolled hard against the world's top edge.
    const topPadRows = Math.ceil(this.layout.height / tilePx);
    const originRow = Math.floor(wb.minY / tilePx) - topPadRows;
    this.terrainCols = Math.ceil(wb.maxX / tilePx) - originCol + 1;
    this.terrainRows = Math.ceil(wb.maxY / tilePx) - originRow + 1;
    const map = this.make.tilemap({ tileWidth: 16, tileHeight: 16, width: this.terrainCols, height: this.terrainRows });
    const tileset = map.addTilesetImage('terrain', key, 16, 16) as Phaser.Tilemaps.Tileset;
    // Second tileset on the SAME map for the grass-leaf decals (the stairs_grass foliage sheet). Its firstgid sits
    // just past the ground tileset's range, so leaf tile gids never collide with the fill/overlay (ground) gids.
    const leafFirstGid = tileset.firstgid + tileset.total;
    const leafTileset = map.addTilesetImage('stairs_grass', leafKey, 16, 16, 0, 0, leafFirstGid) as Phaser.Tilemaps.Tileset;
    this.terrainLayer = map
      .createBlankLayer('terrain', tileset as Phaser.Tilemaps.Tileset, originCol * tilePx, originRow * tilePx)!
      .setScale(tilePx / 16)
      .setDepth(TERRAIN_DEPTH);
    // Second layer (same map/tileset) for the grass-edge overlays, on top of the terrain fill.
    this.overlayLayer = map
      .createBlankLayer('overlay', tileset as Phaser.Tilemaps.Tileset, originCol * tilePx, originRow * tilePx)!
      .setScale(tilePx / 16)
      .setDepth(TERRAIN_OVERLAY_DEPTH);
    // Third layer for the grass-leaf decals, drawn from the stairs_grass tileset, on top of the grass-edge overlays.
    this.leafLayer = map
      .createBlankLayer('leaf', [tileset, leafTileset], originCol * tilePx, originRow * tilePx)!
      .setScale(tilePx / 16)
      .setDepth(LEAF_DEPTH);
    for (let ty = 0; ty < this.terrainRows; ty += 1) {
      for (let tx = 0; tx < this.terrainCols; tx += 1) {
        const { kind, variant } = terrainTile(originCol + tx, originRow + ty, TERRAIN_SEED, TERRAIN_VARIANT_COUNTS);
        this.terrainLayer.putTileAt(TERRAIN_FILL_FRAMES[kind][variant] as number, tx, ty);
        const overlay = terrainOverlay(originCol + tx, originRow + ty, TERRAIN_SEED);
        if (overlay !== null) this.overlayLayer.putTileAt(OVERLAY_FRAMES[overlay], tx, ty);
        const leafFrame = terrainLeaf(originCol + tx, originRow + ty, TERRAIN_SEED, LEAF_SHAPES);
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
      `[terrain] world layer: ${this.terrainCols} x ${this.terrainRows} = ${this.terrainCols * this.terrainRows} tiles (tile ${tilePx}px)`,
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
    g.lineStyle(s(1), gridLine, 0.18);
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let col = 0; col < GRID_COLS; col += 1) {
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
