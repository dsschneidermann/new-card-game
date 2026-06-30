import Phaser from 'phaser';
import {
  PlannedAttack,
  Enemy,
  Player,
  HexPosition,
  Attack,
  CombatStats,
  computeDamage,
  hexToPixel,
  hexKey,
  hexEquals,
  s,
  type World,
  type Hex,
  type HexLayout,
  type EntityId,
} from '@core/index';

// The telegraph FILL sits on the ground layer, below the character sprites (sprite depth = screen-Y > 0),
// just above the blue reachable-move fill (-1000) so the two read cleanly if they ever overlap.
const FILL_DEPTH = -900;
const FILL_COLOR = 0xff4d4d; // light red — the threatened tiles an enemy has locked onto
const FILL_ALPHA = 0.32;
// The hovered enemy's attack damage, drawn ON each threatened tile in the MovePlanner move-point style
// (monospace), clipped to the visible window. Depth sits above the sprite band but BELOW the enemy inspect
// card (ENEMY_CARD_DEPTH = 900_000 in WorldScene) and the HUD, so the card is never occluded by the number.
const DMG_DEPTH = 800_000;
const DMG_FONT_PX = 32;
const DMG_COLOR = '#e5e7eb'; // white — the threat damage

/**
 * Renders enemy attack TELEGRAPHS (Enemy AI: Movement & Telegraphed Attacks) — pure presentation read from
 * the core PlannedAttack component, mirroring MovePlanner's world-space, mask-clipped overlay:
 *   - a light-red FILL on every tile any enemy has locked onto (so the player sees the danger zones), and
 *   - when a telegraphing enemy is hovered, that enemy's attack DAMAGE drawn on each of its target tiles
 *     (styled like MovePlanner's move-point numbers).
 * Both are world-space (the camera scrolls them) and clipped to the visible window by the shared effect
 * mask, like the reachable-range fill. It owns no game state and submits no commands.
 */
export class TelegraphOverlay {
  private readonly fill: Phaser.GameObjects.Graphics;
  private dmgLabels: Phaser.GameObjects.Text[] = [];
  private lastFillKey: string | null = null;
  private lastHoverKey: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: HexLayout,
    private readonly effectMask: Phaser.Display.Masks.GeometryMask,
  ) {
    this.fill = scene.add.graphics().setDepth(FILL_DEPTH).setMask(effectMask);
  }

  /**
   * Repaint the light-red fill over every currently-telegraphed hex. Cheap to call each frame: a cache key of
   * the painted hexes skips the redraw while the set of telegraphs is unchanged, so combat HP ticking does not
   * churn this. Call after advance() so a freshly planned/cleared telegraph shows/clears immediately.
   */
  refresh(world: World): void {
    const hexes: Hex[] = [];
    for (const enemy of world.entitiesWith(Enemy, PlannedAttack)) {
      const plan = world.store(PlannedAttack).get(enemy);
      if (plan !== undefined) hexes.push(...plan.hexes);
    }
    const key = hexes.map((h) => hexKey(h)).sort().join(';');
    if (key === this.lastFillKey) return;
    this.lastFillKey = key;
    this.fill.clear();
    this.fill.fillStyle(FILL_COLOR, FILL_ALPHA);
    for (const hex of hexes) this.fillHex(hex);
  }

  /**
   * When the enemy hovered at `hoveredHex` has a telegraph, draw its attack damage on each of its target
   * hexes; otherwise clear the labels. `hoveredHex` is the tile under the pointer (null clears) — the same
   * hex WorldScene uses for the inspect card. Damage shown is the actual hit the PLAYER would take — the
   * attack's base damage with the player's ARMOUR subtracted (floored at 1, via the shared computeDamage),
   * NOT the raw base damage. Shield is shown separately (the HUD's +N), so it is not subtracted here.
   */
  refreshHover(world: World, hoveredHex: Hex | null): void {
    const enemy = hoveredHex !== null ? this.telegraphingEnemyAt(world, hoveredHex) : undefined;
    const plan = enemy !== undefined ? world.store(PlannedAttack).get(enemy) : undefined;
    const profile =
      enemy !== undefined && plan !== undefined
        ? world.store(Attack).get(enemy)?.profiles[plan.attackIndex]
        : undefined;
    // Post-armour damage to the player (shield excluded — the +N HUD shows that). computeDamage with a 0
    // shield yields hpLost == the after-armour amount, the canonical floor-at-1 reduction the resolver uses.
    const damage =
      profile !== undefined ? computeDamage(profile, this.playerArmor(world), 0).hpLost : undefined;

    // Cache so we only rebuild the labels when the hovered enemy, its target hexes, or its damage change.
    const key =
      plan !== undefined && damage !== undefined
        ? `${enemy}:${damage}>${plan.hexes.map((h) => hexKey(h)).join(',')}`
        : null;
    if (key === this.lastHoverKey) return;
    this.lastHoverKey = key;

    this.clearLabels();
    if (key === null || plan === undefined || damage === undefined) return;
    for (const target of plan.hexes) {
      const { x, y } = hexToPixel(this.layout, target);
      this.dmgLabels.push(
        this.scene.add
          .text(x, y, String(damage), { fontFamily: 'monospace', fontSize: `${s(DMG_FONT_PX)}px`, color: DMG_COLOR })
          .setOrigin(0.5)
          .setDepth(DMG_DEPTH)
          .setMask(this.effectMask),
      );
    }
  }

  /** The player's total armour (CombatStats.armor), or 0 if absent — the flat reduction a telegraph subtracts. */
  private playerArmor(world: World): number {
    const player = world.entitiesWith(Player)[0];
    return player !== undefined ? (world.store(CombatStats).get(player)?.armor ?? 0) : 0;
  }

  /** The living enemy standing on `hex` that has a telegraph, if any. */
  private telegraphingEnemyAt(world: World, hex: Hex): EntityId | undefined {
    for (const enemy of world.entitiesWith(Enemy, PlannedAttack, HexPosition)) {
      const pos = world.store(HexPosition).get(enemy);
      if (pos !== undefined && hexEquals(pos.hex, hex)) return enemy;
    }
    return undefined;
  }

  /** Fill one pointy-top hex (matching the grid geometry), like MovePlanner.fillHex. */
  private fillHex(hex: Hex): void {
    const { x, y } = hexToPixel(this.layout, hex);
    const hw = this.layout.width / 2;
    const q1 = this.layout.height / 4;
    const q2 = this.layout.height / 2;
    this.fill.beginPath();
    this.fill.moveTo(x, y - q2);
    this.fill.lineTo(x + hw, y - q1);
    this.fill.lineTo(x + hw, y + q1);
    this.fill.lineTo(x, y + q2);
    this.fill.lineTo(x - hw, y + q1);
    this.fill.lineTo(x - hw, y - q1);
    this.fill.closePath();
    this.fill.fillPath();
  }

  private clearLabels(): void {
    for (const t of this.dmgLabels) t.destroy();
    this.dmgLabels = [];
  }

  /** Drop the fill graphics + any damage labels (scene reuse). */
  destroy(): void {
    this.fill.destroy();
    this.clearLabels();
  }
}
