import Phaser from 'phaser';
import {
  advance,
  createWorld,
  AssetKeys,
  HexGrid,
  HexPosition,
  makeMovementSystem,
  hexToPixel,
  pixelToHex,
  offsetToAxial,
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

/**
 * Gameplay scene (the InLevel state): a hex world grid (feature 05) over the
 * ECS. Click a hex to walk there — a BFS path is planned and the player hops
 * hex-to-hex in rapid succession via the movement system. Esc opens Pause. The
 * run's RNG seed is clock-derived (feature 12 will persist it for replay).
 */
export class WorldScene extends Phaser.Scene {
  private world!: World;
  private grid!: HexGrid;
  private sync!: SceneSync;
  private player!: EntityId;
  private stepAccum = 0;

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
    // hops hex-to-hex; between steps we still sync so tweens play out.
    this.stepAccum += delta;
    while (this.stepAccum >= STEP_MS) {
      advance(this.world);
      this.stepAccum -= STEP_MS;
    }
    this.sync.sync(this.renderables());
  }

  private *renderables(): Generator<RenderableView> {
    // Only the player carries HexPosition for now; enemies join in later features.
    for (const [id, pos] of this.world.store(HexPosition).entries()) {
      const { x, y } = hexToPixel(LAYOUT, pos.hex);
      yield { id, x, y, texture: AssetKeys.playerIdle, frame: 0 };
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
