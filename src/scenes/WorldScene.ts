import Phaser from 'phaser';
import {
  advance,
  createWorld,
  applySave,
  loadRun,
  saveRun,
  AssetKeys,
  HexGrid,
  HexPosition,
  FacingState,
  Player,
  MovePath,
  TurnState,
  ResourcePool,
  MovementBudget,
  makeMovementSystem,
  makeTurnSystem,
  DeckState,
  drawHand,
  STARTER_COLLECTION,
  hexToPixel,
  pixelToHex,
  offsetToAxial,
  type HexLayout,
  type EntityId,
  type World,
  type StorageAdapter,
  type GameEvent,
  type TurnHooks,
} from '@core/index';
import { SceneSync } from '@render/SceneSync';
import { Renderable, buildCharacterViews } from '@render/characterViews';
import type { ScreenRouter } from '@scenes/ScreenRouter';
import { CardController } from '@scenes/CardController';

/** Scene-start payload: Resume rebuilds from the save, otherwise a fresh run. */
interface WorldSceneData {
  resume?: boolean;
}

/** Pointy-top, perspective-foreshortened hexes in offset (odd-r) rows (ADR-006). */
const LAYOUT: HexLayout = { width: 32, height: 24, rowPitch: 18, originX: 96, originY: 28 };
const GRID_COLS = 26;
const GRID_ROWS = 21;
const STEP_MS = 110;
const PLAYER_SCALE = 0.5; // 128px art on a 32px hex (tunable)

// Turn defaults (ADR-005); all tunable, persisted per-run once set.
const ENERGY_MAX = 3;
const MANA_MAX = 5;
const MANA_REGEN = 1;
const MOVE_BUDGET = 5;
const HAND_SIZE = 4;

/**
 * Gameplay scene (the InLevel state): wiring only. It owns a hex world grid
 * (feature 05) and the animated player (feature 14) over the ECS, and drives the
 * Turn Engine (feature 07): clicking a hex submits a RequestMove the turn engine
 * validates against the movement budget; Space ends the turn (refilling energy,
 * regenerating mana); R restarts the turn from the per-turn autosave. A HUD shows
 * the round, phase and resources. Esc opens Pause.
 */
export class WorldScene extends Phaser.Scene {
  private world!: World;
  private grid!: HexGrid;
  private sync!: SceneSync;
  private player!: EntityId;
  private storage!: StorageAdapter;
  private hud!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private stepAccum = 0;
  private cards!: CardController;

  // Turn-start is the autosave checkpoint (the deferral feature 06 left to 07):
  // draw a fresh hand, then checkpoint. Resume and Restart Turn both land at the
  // start of the current player turn.
  private readonly turnHooks: TurnHooks = {
    onPlayerTurnStart: () => {
      this.drawFreshHand();
      this.cards?.cancel();
      this.autosave();
    },
  };

  constructor() {
    super('WorldScene');
  }

