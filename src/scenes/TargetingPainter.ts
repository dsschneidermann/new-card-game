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
const OUTLINE_EXTEND_PX = 0.5; // range-outline segments overshoot each end so convex corners close fully

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
  ) {
    this.highlight = scene.add.graphics().setDepth(HL_DEPTH);
    this.rangeOutline = scene.add.graphics().setDepth(HL_DEPTH);
  }

  /**
   * Repaint the target tint for the armed card: the resolveTargeting primary (red) / secondary
   * (yellow) hexes, each clipped to the board. selfAoe paints regardless of the pointer; every other
   * target needs an in-bounds hovered hex. isBlocked suppresses the tint on a forbidden hex (an
   * attack's own hex) — that rule is owned by CardController and passed in.
   */
  redrawHighlight(
    spec: TargetSpec,
    origin: Hex,
    hovered: Hex | null,
    firstPick: Hex | undefined,
    isBlocked: (hex: Hex) => boolean,
  ): void {
    this.highlight.clear();
    if (spec.kind !== 'selfAoe' && (hovered === null || !this.grid.inBounds(hovered))) return;
    const effectiveHovered = hovered ?? origin; // selfAoe ignores it; origin is a harmless default
    if (isBlocked(effectiveHovered)) return;
    const { primary, secondary } = resolveTargeting(spec, origin, effectiveHovered, firstPick);
    // Clip each highlighted hex to the board so a multi-hex target (e.g. an areaOfEffect disk near an
    // edge) never paints off-grid — the hovered centre being in-bounds is not enough.
    for (const h of secondary) if (this.grid.inBounds(h)) this.fillHex(h, TINT_SECONDARY);
    for (const h of primary) if (this.grid.inBounds(h)) this.fillHex(h, TINT_PRIMARY);
  }

  /**
   * Draw the yellow max-range boundary for the armed card (a no-op if its target has no maxRange):
   * the outer edges of the in-bounds hexes within range. An edge is stroked wherever its neighbour is
   * OUT of range — on or off the board — so the outline closes along the board edge when the range
   * lands exactly on it. In-range neighbours are skipped (in-bounds = internal edge; off-board = the
   * range bleeds past the rim, draw nothing). Every stroked edge belongs to an in-bounds hex. Pure hex distance.
   */
  drawRange(spec: TargetSpec, origin: Hex): void {
    this.rangeOutline.clear();
    const maxRange = targetMaxRange(spec);
    if (maxRange === undefined) return;
    this.rangeOutline.lineStyle(s(2), TINT_SECONDARY, 0.9);
    for (const hex of hexesWithinRange(origin, maxRange)) {
      if (!this.grid.inBounds(hex)) continue;
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
