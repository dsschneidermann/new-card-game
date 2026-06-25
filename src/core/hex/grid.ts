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
  // Hexes that block line of sight (opaque obstacles). Independent of `blocked`: a low obstacle
  // blocks movement but not sight, and a future sight-only obstacle would block sight but not movement.
  private readonly sightBlocked = new Set<string>();

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

  /** Whether this hex blocks line of sight (an opaque obstacle stands on it). Independent of walkability. */
  blocksSight(h: Hex): boolean {
    return this.sightBlocked.has(hexKey(h));
  }

  setBlocksSight(h: Hex, blocks: boolean): void {
    if (blocks) this.sightBlocked.add(hexKey(h));
    else this.sightBlocked.delete(hexKey(h));
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
