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
  makeCardSystem,
  DeckState,
  Card,
  buildCardInstances,
  reshuffle,
  drawUpTo,
  STARTER_COLLECTION,
  isAttackCard,
  hexToPixel,
  pixelToHex,
  offsetToAxial,
  s,
  type HexLayout,
  type EntityId,
  type World,
  type StorageAdapter,
  type GameEvent,
  type Command,
  type DeckStateData,
} from '@core/index';
import { SceneSync } from '@render/SceneSync';
import {
  Renderable,
  AnimState,
  buildCharacterViews,
  PLAYER_ATTACK_ANIMS,
  type AnimStateData,
} from '@render/characterViews';
import type { ScreenRouter } from '@scenes/ScreenRouter';
import { CardController } from '@scenes/CardController';

/** Scene-start payload: Resume rebuilds from the save, otherwise a fresh run. */
interface WorldSceneData {
  resume?: boolean;
}

// Pointy-top, perspective-foreshortened hexes in offset (odd-r) rows (ADR-006).
// The LAYOUT pixel fields are base (iPad) values scaled via s() into this.layout at
// create time (s() must not run at module load).
const GRID_COLS = 26;
const GRID_ROWS = 21;
const STEP_MS = 110;

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
  private layout!: HexLayout;
  // Pending timer that clears the player's one-shot attack overlay back to idle/ready.
  private attackClearTimer: Phaser.Time.TimerEvent | undefined;

  constructor() {
    super('WorldScene');
  }

  create(data?: WorldSceneData): void {
    const router = this.registry.get('router') as ScreenRouter;
    this.storage = this.registry.get('storage') as StorageAdapter;
    this.grid = new HexGrid(GRID_COLS, GRID_ROWS);
    this.sync = new SceneSync(this, STEP_MS);
    // Hex layout in current-scale pixels (s() — must run here, not at module load).
    this.layout = { width: s(32), height: s(24), rowPitch: s(18), originX: s(96), originY: s(28) };

    this.world = data?.resume === true ? this.resumeOrFresh() : this.freshWorld();
    this.installSystems();

    this.drawGrid();
    this.buildHud();

    this.cards = new CardController({
      scene: this,
      grid: this.grid,
      layout: this.layout,
      world: () => this.world,
      player: () => this.player,
      submit: (cmd) => this.submitPlayerCommand(cmd),
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
        const hex = pixelToHex(this.layout, p.worldX, p.worldY);
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

    this.autosave(); // checkpoint at the start of round 1 (later turns checkpoint on TurnStarted)
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
    this.syncPlayerAnim(events);
    this.sync.sync(buildCharacterViews(this.world, this.layout));
    this.refreshHud();
    for (const e of events) {
      if (e.kind === 'ActionRejected') this.flashRejected(e.reason);
      // A played card-instance left the hand for the discard pile: animate it out + reflow.
      else if (e.kind === 'CardDiscarded' && e.entity === this.player) this.cards.animateCardOut(e.instance);
      // A fresh hand was drawn (turn start, or an effect drew / changed a card): rebuild the fan.
      else if (e.kind === 'HandDrawn' && e.entity === this.player) this.cards.refreshHand();
      // A new player turn opened: drop any armed card and checkpoint the freshly-drawn turn-start state.
      else if (e.kind === 'TurnStarted' && e.phase === 'player') {
        this.cards.cancel();
        this.autosave();
      }
    }
  }

  /**
   * Submit a player command. For a card/spell play, optimistically enter the 'ready'
   * stance the same frame: the engine only processes the queued command on the next
   * stepped advance() (up to STEP_MS later), so without this the player briefly falls
   * back to 'idle' between disarming and the CardPlayed/SpellCast event — the
   * split-second idle flash after playing a skill card. That later event re-asserts
   * 'ready' (and adds the attack overlay for attack cards), so this is purely a head start.
   */
  private submitPlayerCommand(cmd: Command): void {
    this.world.submit(cmd);
    if (cmd.kind === 'PlayCard' || cmd.kind === 'PlaySpell') {
      const anim = this.world.store(AnimState).get(this.player);
      if (anim !== undefined) anim.base = 'ready';
    }
  }

  /**
   * Drive the player's transient AnimState (card-play feel). 'armed' mirrors the
   * CardController each frame; 'base' becomes 'ready' after playing any card or spell
   * and 'idle' at turn start or after a move. An attack card additionally plays a
   * random one-shot overlay that a scene timer clears back to the resting stance.
   * The variant pick uses Math.random (scene-side), never world.rng, so this purely
   * visual choice cannot perturb the gameplay stream (drawHand / determinism).
   */
  private syncPlayerAnim(events: GameEvent[]): void {
    const anim = this.world.store(AnimState).get(this.player);
    if (anim === undefined) return;
    anim.armed = this.cards.isArmed();
    for (const e of events) {
      switch (e.kind) {
        case 'CardPlayed':
          if (e.entity !== this.player) break;
          anim.base = 'ready';
          if (isAttackCard(e.cardId)) this.playAttack(anim);
          break;
        case 'SpellCast':
          if (e.entity === this.player) anim.base = 'ready';
          break;
        case 'EntityStepped':
          if (e.entity === this.player) anim.base = 'idle';
          break;
        case 'TurnStarted':
          if (e.phase === 'player') {
            anim.base = 'idle';
            anim.oneShot = null;
            this.attackClearTimer?.remove();
            this.attackClearTimer = undefined;
          }
          break;
      }
    }
  }

  /** Start a random attack overlay and schedule its clear after it plays once. */
  private playAttack(anim: AnimStateData): void {
    const variant: 'attack1' | 'attack2' = Math.random() < 0.5 ? 'attack1' : 'attack2';
    anim.oneShot = variant;
    this.attackClearTimer?.remove(); // a rapid second attack restarts the clear timer
    const spec = PLAYER_ATTACK_ANIMS[variant]; // per-variant timing: attack1 is dragged out
    const durationMs = (spec.frames / spec.fps) * 1000;
    this.attackClearTimer = this.time.delayedCall(durationMs, () => {
      const a = this.world.store(AnimState).get(this.player);
      if (a !== undefined && a.oneShot === variant) a.oneShot = null;
      this.attackClearTimer = undefined;
    });
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

  /** Register the turn, movement & card systems and re-attach the transient Renderable. */
  private installSystems(): void {
    // Order: turn -> movement -> card. The turn engine validates actions and emits CardPlayed /
    // TurnStarted; the movement system executes a same-step MoveTo; the card system (last) reacts
    // to those events to draw/discard cards and resolve effects.
    this.world.addSystem(makeTurnSystem(this.grid));
    this.world.addSystem(makeMovementSystem(this.grid, this.layout));
    this.world.addSystem(makeCardSystem(HAND_SIZE));
    this.world.store(Renderable).add(this.player, {
      texture: AssetKeys.playerIdle,
      animBase: 'player',
    });
    // Transient animation stance (card-play feel), rebuilt here so Resume/Restart Turn
    // start the player in a neutral idle. Driven each frame from input + this turn's events.
    this.world.store(AnimState).add(this.player, { base: 'idle', armed: false, oneShot: null });
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
    // Build the deck as card-instance entities, shuffle them into the draw pile, then draw the
    // opening hand (later turns draw via the card system on TurnStarted).
    const deck: DeckStateData = {
      drawPile: buildCardInstances(world, STARTER_COLLECTION),
      hand: [],
      discardPile: [],
    };
    world.store(DeckState).add(this.player, deck);
    reshuffle(deck, world.rng); // shuffle the draw pile (the discard pile is empty)
    drawUpTo(deck, HAND_SIZE, world.rng); // opening hand
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
        this.migrateDeckIfNeeded(world, player);
        console.info('[world] resumed from save');
        return world;
      }
    }
    console.info('[world] no usable save; starting a new run');
    return this.freshWorld();
  }

  /**
   * Tolerant load of pre-entity saves: older runs stored DeckState as { collection, hand } string
   * ids. Detect that shape and rebuild it into card-instance entities (the saved hand mapped to
   * instances, the rest seeded into the draw pile) so existing runs keep working after this feature.
   */
  private migrateDeckIfNeeded(world: World, player: EntityId): void {
    const deck = world.store(DeckState).get(player);
    if (deck === undefined) return;
    const legacy = deck as unknown as { drawPile?: unknown; collection?: unknown; hand?: unknown };
    if (Array.isArray(legacy.drawPile)) return; // already the entity-based shape
    const collection: string[] = Array.isArray(legacy.collection)
      ? (legacy.collection as string[])
      : [...STARTER_COLLECTION];
    const handIds: string[] = Array.isArray(legacy.hand) ? (legacy.hand as string[]) : [];
    const remaining = buildCardInstances(world, collection);
    const hand: EntityId[] = [];
    for (const id of handIds) {
      const idx = remaining.findIndex((e) => world.store(Card).get(e)?.defId === id);
      if (idx !== -1) hand.push(...remaining.splice(idx, 1));
    }
    world.store(DeckState).add(player, { drawPile: remaining, hand, discardPile: [] });
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
    this.migrateDeckIfNeeded(restored, player);
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

  private buildHud(): void {
    this.hud = this.add
      .text(s(8), s(8), '', { fontFamily: 'monospace', fontSize: `${s(14)}px`, color: '#cbd5e1' })
      .setDepth(1_000_000);
    this.add
      .text(s(8), s(28), 'click: move  ·  Space: end turn  ·  R: restart turn  ·  Esc: pause', {
        fontFamily: 'monospace',
        fontSize: `${s(12)}px`,
        color: '#6b7280',
      })
      .setDepth(1_000_000);
    this.toast = this.add
      .text(s(8), s(48), '', { fontFamily: 'monospace', fontSize: `${s(13)}px`, color: '#f0a0a0' })
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
    g.lineStyle(s(1), 0x2a2f3a, 0.8);
    const hw = this.layout.width / 2;
    const q1 = this.layout.height / 4;
    const q2 = this.layout.height / 2;
    for (const hex of this.grid.cells()) {
      const { x, y } = hexToPixel(this.layout, hex);
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
