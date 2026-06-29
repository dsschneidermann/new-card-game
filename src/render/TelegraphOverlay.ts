import Phaser from 'phaser';
import {
  PlannedAttack,
  Enemy,
  HexPosition,
  hexToPixel,
  hexKey,
  hexEquals,
  type World,
  type Hex,
  type HexLayout,
  type EntityId,
} from '@core/index';

// The telegraph FILL sits on the ground layer, below the character sprites (sprite depth = screen-Y > 0),
// just above the blue reachable-move fill (-1000) so the two read cleanly if they ever overlap.
const FILL_DEPTH = -900;
const FILL_COLOR = 0xff4d4d; // light red — the threatened tiles an enemy has locked onto
const FILL_ALPHA = 0.32;
// The hover threat LINE draws above the board + sprites so it reads as an overlay, but below the enemy
// inspect card (900_000) and the HUD (2_000_000).
const LINE_DEPTH = 850_000;
const LINE_COLOR = 0xff2222;
const LINE_ALPHA = 0.95;
const LINE_WIDTH = 3;
const TARGET_DOT_RADIUS = 5;

/**
 * Renders enemy attack TELEGRAPHS (Enemy AI: Movement & Telegraphed Attacks) — pure presentation read from
 * the core PlannedAttack component each frame, mirroring MovePlanner's world-space, mask-clipped overlay:
 *   - a light-red FILL on every tile any enemy has locked onto (so the player sees the danger zones), and
 *   - a red straight LINE from a hovered enemy to each of ITS locked target tiles (the threat it poses).
 * Both graphics are world-space (the camera scrolls them) and clipped to the visible window by the shared
 * effect mask, exactly like the reachable-range fill. It owns no game state and submits no commands.
 */
export class TelegraphOverlay {
  private readonly fill: Phaser.GameObjects.Graphics;
  private readonly line: Phaser.GameObjects.Graphics;
  private lastFillKey: string | null = null;
  private lastHoverKey: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: HexLayout,
    effectMask: Phaser.Display.Masks.GeometryMask,
  ) {
    this.fill = scene.add.graphics().setDepth(FILL_DEPTH).setMask(effectMask);
    this.line = scene.add.graphics().setDepth(LINE_DEPTH).setMask(effectMask);
  }

  /**
   * Repaint the light-red fill over every currently-telegraphed hex. Cheap to call each frame: a cache key of
   * the painted hexes skips the redraw while the set of telegraphs is unchanged, so combat HP ticking does not
   * churn this. Call after advance() so a freshly planned/cleared telegraph shows/clears immediately.
   */
  refresh(world: World): void {
    const hexes: Hex[] = [];
    for (const enemy of world.entitiesWith(Enemy, PlannedAttack)) {
      const plan = world.store(PlannedAttack).get(enemy);
      if (plan !== undefined) hexes.push(...plan.hexes);
    }
    const key = hexes.map((h) => hexKey(h)).sort().join(';');
    if (key === this.lastFillKey) return;
    this.lastFillKey = key;
    this.fill.clear();
    this.fill.fillStyle(FILL_COLOR, FILL_ALPHA);
    for (const hex of hexes) this.fillHex(hex);
  }

  /**
   * Draw the red threat line(s) from the enemy hovered at `hoveredHex` to each of its locked target hexes, or
   * clear the line when nothing telegraph-bearing is hovered. `hoveredHex` is the tile under the pointer
   * (null clears) — the same hex WorldScene uses for the inspect card.
   */
  refreshHover(world: World, hoveredHex: Hex | null): void {
    const enemy = hoveredHex !== null ? this.telegraphingEnemyAt(world, hoveredHex) : undefined;
    const plan = enemy !== undefined ? world.store(PlannedAttack).get(enemy) : undefined;
    const from = enemy !== undefined ? world.store(HexPosition).get(enemy)?.hex : undefined;

    // Cache so we only redraw when the hovered enemy or its telegraph changes.
    const key =
      enemy !== undefined && plan !== undefined && from !== undefined
        ? `${enemy}:${hexKey(from)}>${plan.hexes.map((h) => hexKey(h)).join(',')}`
        : null;
    if (key === this.lastHoverKey) return;
    this.lastHoverKey = key;

    this.line.clear();
    if (key === null || plan === undefined || from === undefined) return;
    const a = hexToPixel(this.layout, from);
    this.line.lineStyle(LINE_WIDTH, LINE_COLOR, LINE_ALPHA);
    this.line.fillStyle(LINE_COLOR, LINE_ALPHA);
    for (const target of plan.hexes) {
      const b = hexToPixel(this.layout, target);
      this.line.beginPath();
      this.line.moveTo(a.x, a.y);
      this.line.lineTo(b.x, b.y);
      this.line.strokePath();
      this.line.fillCircle(b.x, b.y, TARGET_DOT_RADIUS); // mark the struck tile
    }
  }

  /** The living enemy standing on `hex` that has a telegraph, if any. */
  private telegraphingEnemyAt(world: World, hex: Hex): EntityId | undefined {
    for (const enemy of world.entitiesWith(Enemy, PlannedAttack, HexPosition)) {
      const pos = world.store(HexPosition).get(enemy);
      if (pos !== undefined && hexEquals(pos.hex, hex)) return enemy;
    }
    return undefined;
  }

  /** Fill one pointy-top hex (matching the grid geometry), like MovePlanner.fillHex. */
  private fillHex(hex: Hex): void {
    const { x, y } = hexToPixel(this.layout, hex);
    const hw = this.layout.width / 2;
    const q1 = this.layout.height / 4;
    const q2 = this.layout.height / 2;
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

  /** Drop both graphics (scene reuse). */
  destroy(): void {
    this.fill.destroy();
    this.line.destroy();
  }
}
