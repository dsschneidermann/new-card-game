import Phaser from 'phaser';
import {
  advance,
  createWorld,
  defineComponent,
  AssetKeys,
  HexGrid,
  HexPosition,
  MovePath,
  makeMovementSystem,
  hexToPixel,
  pixelToHex,
  offsetToAxial,
  facingFromDelta,
  type Facing,
  type Hex,
  type HexLayout,
  type EntityId,
  type World,
} from '@core/index';
import { SceneSync, type RenderableView } from '@render/SceneSync';
import type { ScreenRouter } from '@scenes/ScreenRouter';

/** Pointy-top, perspective-foreshortened hexes in offset (odd-r) rows (ADR-006). */
const LAYOUT: HexLayout = { width: 32, height: 24, rowPitch: 18, originX: 24, originY: 28 };
const GRID_COLS = 28;
const GRID_ROWS = 28;
const STEP_MS = 110;

/** What an entity looks like; animBase (e.g. 'player') drives state+facing anims. */
interface RenderableData {
  texture: string;
  frame?: number;
  animBase?: string;
}
const Renderable = defineComponent<RenderableData>('Renderable');

/**
 * Gameplay scene (the InLevel state): a hex world grid (feature 05) over the
 * ECS, with an animated player (feature 14). Click a hex to walk there — a BFS
 * path is planned and the player hops hex-to-hex, playing its walk animation
 * facing the direction of travel and idling when stopped. Esc opens Pause.
 */
export class WorldScene extends Phaser.Scene {
  private world!: World;
  private grid!: HexGrid;
  private sync!: SceneSync;
  private player!: EntityId;
  private stepAccum = 0;
  private readonly facings = new Map<EntityId, Facing>();
  private readonly lastHex = new Map<EntityId, Hex>();

  constructor() {
    super('WorldScene');
  }

  create(): void {
    const router = this.registry.get('router') as ScreenRouter;
    const seed = Date.now() >>> 0;
    console.info('[world] run seed:', seed);
    this.world = createWorld(seed);
    this.grid = new HexGrid(GRID_COLS, GRID_ROWS);
    this.sync = new SceneSync(this, STEP_MS);
    this.world.addSystem(makeMovementSystem(this.grid));

    this.drawGrid();

    this.player = this.world.createEntity();
    const start = offsetToAxial({ col: Math.floor(GRID_COLS / 2), row: Math.floor(GRID_ROWS / 2) });
    this.world.store(HexPosition).add(this.player, { hex: start });
    this.world.store(Renderable).add(this.player, { texture: AssetKeys.playerIdle, animBase: 'player' });
    this.facings.set(this.player, 'right');

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const hex = pixelToHex(LAYOUT, p.worldX, p.worldY);
      if (this.grid.isWalkable(hex)) {
        this.world.submit({ kind: 'MoveTo', entity: this.player, q: hex.q, r: hex.r });
      }
    });

    this.input.keyboard?.on('keydown-ESC', () => router.dispatch('Pause'));
    this.add
      .text(8, 8, 'click a hex: move   ·   Esc: pause', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#6b7280',
      })
      .setDepth(1_000_000);
  }

  update(_time: number, delta: number): void {
    // Advance the simulation one hex-step per STEP_MS so the player visibly
    // hops hex-to-hex; between steps we still sync so tweens/anims play out.
    this.stepAccum += delta;
    while (this.stepAccum >= STEP_MS) {
      advance(this.world);
      this.stepAccum -= STEP_MS;
    }
    this.updateFacings();
    this.sync.sync(this.renderables());
  }

  /** Update each entity's facing from its latest hop (horizontal-dominant rule). */
  private updateFacings(): void {
    for (const [id, pos] of this.world.store(HexPosition).entries()) {
      const last = this.lastHex.get(id);
      if (last !== undefined && (last.q !== pos.hex.q || last.r !== pos.hex.r)) {
        const a = hexToPixel(LAYOUT, last);
        const b = hexToPixel(LAYOUT, pos.hex);
        this.facings.set(id, facingFromDelta(this.facings.get(id) ?? 'right', b.x - a.x, b.y - a.y));
      }
      this.lastHex.set(id, pos.hex);
    }
  }

  private *renderables(): Generator<RenderableView> {
    const positions = this.world.store(HexPosition);
    const paths = this.world.store(MovePath);
    for (const [id, r] of this.world.store(Renderable).entries()) {
      const pos = positions.get(id);
      if (pos === undefined) continue;
      const { x, y } = hexToPixel(LAYOUT, pos.hex);
      if (r.animBase !== undefined) {
        const facing = this.facings.get(id) ?? 'right';
        const state = paths.has(id) ? 'walk' : 'idle';
        yield { id, x, y, texture: r.texture, anim: `${r.animBase}.${state}.${facing}` };
      } else {
        yield { id, x, y, texture: r.texture, ...(r.frame !== undefined ? { frame: r.frame } : {}) };
      }
    }
  }

  private drawGrid(): void {
    const g = this.add.graphics().setDepth(-1_000_000);
    g.lineStyle(1, 0x2a2f3a, 0.8);
    const hw = LAYOUT.width / 2;
    const q1 = LAYOUT.height / 4;
    const q2 = LAYOUT.height / 2;
    for (const hex of this.grid.cells()) {
      const { x, y } = hexToPixel(LAYOUT, hex);
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
