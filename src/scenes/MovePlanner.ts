import Phaser from 'phaser';
import {
  hexesReachable,
  findPath,
  hexToPixel,
  pixelToHex,
  hexKey,
  HexPosition,
  MovementBudget,
  s,
  type World,
  type EntityId,
  type HexGrid,
  type HexLayout,
  type Hex,
  type Command,
} from '@core/index';

/** What WorldScene provides to the move planner (kept thin; no Phaser types leak into core). */
export interface MovePlannerContext {
  readonly scene: Phaser.Scene;
  readonly grid: HexGrid;
  readonly layout: HexLayout;
  world(): World;
  player(): EntityId;
  submit(cmd: Command): void;
  /** True when the player may start a move (player phase + not input-locked + nothing armed). */
  canStart(): boolean;
  /**
   * True when a hex is on the VISIBLE board — in grid bounds AND fully inside the on-screen frame. Used for
   * the ACTION gate only (onRelease cancels a move released off the visible board); the visual clipping of
   * the overlay rides the shared effectMask, not this predicate.
   */
  isHexVisible(hex: Hex): boolean;
  /** The shared visible-window mask (WorldScene): clips the reachable fill + route numbers to the board. */
  readonly effectMask: Phaser.Display.Masks.GeometryMask;
}

const FILL_DEPTH = -1_000; // ground layer, below the character sprites (whose depth = screen-Y > 0)
const NUM_DEPTH = 1_500_000; // path numbers above the sprite band (sprite depth = screen Y), below HUD (2_000_000)
const FILL_COLOR = 0x3b82f6; // blue reachable tint (distinct from the card-targeting red/yellow)
const FILL_ALPHA = 0.22;

/**
 * Press-hold-drag-release movement gesture + reachable overlay (touch-friendly). On press (when
 * nothing is armed and it's the player's free turn) it paints the hexes reachable within the movement
 * budget; while held, the route to the hovered reachable hex is drawn with numbered move-points
 * (1, 2, 3 ...); on release it submits a RequestMove if the release hex is a reachable hex on the visible
 * board, otherwise it cancels. The whole overlay clears on release, so it vanishes the instant the move starts.
 */
export class MovePlanner {
  private pressing = false;
  private reachable = new Map<string, Hex>();
  private lastRouteKey: string | null = null;
  private readonly fill: Phaser.GameObjects.Graphics;
  private numbers: Phaser.GameObjects.Text[] = [];

  constructor(private readonly ctx: MovePlannerContext) {
    this.fill = ctx.scene.add.graphics().setDepth(FILL_DEPTH).setMask(ctx.effectMask);
  }

  /** Begin a move preview from a board press (ignored unless the player may move and can reach a hex). */
  onPointerDown(hex: Hex, p: Phaser.Input.Pointer): void {
    if (this.pressing || p.rightButtonDown() || !this.ctx.canStart()) return;
    const from = this.playerHex();
    if (from === null) return;
    this.reachable = hexesReachable(this.ctx.grid, from, this.budget());
    if (this.reachable.size === 0) return; // no budget left / nowhere to go
    this.pressing = true;
    this.lastRouteKey = null;
    this.paintReachable();
    // The press is NOT blocked off-board — like the card-targeting highlight, only the PAINT is suppressed:
    // the overlay shows while the cursor is over the visible board and is hidden when it is off it. So a
    // press that begins off-board paints nothing until the cursor moves onto the board.
    this.redrawReachable(hex);
  }

  /** While held, redraw the numbered route to the hovered hex and show/hide the overlay by cursor position. */
  onPointerMove(p: Phaser.Input.Pointer): void {
    if (!this.pressing) return;
    this.redrawReachable(pixelToHex(this.ctx.layout, p.worldX, p.worldY));
  }

  /** Pointer released: move to the hex only if it's reachable AND on the visible board; otherwise cancel. */
  onPointerUp(p: Phaser.Input.Pointer): void {
    if (!this.pressing) return;
    const hex = pixelToHex(this.ctx.layout, p.worldX, p.worldY);
    // A release outside the visible board cancels — same as an armed card released off-board. With a large
    // movement budget a reachable hex can lie off-screen, so reachability alone is not enough to commit a move.
    const canMove = this.onVisibleBoard(hex) && this.reachable.has(hexKey(hex));
    this.clear();
    if (canMove) this.ctx.submit({ kind: 'RequestMove', entity: this.ctx.player(), q: hex.q, r: hex.r });
  }

