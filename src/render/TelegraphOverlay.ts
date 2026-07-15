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
// The incoming-damage number(s), drawn ON a threatened tile in the MovePlanner move-point style (monospace),
// clipped to the visible window. Depth sits above the sprite band but BELOW the enemy inspect card
// (ENEMY_CARD_DEPTH in WorldScene) and the HUD, so the card is never occluded by the number.
const DMG_DEPTH = 800_000;
const DMG_FONT_PX = 32;
const DMG_COLOR = '#e5e7eb'; // white — the threat damage

/**
 * Renders enemy attack TELEGRAPHS (Enemy AI: Movement & Telegraphed Attacks) — pure presentation read from
 * the core PlannedAttack component, mirroring MovePlanner's world-space, mask-clipped overlay:
 *   - a light-red FILL on every tile any enemy has locked onto (so the player sees the danger zones), and
 *   - a DAMAGE number: by default the TOTAL incoming damage on the player's OWN hex (shown at all times);
 *     while a telegraphing enemy is hovered, that one enemy's damage on each of its target tiles instead.
 * Both are world-space (the camera scrolls them) and clipped to the visible window by the shared effect
 * mask, like the reachable-range fill. It owns no game state and submits no commands.
 */
export class TelegraphOverlay {
  private readonly fill: Phaser.GameObjects.Graphics;
  private dmgLabels: Phaser.GameObjects.Text[] = [];
  private lastFillKey: string | null = null;
  private lastDamageKey: string | null = null;

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
   * Draw the telegraph damage number(s), cleared only when a modal owns the screen (`active` false). Two modes:
   *   - DEFAULT (no telegraphing enemy under the pointer): a single TOTAL on the player's OWN hex — the sum,
   *     across every telegraph covering that hex, of the hit the player would take standing there. Nothing is
   *     drawn when no telegraph threatens the player's hex.
   *   - HOVER (a telegraphing enemy is under `hoveredHex`): that ONE enemy's damage on each of its target
   *     hexes instead, so the player can read a specific threat.
   * Damage is the actual hit the PLAYER would take — the attack's base damage with the player's ARMOUR
   * subtracted and floored at 1 (via the shared computeDamage), NOT the raw base damage. Shield is shown
   * separately (the HUD's +N), so it is not subtracted here. Cheap each frame: a cache key of the drawn
   * (hex, number) pairs skips the rebuild while nothing that affects them has changed.
   */
  refreshDamage(world: World, hoveredHex: Hex | null, active: boolean): void {
    const labels = active ? this.damageLabels(world, hoveredHex) : [];

    // Rebuild only when the drawn numbers or their hexes change — the player stepping onto/off a threatened
    // hex, a new/cleared telegraph, or a mid-turn armour change all flow through because they change the pairs.
    const key = labels.length > 0 ? labels.map((l) => `${hexKey(l.hex)}=${l.damage}`).join(';') : null;
    if (key === this.lastDamageKey) return;
    this.lastDamageKey = key;

    this.clearLabels();
    for (const { hex, damage } of labels) {
      const { x, y } = hexToPixel(this.layout, hex);
      this.dmgLabels.push(
        this.scene.add
          .text(x, y, String(damage), { fontFamily: 'monospace', fontSize: `${s(DMG_FONT_PX)}px`, color: DMG_COLOR })
          .setOrigin(0.5)
          .setDepth(DMG_DEPTH)
          .setMask(this.effectMask),
      );
    }
  }

  /**
   * The (hex, damage) pairs to draw this frame: a hovered telegraphing enemy's damage on each of its target
   * hexes, or — by default — the single player-hex total (empty when no telegraph threatens the player).
   */
  private damageLabels(world: World, hoveredHex: Hex | null): { hex: Hex; damage: number }[] {
    const armor = this.playerArmor(world);
    const hoveredEnemy = hoveredHex !== null ? this.telegraphingEnemyAt(world, hoveredHex) : undefined;

    // HOVER: the one hovered enemy's post-armour damage on each hex its telegraph covers.
    if (hoveredEnemy !== undefined) {
      const plan = world.store(PlannedAttack).get(hoveredEnemy);
      const profile =
        plan !== undefined ? world.store(Attack).get(hoveredEnemy)?.profiles[plan.attackIndex] : undefined;
      if (plan === undefined || profile === undefined) return [];
      const damage = computeDamage(profile, armor, 0).hpLost;
      return plan.hexes.map((hex) => ({ hex, damage }));
    }

    // DEFAULT: the TOTAL incoming damage on the player's own hex, summed across every telegraph covering it.
    const player = world.entitiesWith(Player)[0];
    const playerHex = player !== undefined ? world.store(HexPosition).get(player)?.hex : undefined;
    if (playerHex === undefined) return [];
    let total = 0;
    for (const enemy of world.entitiesWith(Enemy, PlannedAttack)) {
      const plan = world.store(PlannedAttack).get(enemy);
      if (plan === undefined || !plan.hexes.some((h) => hexEquals(h, playerHex))) continue;
      const profile = world.store(Attack).get(enemy)?.profiles[plan.attackIndex];
      if (profile === undefined) continue;
      total += computeDamage(profile, armor, 0).hpLost;
    }
    return total > 0 ? [{ hex: playerHex, damage: total }] : [];
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