  create(data?: WorldSceneData): void {
    const router = this.registry.get('router') as ScreenRouter;
    this.storage = this.registry.get('storage') as StorageAdapter;
    this.grid = new HexGrid(GRID_COLS, GRID_ROWS);
    this.sync = new SceneSync(this, STEP_MS);

    this.world = data?.resume === true ? this.resumeOrFresh() : this.freshWorld();
    this.installSystems();

    this.drawGrid();
    this.buildHud();

    this.cards = new CardController({
      scene: this,
      grid: this.grid,
      layout: LAYOUT,
      world: () => this.world,
      player: () => this.player,
      submit: (cmd) => this.world.submit(cmd),
      canAct: () => !this.inputLocked && this.isPlayerPhase(),
      notify: (m) => this.flashRejected(m),
    });
    this.cards.create();

    // A transparent, interactive world zone (below the HUD) takes grid clicks;
    // cards/spells/deck-icon at higher depth consume their own clicks.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0)
      .setOrigin(0)
      .setDepth(-500_000)
      .setInteractive()
      .on('pointerdown', (p: Phaser.Input.Pointer) => {
        const hex = pixelToHex(LAYOUT, p.worldX, p.worldY);
        if (this.cards.isArmed()) {
          this.cards.onWorldDown(hex); // click-mode first target / two-step second
        } else if (!this.inputLocked && this.grid.isWalkable(hex)) {
          // RequestMove (not raw MoveTo): the turn engine validates budget/phase.
          this.world.submit({ kind: 'RequestMove', entity: this.player, q: hex.q, r: hex.r });
        }
      });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.cards.onPointerMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.cards.onPointerUp(p));

    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.inputLocked) return;
      this.cards.cancel();
      this.world.submit({ kind: 'EndTurn', entity: this.player });
    });
    this.input.keyboard?.on('keydown-R', () => {
      if (this.inputLocked) return;
      this.restartTurn();
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.cards.isArmed()) this.cards.cancel();
      else router.dispatch('Pause');
    });

    this.autosave(); // checkpoint at the start of round 1 (later turns checkpoint via the hook)
  }

  update(_time: number, delta: number): void {
    // Advance one hex-step per STEP_MS so the player visibly hops hex-to-hex;
    // between steps we still sync so tweens/animations play out.
    this.stepAccum += delta;
    const events: GameEvent[] = [];
    while (this.stepAccum >= STEP_MS) {
      events.push(...advance(this.world));
      this.stepAccum -= STEP_MS;
    }
    this.sync.sync(buildCharacterViews(this.world, LAYOUT));
    this.refreshHud();
    for (const e of events) if (e.kind === 'ActionRejected') this.flashRejected(e.reason);
  }

  /**
   * Input is locked while a move is animating (the player still has a MovePath)
   * or a command is queued but not yet resolved — so the full move intent
   * completes before any new move / End Turn / Restart Turn is accepted. This is
   * an interim guard; the scheduled movement rework will replace it with explicit
   * movementStart/movementEnd events (and let traps/status interrupt a step).
   */
  private get inputLocked(): boolean {
    return this.world.store(MovePath).has(this.player) || this.world.commands().length > 0;
  }

  /** Register the turn + movement systems and re-attach the transient Renderable. */
  private installSystems(): void {
    // Turn engine runs BEFORE movement so a valid RequestMove's MoveTo executes the same step.
    this.world.addSystem(makeTurnSystem(this.grid, this.turnHooks));
    this.world.addSystem(makeMovementSystem(this.grid, LAYOUT));
    this.world.store(Renderable).add(this.player, {
      texture: AssetKeys.playerIdle,
      animBase: 'player',
      scale: PLAYER_SCALE,
    });
  }

  /** A brand-new run: a clock-seeded world with the player and its turn state. */
  private freshWorld(): World {
    const seed = Date.now() >>> 0;
    console.info('[world] new run seed:', seed);
    const world = createWorld(seed);
    this.player = world.createEntity();
    const start = offsetToAxial({ col: Math.floor(GRID_COLS / 2), row: Math.floor(GRID_ROWS / 2) });
    world.store(Player).add(this.player, { isPlayer: true });
    world.store(HexPosition).add(this.player, { hex: start });
    world.store(FacingState).add(this.player, { facing: 'right' });
    world.store(TurnState).add(this.player, { phase: 'player', round: 1, activeActor: this.player });
    world.store(ResourcePool).add(this.player, {
      energy: ENERGY_MAX,
      energyMax: ENERGY_MAX,
      mana: 0,
      manaMax: MANA_MAX,
      manaRegen: MANA_REGEN,
    });
    world.store(MovementBudget).add(this.player, { remaining: MOVE_BUDGET, max: MOVE_BUDGET });
    world.store(DeckState).add(this.player, {
      collection: [...STARTER_COLLECTION],
      hand: drawHand(STARTER_COLLECTION, HAND_SIZE, world.rng),
    });
    return world;
  }

  /** Rebuild the world from the save; fall back to a fresh run if none is usable. */
  private resumeOrFresh(): World {
    const loaded = loadRun(this.storage);
    if (loaded.ok) {
      const world = applySave(loaded.state);
      const player = world.entitiesWith(Player)[0];
      if (player !== undefined) {
        this.player = player;
        console.info('[world] resumed from save');
        return world;
      }
    }
    console.info('[world] no usable save; starting a new run');
    return this.freshWorld();
  }

  /**
   * Restart Turn: reload the per-turn autosave (start of the current turn), but
   * KEEP the live RNG so the stream continues (the brief's rule — no save-scum).
   * Reuses the same restore path as Resume / Restart Level.
   */
  private restartTurn(): void {
    const loaded = loadRun(this.storage);
    if (!loaded.ok) return;
    const liveRng = this.world.rng.state();
    const restored = applySave(loaded.state);
    const player = restored.entitiesWith(Player)[0];
    if (player === undefined) return;
    restored.rng.setState(liveRng);
    this.world = restored;
    this.player = player;
    this.installSystems();
    this.cards.cancel();
    this.cards.refreshHand();
  }

  private autosave(): void {
    saveRun(this.storage, this.world);
  }

  private isPlayerPhase(): boolean {
    return this.world.store(TurnState).get(this.player)?.phase === 'player';
  }

  /** Replace the hand with a freshly drawn one (called at each player-turn start). */
  private drawFreshHand(): void {
    const deck = this.world.store(DeckState).get(this.player);
    if (deck !== undefined) deck.hand = drawHand(deck.collection, HAND_SIZE, this.world.rng);
    this.cards?.refreshHand();
  }

  private buildHud(): void {
    this.hud = this.add
      .text(8, 8, '', { fontFamily: 'monospace', fontSize: '14px', color: '#cbd5e1' })
      .setDepth(1_000_000);
    this.add
      .text(8, 28, 'click: move  ·  Space: end turn  ·  R: restart turn  ·  Esc: pause', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#6b7280',
      })
      .setDepth(1_000_000);
    this.toast = this.add
      .text(8, 48, '', { fontFamily: 'monospace', fontSize: '13px', color: '#f0a0a0' })
      .setDepth(1_000_000);
    this.refreshHud();
  }

  private refreshHud(): void {
    const ts = this.world.store(TurnState).get(this.player);
    const pool = this.world.store(ResourcePool).get(this.player);
    const budget = this.world.store(MovementBudget).get(this.player);
    if (ts === undefined || pool === undefined || budget === undefined) return;
    const phase = ts.phase === 'player' ? 'Your turn' : 'Enemy turn';
    this.hud.setText(
      `Round ${ts.round}  ·  ${phase}    Energy ${pool.energy}/${pool.energyMax}    ` +
        `Mana ${pool.mana}/${pool.manaMax}    Move ${budget.remaining}/${budget.max}`,
    );
  }

  private flashRejected(reason: string): void {
    this.toast.setText(`✗ ${reason}`);
    this.time.delayedCall(1200, () => this.toast?.setText(''));
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