  /** Abort an in-progress preview (e.g. a right-click or turn change while pressing); a no-op otherwise. */
  cancel(): void {
    if (this.pressing) this.clear();
  }

  /** True while a press-and-hold move preview is active (so Esc can abort it before opening Pause). */
  isPreviewing(): boolean {
    return this.pressing;
  }

  /**
   * Show the reachable overlay only while the cursor hex is on the VISIBLE board, mirroring the
   * targeting highlight redrawHighlight (which paints nothing while the cursor is off the visible grid). The fill
   * is painted once on press and merely toggled here — the gesture is never blocked, only the paint suppressed.
   */
  private redrawReachable(hex: Hex): void {
    const visible = this.onVisibleBoard(hex);
    this.fill.setVisible(visible);
    if (!visible) {
      this.clearNumbers();
      this.lastRouteKey = null; // force the route to redraw when the cursor returns to the board
      return;
    }
    this.updateRoute(hex);
  }

  /**
   * A hex is on the visible board when it is in grid bounds AND fully on-screen. The release commit gates on
   * this (a move released off the visible board cancels); the overlay's visual clipping is the window mask,
   * not this test. With the larger world, in-bounds is no longer the same as on-screen.
   */
  private onVisibleBoard(hex: Hex): boolean {
    return this.ctx.grid.inBounds(hex) && this.ctx.isHexVisible(hex);
  }

  private updateRoute(hex: Hex): void {
    const key = hexKey(hex);
    if (key === this.lastRouteKey) return; // same hex — nothing to redraw
    this.lastRouteKey = key;
    this.clearNumbers();
    if (!this.reachable.has(key)) return; // not a valid destination — show the reachable area only
    const from = this.playerHex();
    if (from === null) return;
    const path = findPath(this.ctx.grid, from, hex);
    for (let i = 1; i < path.length; i += 1) {
      const step = path[i] as Hex;
      const { x, y } = hexToPixel(this.ctx.layout, step);
      this.numbers.push(
        this.ctx.scene.add
          .text(x, y, String(i), { fontFamily: 'monospace', fontSize: `${s(32)}px`, color: '#e5e7eb' })
          .setOrigin(0.5)
          .setDepth(NUM_DEPTH)
          .setMask(this.ctx.effectMask), // clip route numbers to the visible window, like the fill
      );
    }
  }

  private paintReachable(): void {
    this.fill.clear();
    this.fill.fillStyle(FILL_COLOR, FILL_ALPHA);
    // The shared window mask clips the fill to the visible board, so paint every reachable hex — with the
    // camera clamped near a world edge the player can sit off-centre and reachable hexes run off-screen.
    for (const hex of this.reachable.values()) this.fillHex(hex);
  }

  /** Fill one pointy-top hex (matching the grid geometry) into the ground-layer overlay. */
  private fillHex(hex: Hex): void {
    const { x, y } = hexToPixel(this.ctx.layout, hex);
    const hw = this.ctx.layout.width / 2;
    const q1 = this.ctx.layout.height / 4;
    const q2 = this.ctx.layout.height / 2;
    this.fill.beginPath();
    this.fill.moveTo(x, y - q2);
    this.fill.lineTo(x + hw, y - q1);
    this.fill.lineTo(x + hw, y + q1);
    this.fill.lineTo(x, y + q2);
    this.fill.lineTo(x - hw, y + q1);
    this.fill.lineTo(x - hw, y - q1);
    this.fill.closePath();
    this.fill.fillPath();
  }

  private clear(): void {
    this.pressing = false;
    this.reachable = new Map();
    this.lastRouteKey = null;
    this.fill.clear();
    this.clearNumbers();
  }

  private clearNumbers(): void {
    for (const t of this.numbers) t.destroy();
    this.numbers = [];
  }

  private playerHex(): Hex | null {
    return this.ctx.world().store(HexPosition).get(this.ctx.player())?.hex ?? null;
  }

  private budget(): number {
    return this.ctx.world().store(MovementBudget).get(this.ctx.player())?.remaining ?? 0;
  }
}
