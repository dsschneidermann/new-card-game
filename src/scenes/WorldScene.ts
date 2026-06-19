import Phaser from 'phaser';
import {
  advance,
  createWorld,
  AssetKeys,
  HexGrid,
  HexPosition,
  FacingState,
  makeMovementSystem,
  hexToPixel,
  pixelToHex,
  offsetToAxial,
  type HexLayout,
  type EntityId,
  type World,
} from '@core/index';
import { SceneSync } from '@render/SceneSync';
import { Renderable, buildCharacterViews } from '@render/characterViews';
import type { ScreenRouter } from '@scenes/ScreenRouter';

/** Pointy-top, perspective-foreshortened hexes in offset (odd-r) rows (ADR-006). */
const LAYOUT: HexLayout = { width: 32, height: 24, rowPitch: 18, originX: 24, originY: 28 };
const GRID_COLS = 28;
const GRID_ROWS = 28;
const STEP_MS = 110;
const PLAYER_SCALE = 0.5; // 128px art on a 32px hex (tunable)

/**
 * Gameplay scene (the InLevel state): wiring only. It owns a hex world grid
 * (feature 05) over the ECS and the animated player (feature 14): click a hex
 * to walk there — the movement system plans a line-hugging path and sets facing
 * from the move's intent, and buildCharacterViews + SceneSync render/animate it.
 * Esc opens Pause.
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
    this.world.addSystem(makeMovementSystem(this.grid, LAYOUT));

    this.drawGrid();

    this.player = this.world.createEntity();
    const start = offsetToAxial({ col: Math.floor(GRID_COLS / 2), row: Math.floor(GRID_ROWS / 2) });
    this.world.store(HexPosition).add(this.player, { hex: start });
    this.world.store(FacingState).add(this.player, { facing: 'right' });
    this.world.store(Renderable).add(this.player, {
      texture: AssetKeys.playerIdle,
      animBase: 'player',
      scale: PLAYER_SCALE,
    });

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
    // Advance one hex-step per STEP_MS so the player visibly hops hex-to-hex;
    // between steps we still sync so tweens/animations play out.
    this.stepAccum += delta;
    while (this.stepAccum >= STEP_MS) {
      advance(this.world);
      this.stepAccum -= STEP_MS;
    }
    this.sync.sync(buildCharacterViews(this.world, LAYOUT));
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
