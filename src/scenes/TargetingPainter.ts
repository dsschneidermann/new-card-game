import Phaser from 'phaser';
import {
  resolveTargeting,
  targetMaxRange,
  hexesWithinRange,
  hexToPixel,
  hexDistance,
  neighbors,
  s,
  type Hex,
  type HexGrid,
  type HexLayout,
  type TargetSpec,
} from '@core/index';

// Targeting paint (tint + range outline) sits on the GROUND: above the grid (drawn at -1_000_000)
// but below every character sprite (SceneSync depth = screen-Y, always > 0), so sprites draw over it
// and it reads as painted on the floor rather than covering the player.
const HL_DEPTH = -1_000;
const TINT_PRIMARY = 0xef4444; // red
const TINT_SECONDARY = 0xeab308; // yellow
const OUTLINE_EXTEND_PX = 1; // range-outline segments overshoot each end so convex corners close fully
const AIM_LINE_WIDTH = 4; // base px stroke width of the ranged aim line
const AIM_LINE_ALPHA = 0.9; // ranged aim line opacity (drawn over the path tint)

/** A pixel point — a hexagon vertex / edge endpoint. */
type Pt = { x: number; y: number };

/**
 * Paints the card-targeting feedback on the ground layer: the red/yellow hex TINT for the armed
 * card's resolved target, and the yellow max-RANGE boundary. Pure presentation over the core's
 * targeting math (resolveTargeting / targetMaxRange / hex range) — extracted from CardController so
 * the targeting visuals have a single home and CardController stays a coordinator. CardController
 * feeds it the armed targeting state; this owns the two Graphics layers and the hex geometry.
 */
