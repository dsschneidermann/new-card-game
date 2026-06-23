import type { Hex } from './hex';

/**
 * Screen layout for a pointy-top, offset-row (odd-r) hex grid, perspective-
 * foreshortened: `width`/`height` are the hex's pixel bounding box and
 * `rowPitch` the vertical distance between row centres (3/4 of height so the
 * rows tessellate). `originX`/`originY` is the centre (stand-point) of hex (0,0).
 */
export interface HexLayout {
  readonly width: number;
  readonly height: number;
  readonly rowPitch: number;
  readonly originX: number;
  readonly originY: number;
}

/** Offset (col,row) of a hex within an odd-r grid. */
export interface Offset {
  readonly col: number;
  readonly row: number;
}

/** Axial -> odd-r offset. */
export function axialToOffset(h: Hex): Offset {
  return { col: h.q + (h.r - (h.r & 1)) / 2, row: h.r };
}

/** Odd-r offset -> axial. */
export function offsetToAxial(o: Offset): Hex {
  return { q: o.col - (o.row - (o.row & 1)) / 2, r: o.row };
}

/** Centre (stand-point) pixel of a hex. */
export function hexToPixel(l: HexLayout, h: Hex): { x: number; y: number } {
  const { col, row } = axialToOffset(h);
  return {
    x: l.originX + col * l.width + (row & 1) * (l.width / 2),
    y: l.originY + row * l.rowPitch,
  };
}

/** True if a point (relative to a hex centre) lies within the drawn hexagon. */
function pointInHexCell(l: HexLayout, dx: number, dy: number): boolean {
  const hw = l.width / 2;
  const q1 = l.height / 4;
  const q2 = l.height / 2;
  const verts: ReadonlyArray<readonly [number, number]> = [
    [0, -q2],
    [hw, -q1],
    [hw, q1],
    [0, q2],
    [-hw, q1],
    [-hw, -q1],
  ];
  let sign = 0;
  for (let i = 0; i < verts.length; i += 1) {
    const [ax, ay] = verts[i] as readonly [number, number];
    const [bx, by] = verts[(i + 1) % verts.length] as readonly [number, number];
    const cross = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    if (cross === 0) continue; // on an edge: treat as inside
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/**
 * The hex whose drawn cell contains the pixel. The foreshortened hexes
 * tessellate, so exactly one candidate around the rounded estimate contains an
 * interior point (an edge tie resolves to the first match, deterministically);
 * a point off the grid falls back to the nearest centre. This matches the drawn
 * outline exactly — unlike a nearest-centre lookup, which mis-assigns the
 * corners of a non-regular (perspective) hex.
 */
export function pixelToHex(l: HexLayout, x: number, y: number): Hex {
  const approxRow = Math.round((y - l.originY) / l.rowPitch);
  const approxCol = Math.round((x - l.originX - (approxRow & 1) * (l.width / 2)) / l.width);
  let nearest = offsetToAxial({ col: approxCol, row: approxRow });
  let nearestD = Infinity;
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const cand = offsetToAxial({ col: approxCol + dc, row: approxRow + dr });
      const p = hexToPixel(l, cand);
      if (pointInHexCell(l, x - p.x, y - p.y)) return cand;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < nearestD) {
        nearestD = d;
        nearest = cand;
      }
    }
  }
  return nearest;
}

/** The pixel bounding box of every cell in a grid (cell extremes, including the odd-row half-shift). */
export interface WorldPixelBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * The pixel extent of an entire `cols` x `rows` hex grid: from the left edge of column 0 to the right
 * edge of the last column (which, on odd rows, sits a further half-width right), and from the top of
 * row 0 to the bottom of the last row. The camera clamps its scroll to this box so the visible frame
 * never scrolls past the world. Pure (no Phaser).
 */
export function worldPixelBounds(layout: HexLayout, cols: number, rows: number): WorldPixelBounds {
  const hw = layout.width / 2;
  const hh = layout.height / 2;
  const oddRowShift = rows > 1 ? hw : 0; // odd rows (shifted +half-width) exist only with >= 2 rows
  return {
    minX: layout.originX - hw,
    minY: layout.originY - hh,
    maxX: layout.originX + (cols - 1) * layout.width + oddRowShift + hw,
    maxY: layout.originY + (rows - 1) * layout.rowPitch + hh,
  };
}
