import Phaser from 'phaser';
import { advance, createWorld, defineComponent, type EntityId, type World } from '@core/index';
import { SceneSync, type RenderableView } from '@render/SceneSync';

interface Position {
  x: number;
  y: number;
}
interface Renderable {
  texture: string;
}
const Position = defineComponent<Position>('Position');
const Renderable = defineComponent<Renderable>('Renderable');

const PLAYER_TEXTURE = 'placeholder.square';

/**
 * Minimal harness proving the ECS <-> Phaser loop: input -> command ->
 * advance() -> (drained events + component state) -> SceneSync. Turn pacing
 * (when advance() is called) is the Turn Engine feature's responsibility; here
 * we advance each frame purely to demonstrate the wiring.
 */
export class WorldScene extends Phaser.Scene {
  private world!: World;
  private sync!: SceneSync;
  private player!: EntityId;

  constructor() {
    super('WorldScene');
  }

  create(): void {
    this.world = createWorld(0xc0ffee);
    this.sync = new SceneSync(this);
    this.ensureTexture(PLAYER_TEXTURE);

    // Movement system: apply MoveTo commands to the Position component.
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
    this.world.store(Renderable).add(this.player, { texture: PLAYER_TEXTURE });

    // Input -> command: click to move the player.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.world.submit({ kind: 'MoveTo', entity: this.player, x: p.worldX, y: p.worldY });
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
        yield { id, x: pos.x, y: pos.y, texture: renderable.texture };
      }
    }
  }

  private ensureTexture(key: string): void {
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(0x4fd1c5, 1).fillRect(0, 0, 24, 24);
    g.generateTexture(key, 24, 24);
    g.destroy();
  }
}
