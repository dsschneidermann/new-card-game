import { type Hex, hexKey, neighbors } from './hex';
import { axialToOffset, offsetToAxial } from './layout';

/**
 * A rectangular (cols x rows) odd-r hex grid with per-hex walkability. Bounds
 * are checked in offset space; every hex is walkable until set otherwise — the
 * walkability flag is the ADR-006 hook future obstacles and the procedural
 * generator populate.
 */
export class HexGrid {
  private readonly blocked = new Set<string>();

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {}

  inBounds(h: Hex): boolean {
    const { col, row } = axialToOffset(h);
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  isWalkable(h: Hex): boolean {
    return this.inBounds(h) && !this.blocked.has(hexKey(h));
  }

  setWalkable(h: Hex, walkable: boolean): void {
    if (walkable) this.blocked.delete(hexKey(h));
    else this.blocked.add(hexKey(h));
  }

  /** In-bounds, walkable neighbours in fixed direction order. */
  walkableNeighbors(h: Hex): Hex[] {
    return neighbors(h).filter((n) => this.isWalkable(n));
  }

  /** Every hex in the grid, row-major. */
  *cells(): Iterable<Hex> {
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        yield offsetToAxial({ col, row });
      }
    }
  }
}
