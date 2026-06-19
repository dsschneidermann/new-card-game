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

/** Nearest hex to a pixel (Voronoi-by-centre; exact for cell centres). */
export function pixelToHex(l: HexLayout, x: number, y: number): Hex {
  const approxRow = Math.round((y - l.originY) / l.rowPitch);
  const approxCol = Math.round((x - l.originX - (approxRow & 1) * (l.width / 2)) / l.width);
  let best = offsetToAxial({ col: approxCol, row: approxRow });
  let bestD = Infinity;
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const cand = offsetToAxial({ col: approxCol + dc, row: approxRow + dr });
      const p = hexToPixel(l, cand);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = cand;
      }
    }
  }
  return best;
}