export class TargetingPainter {
  private readonly highlight: Phaser.GameObjects.Graphics;
  private readonly rangeOutline: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly grid: HexGrid,
    private readonly layout: HexLayout,
    // KEPT as the cursor-over-board gate only (redrawHighlight early-return): clears the self/selfAoe tint,
    // which sits on the always-visible player, when the cursor leaves the board — the mask cannot do that.
    private readonly isVisible: (hex: Hex) => boolean,
    // The shared visible-window mask (WorldScene): clips every hex this painter draws to the on-screen frame,
    // so a range outline / tint near a world edge never bleeds into the off-board margin (larger world).
    private readonly mask: Phaser.Display.Masks.GeometryMask,
  ) {
    this.highlight = scene.add.graphics().setDepth(HL_DEPTH).setMask(mask);
    this.rangeOutline = scene.add.graphics().setDepth(HL_DEPTH).setMask(mask);
  }

  /**
   * Repaint the target tint for the armed card: the resolveTargeting primary (red) / secondary
   * (yellow) hexes, each clipped to the visible board window. The tint shows only while the pointer is
   * over a hex on the visible board (selfAoe included). isBlocked suppresses the tint on a forbidden hex (an
   * attack's own hex) — that rule is owned by CardController and passed in.
   *
   * For a lineOfSight (ranged single-target) card it ALSO draws a straight yellow aim line from the
   * caster's hex centre to the hovered hex centre, for any IN-RANGE hovered hex — including when the shot
   * is BLOCKED (resolveTargeting returns no path hexes), so the player still sees where they are aiming and
   * the absence of the yellow routed-path hexes is itself the "no clear line" cue. Beyond the card's max
   * range the line is suppressed (that hex can't be shot), matching the tint and the play.
   */
  redrawHighlight(
    spec: TargetSpec,
    origin: Hex,
    hovered: Hex | null,
    firstPick: Hex | undefined,
    isBlocked: (hex: Hex) => boolean,
  ): void {
    this.highlight.clear();
    // Tint only while the pointer is over a hex on the VISIBLE board — for EVERY target, selfAoe
    // included. Off the grid, or in the in-bounds-but-off-screen margin (the world is larger than the
    // view), there is no tint; otherwise self / selfAoe (whose hexes sit on the always-visible player)
    // would stay painted with the cursor off the board.
    if (hovered === null || !this.grid.inBounds(hovered) || !this.isVisible(hovered)) return;
    const effectiveHovered = hovered ?? origin; // selfAoe ignores it; origin is a harmless default
    if (isBlocked(effectiveHovered)) return;
    const { primary, secondary } = resolveTargeting(spec, origin, effectiveHovered, firstPick, (h) =>
      this.grid.blocksSight(h),
    );
    // Keep only in-bounds hexes (off-grid cells aren't real targets); the shared window mask clips a
    // multi-hex target (e.g. an areaOfEffect disk near the frame edge) so it never paints in the off-frame
    // margin. The hovered centre being on the visible board is gated by the early return above.
    for (const h of secondary) if (this.grid.inBounds(h)) this.fillHex(h, TINT_SECONDARY);
    for (const h of primary) if (this.grid.inBounds(h)) this.fillHex(h, TINT_PRIMARY);
    // The straight aim line, on TOP of the tint — but only toward an IN-RANGE hex (a potentially valid
    // target). It is independent of the resolved PATH, so it still shows for an in-range hex whose LoS is
    // BLOCKED (no routed path); the absence of the yellow path hexes is the "no clear line" cue. Beyond
    // maxRange it is suppressed: that hex can't be shot, so the line would misread as a valid aim — the
    // tint and the play already honour range, and the line now matches them. (No maxRange = no cap.)
    if (spec.kind === 'lineOfSight' && hovered !== null && this.isVisible(hovered)) {
      const maxRange = targetMaxRange(spec);
      if (maxRange === undefined || hexDistance(origin, hovered) <= maxRange) this.drawAimLine(origin, hovered);
    }
  }

  /** Straight yellow segment from the caster hex centre to the hovered hex centre (the ranged aim line). */
  private drawAimLine(from: Hex, to: Hex): void {
    const a = hexToPixel(this.layout, from);
    const b = hexToPixel(this.layout, to);
    this.highlight.lineStyle(s(AIM_LINE_WIDTH), TINT_SECONDARY, AIM_LINE_ALPHA);
    this.highlight.lineBetween(a.x, a.y, b.x, b.y);
  }

  /**
   * Draw the yellow max-range boundary for the armed card (a no-op if its target has no maxRange): the
   * outer edge of the range disk — every edge of an in-range hex whose neighbour is OUT of range. The
   * max-range outline highlights a DISTANCE, not real hexes, so it is NOT clipped to the grid: it draws the
   * full hexagonal ring even past the world edge, and the shared window mask clips it to the visible frame.
   * In-range neighbours are skipped (internal edges). Pure hex distance.
   */
  drawRange(spec: TargetSpec, origin: Hex): void {
    this.rangeOutline.clear();
    const maxRange = targetMaxRange(spec);
    if (maxRange === undefined) return;
    this.rangeOutline.lineStyle(s(4), TINT_SECONDARY, 0.9);
    for (const hex of hexesWithinRange(origin, maxRange)) {
      // No in-bounds check: the max-range outline highlights a DISTANCE, not real hexes, so it may extend
      // past the grid edge — the window mask clips it. (The target tints keep inBounds; they mark real hexes.)
      const verts = this.hexVertices(hex);
      for (const n of neighbors(hex)) {
        if (hexDistance(origin, n) <= maxRange) continue;
        this.strokeNearestEdge(verts, hexToPixel(this.layout, n));
      }
    }
  }

  /** Clear both the target tint and the range outline. */
  clear(): void {
    this.highlight.clear();
    this.rangeOutline.clear();
  }

  /** The 6 pointy-top hexagon vertices (px) for a hex: top, upper-right, lower-right, bottom, lower-left, upper-left. */
  private hexVertices(hex: Hex): [Pt, Pt, Pt, Pt, Pt, Pt] {
    const { x, y } = hexToPixel(this.layout, hex);
    const hw = this.layout.width / 2;
    const q1 = this.layout.height / 4;
    const q2 = this.layout.height / 2;
    return [
      { x, y: y - q2 },
      { x: x + hw, y: y - q1 },
      { x: x + hw, y: y + q1 },
      { x, y: y + q2 },
      { x: x - hw, y: y + q1 },
      { x: x - hw, y: y - q1 },
    ];
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
    // Overshoot both ends along the edge direction so neighbouring segments overlap at the shared
    // vertex and the convex corners close fully (no gaps between separate strokes).
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
}
