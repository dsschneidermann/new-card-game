import Phaser from 'phaser';
import { s, type World, type EntityId, type Hex } from '@core/index';
import { enemyHealthBarData, healthBarTicks, type EnemyHealthBarView } from './enemyHealthBar';
import type { RenderableView } from './characterViews';

// --- Tunable visuals (base px, s()-scaled at draw; colours 0xRRGGBB). Defaulted now, surfaced at review. ---
const BAR_WIDTH = 40; // fixed bar width (independent of maxHp — ticks subdivide it into 10-HP segments)
const BAR_HEIGHT = 6;
const FEET_OFFSET = 10; // base px BELOW the enemy's stand-point hex pixel, so the bar reads at the feet
const COLOR_REMAINING = 0x3fbf3f; // green: current HP
const COLOR_LOST = 0xcc3333; // red: lost HP (the full track behind the green)
const COLOR_SHIELD = 0x4aa3ff; // blue outline drawn only while the enemy holds shield
const COLOR_BORDER = 0x101014; // subtle dark outline when unshielded
const COLOR_TICK = 0x101014; // interior 10-HP indicator lines
const TICK_ALPHA = 0.55;
const BORDER_PX = 1;
const SHIELD_BORDER_PX = 1.5;

// Above every character sprite (SceneSync sets a sprite's depth to its screen-Y, up to a few thousand) so a
// tall bottom-anchored sprite never hides a bar, but below the HUD (1_000_000) and the enemy inspect card
// (2_001_000). Fixed, not per-enemy screen-Y sorted — a small feet-level bar does not need depth sorting.
const HEALTH_BAR_DEPTH = 900_000;

/**
 * Draws a small health bar at the feet of each on-screen enemy (Enemy Health Bars feature). A scene-side
 * overlay, NOT an ECS entity: each frame it reconciles one Phaser Graphics per visible enemy from the pure
 * enemyHealthBarData view — create + reposition to the enemy's world stand-point, redraw only when that
 * enemy's hp/maxHp/shield change, and destroy a bar when its enemy is no longer shown — mirroring SceneSync.
 * Purely presentation: reads existing combat components, never mutates the world or the save.
 */
export class EnemyHealthBars {
  private readonly bars = new Map<EntityId, Phaser.GameObjects.Graphics>();
  // Last-drawn hp/maxHp/shield per bar, so the (cheap) reposition runs every frame but the redraw only when
  // the values actually change.
  private readonly drawnKeys = new Map<EntityId, string>();

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Reconcile the bars to the current frame. `views` are the SAME on-frame-culled renderable views SceneSync
   * draws (player + enemies + items); enemyHealthBarData filters them down to the enemies that should show a
   * bar. `hoveredHex` is the board hex under the pointer (or null), so a full-HP enemy shows a bar only while
   * it is hovered.
   */
  update(world: World, views: Iterable<RenderableView>, hoveredHex: Hex | null): void {
    const shown = new Set<EntityId>();
    for (const view of views) {
      const data = enemyHealthBarData(world, view.id, hoveredHex);
      if (data === null) continue;
      shown.add(view.id);
      const bar = this.ensureBar(view.id);
      // Follow the sprite's stand-point in world coordinates, dropped to the feet. Position is refreshed every
      // frame (cheap) so the bar tracks a moving enemy; the drawing is rebuilt only when the values change.
      bar.setPosition(view.x, view.y + s(FEET_OFFSET));
      const key = `${data.hp}/${data.maxHp}|${data.shield}`;
      if (this.drawnKeys.get(view.id) !== key) {
        this.redraw(bar, data);
        this.drawnKeys.set(view.id, key);
      }
    }
    for (const [id, bar] of this.bars) {
      if (!shown.has(id)) {
        bar.destroy();
        this.bars.delete(id);
        this.drawnKeys.delete(id);
      }
    }
  }

  private ensureBar(id: EntityId): Phaser.GameObjects.Graphics {
    let bar = this.bars.get(id);
    if (bar === undefined) {
      bar = this.scene.add.graphics().setDepth(HEALTH_BAR_DEPTH);
      this.bars.set(id, bar);
    }
    return bar;
  }

  /**
   * Repaint the bar around its own origin (0,0): the red lost-HP track, the green remaining-HP fill from the
   * left, the interior 10-HP tick lines, and the outline (blue while the enemy holds shield, else a subtle
   * dark line). Called only when the enemy's hp/maxHp/shield change.
   */
  private redraw(bar: Phaser.GameObjects.Graphics, data: EnemyHealthBarView): void {
    const width = s(BAR_WIDTH);
    const height = s(BAR_HEIGHT);
    const left = -width / 2;
    const top = -height / 2;
    const fraction = data.maxHp > 0 ? Phaser.Math.Clamp(data.hp / data.maxHp, 0, 1) : 0;

    bar.clear();
    // Red track = the full (lost-HP) bar; the green remaining-HP portion overlays it from the left edge.
    bar.fillStyle(COLOR_LOST, 1).fillRect(left, top, width, height);
    if (fraction > 0) bar.fillStyle(COLOR_REMAINING, 1).fillRect(left, top, width * fraction, height);

    // Interior 10-HP indicator lines, each at value/maxHp along the fixed-width bar.
    bar.lineStyle(s(1), COLOR_TICK, TICK_ALPHA);
    for (const value of healthBarTicks(data.maxHp)) {
      const x = left + width * (value / data.maxHp);
      bar.lineBetween(x, top, x, top + height);
    }

    // Outline: thin blue while the enemy currently holds shield (the absorb-pool signal), else a subtle dark
    // border for legibility against the terrain.
    const shielded = data.shield > 0;
    bar.lineStyle(s(shielded ? SHIELD_BORDER_PX : BORDER_PX), shielded ? COLOR_SHIELD : COLOR_BORDER, 1);
    bar.strokeRect(left, top, width, height);
  }
}
