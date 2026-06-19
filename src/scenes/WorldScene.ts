import Phaser from 'phaser';
import { advance, createWorld, defineComponent, AssetKeys, type EntityId, type World } from '@core/index';
import { SceneSync, type RenderableView } from '@render/SceneSync';
import type { ScreenRouter } from '@scenes/ScreenRouter';

interface Position {
  x: number;
  y: number;
}
interface Renderable {
  texture: string;
  frame?: number;
}
const Position = defineComponent<Position>('Position');
const Renderable = defineComponent<Renderable>('Renderable');

/**
 * Gameplay scene (the InLevel state). The minimal ECS harness from feature 02,
 * plus a Pause hook routed through the screen-flow controller (Esc opens Pause).
 * Sprites come from the asset manifest (feature 03) via SceneSync; the run's RNG
 * seed is derived from the clock so each run differs (feature 12 will persist it
 * for resume/replay).
 */
export class WorldScene extends Phaser.Scene {
  private world!: World;
  private sync!: SceneSync;
  private player!: EntityId;

  constructor() {
    super('WorldScene');
  }

  create(): void {
    const router = this.registry.get('router') as ScreenRouter;
    const seed = Date.now() >>> 0;
    console.info('[world] run seed:', seed);
    this.world = createWorld(seed);
    this.sync = new SceneSync(this);

    this.world.addSystem((world) => {
      for (const cmd of world.commands()) {
        if (cmd.kind === 'MoveTo') {
          const pos = world.store(Position).get(cmd.entity);
          if (pos !== undefined) {
            pos.x = cmd.x;
            pos.y = cmd.y;
          }
        }
      }
    });

    this.player = this.world.createEntity();
    this.world.store(Position).add(this.player, {
      x: this.scale.width / 2,
      y: this.scale.height / 2,
    });
    // Player token uses the manifest's player.idle placeholder (frame 0) via the
    // feature-03 pipeline — no scene-local texture generation.
    this.world.store(Renderable).add(this.player, { texture: AssetKeys.playerIdle, frame: 0 });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.world.submit({ kind: 'MoveTo', entity: this.player, x: p.worldX, y: p.worldY });
    });

    this.input.keyboard?.on('keydown-ESC', () => router.dispatch('Pause'));
    this.add.text(8, 8, 'click: move   ·   Esc: pause', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#6b7280',
    });
  }

  update(): void {
    const events = advance(this.world);
    void events; // forwarded to event-driven effects by later features
    this.sync.sync(this.renderables());
  }

  private *renderables(): Generator<RenderableView> {
    const positions = this.world.store(Position);
    for (const [id, renderable] of this.world.store(Renderable).entries()) {
      const pos = positions.get(id);
      if (pos !== undefined) {
        yield {
          id,
          x: pos.x,
          y: pos.y,
          texture: renderable.texture,
          ...(renderable.frame !== undefined ? { frame: renderable.frame } : {}),
        };
      }
    }
  }
}
