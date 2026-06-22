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
  Enemy,
  hexEquals,
  TurnState,
  ResourcePool,
  MovementBudget,
  makeMovementSystem,
  makeTurnSystem,
  makeCardSystem,
  DeckState,
  buildCardInstances,
  reshuffle,
  drawUpTo,
  STARTER_COLLECTION,
  isAttackCard,
  isHeavyAttack,
  facingToward,
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
  attackDurationMs,
  type AnimStateData,
} from '@render/characterViews';
import type { ScreenRouter } from '@scenes/ScreenRouter';
import { CardController } from '@scenes/CardController';
import { MovePlanner } from '@scenes/MovePlanner';
import { MoveAnimator } from '@render/MoveAnimator';

/** Scene-start payload: Resume rebuilds from the save, otherwise a fresh run. */
interface WorldSceneData {
  resume?: boolean;
}

// Pointy-top, perspective-foreshortened hexes in offset (odd-r) rows (ADR-006).
// The LAYOUT pixel fields are base (iPad) values scaled via s() into this.layout at
// create time (s() must not run at module load).
const GRID_COLS = 26;
const GRID_ROWS = 21;
const HOP_MS = 110; // per-hex hop duration: the SceneSync slide tween + the MoveAnimator replay cadence (must match)

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
  private cards!: CardController;
  private moveAnimator!: MoveAnimator;
  private move!: MovePlanner;
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
    this.sync = new SceneSync(this, HOP_MS);
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

    // Movement: the render-side replay of move hop-logs (sprite lags the sim) + the press-hold
    // reachable-range gesture (a press previews, a release on a reachable hex moves).
    this.moveAnimator = new MoveAnimator(HOP_MS);
    this.move = new MovePlanner({
      scene: this,
      grid: this.grid,
      layout: this.layout,
      world: () => this.world,
      player: () => this.player,
      submit: (cmd) => this.submitPlayerCommand(cmd),
      canStart: () => !this.inputLocked && this.isPlayerPhase() && !this.cards.isArmed(),
    });

    // A transparent, interactive world zone (below the HUD) takes grid clicks;
    // cards/spells/deck-icon at higher depth consume their own clicks.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0)
      .setOrigin(0)
      .setDepth(-500_000)
      .setInteractive()
      .on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) return; // right-click is handled globally (cancel), never a move/target
        const hex = pixelToHex(this.layout, p.worldX, p.worldY);
        if (this.cards.isArmed()) {
          this.cards.onWorldDown(hex); // click-mode first target / two-step second
        } else {
          this.move.onPress(hex, p); // begin the press-hold reachable-range move preview
        }
      });

    // Right-click cancels an armed card/spell and never opens the browser context menu.
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) {
        if (this.cards.isArmed()) this.cards.cancel();
        this.move.cancel(); // right-click also aborts an in-progress move preview
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.cards.onPointerMove(p);
      this.move.onMove(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.cards.onPointerUp(p);
      this.move.onRelease(p);
    });

    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.inputLocked) return;
      this.move.cancel();
      this.cards.cancel();
      this.world.submit({ kind: 'EndTurn', entity: this.player });
    });
    this.input.keyboard?.on('keydown-R', () => {
      if (this.inputLocked) return;
      this.move.cancel();
      this.restartTurn();
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.move.isPreviewing()) this.move.cancel(); // abort an in-progress move preview first
      else if (this.cards.isArmed()) this.cards.cancel();
      else router.dispatch('Pause');
    });

    this.autosave(); // checkpoint at the start of round 1 (later turns checkpoint on TurnStarted)
  }

  update(_time: number, delta: number): void {
    // Process queued commands once per frame; a whole move resolves in ONE advance (Movement
    // Resolution) and the MoveAnimator replays its hop-log over real time, so the sprite lags the sim.
    const events = advance(this.world);
    this.syncPlayerAnim(events);
    this.moveAnimator.ingest(events);
    this.moveAnimator.update(delta);
    this.sync.sync(buildCharacterViews(this.world, this.layout, this.moveAnimator.visualHexes()));
    this.refreshHud();
    for (const e of events) {
      if (e.kind === 'ActionRejected') this.flashRejected(e.reason);
      // A played card-instance left the hand for the discard pile: animate it out + reflow.
      else if (e.kind === 'CardDiscarded' && e.entity === this.player) this.cards.animateCardOut(e.instance);
      // The whole hand was replaced at turn start: discard every card, then deal the new hand in.
      else if (e.kind === 'HandDealt' && e.entity === this.player) this.cards.dealNewHand();
      // An effect drew a card or changed a cost mid-turn: refresh the fan incrementally.
      else if (e.kind === 'HandChanged' && e.entity === this.player) this.cards.refreshHand();
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
   * frame's advance() (one frame later), so without this the player briefly falls
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
    // An attack turns the player to face the hex it was aimed at (the target hex, or the clicked hex
    // for a self-AOE), mirroring how a move faces its destination — so the attack animation plays the
    // right way round. Non-attack cards omit faceToward and keep the current facing.
    if (cmd.kind === 'PlayCard' && cmd.faceToward !== undefined) {
      const pos = this.world.store(HexPosition).get(this.player);
      if (pos !== undefined) {
        const facings = this.world.store(FacingState);
        const prev = facings.get(this.player)?.facing ?? 'right';
        facings.add(this.player, { facing: facingToward(this.layout, prev, pos.hex, cmd.faceToward) });
      }
    }
  }

  /**
   * Drive the player's transient AnimState (card-play feel). 'armed' mirrors the
   * CardController each frame; 'base' becomes 'ready' after playing any card or spell
   * and 'idle' at turn start or after a move. An attack card additionally plays a
   * one-shot overlay (attack1 by default, attack2 for a heavyAttack card) that a scene
   * timer clears back to the resting stance — deterministic and presentation-only.
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
          if (isAttackCard(e.cardId)) this.playAttack(anim, isHeavyAttack(e.cardId) ? 'attack2' : 'attack1');
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

  /** Start the given attack overlay (attack1 default / attack2 for heavy attacks) and clear it after it plays once. */
  private playAttack(anim: AnimStateData, variant: 'attack1' | 'attack2'): void {
    anim.oneShot = variant;
    this.attackClearTimer?.remove(); // a rapid second attack restarts the clear timer
    const durationMs = attackDurationMs(variant); // per-variant timing from the registry (frames / fps)
    this.attackClearTimer = this.time.delayedCall(durationMs, () => {
      const a = this.world.store(AnimState).get(this.player);
      if (a !== undefined && a.oneShot === variant) a.oneShot = null;
      this.attackClearTimer = undefined;
    });
  }

  /**
   * Input is locked for the whole move bracket: while the MoveAnimator is replaying the player's
   * move (movementStart..settle) or a command is queued but not yet resolved — so the full move
   * intent completes before any new move / End Turn / Restart Turn is accepted. Esc/Pause stays live.
   */
  private get inputLocked(): boolean {
    return this.moveAnimator.isMoving(this.player) || this.world.commands().length > 0;
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
    // Enemies render through the same pipeline: a transient Renderable per enemy carrying its own
    // roster art base (Enemy.art), re-attached here on Resume/Restart Turn like the player's.
    for (const [enemy, { art }] of this.world.store(Enemy).entries()) {
      this.world.store(Renderable).add(enemy, { texture: `${art}.idle`, animBase: art });
    }
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
    // Showcase: one of every enemy in the manifest (each enemy's idle key, art base = key minus the
    // '.idle' suffix) on a spaced lattice (every 3 cols / 3 rows from row 5) — the spacing fills ~54
    // slots so all the enemies appear without sprite overlap; the player's hex is skipped. Each enemy
    // carries its art base (Enemy.art); installSystems renders <art>.idle. (Real encounters will later
    // spawn a curated subset rather than every enemy.)
    const enemyArt = Object.values(AssetKeys)
      .filter((key) => key.endsWith('.idle') && key !== AssetKeys.playerIdle)
      .map((key) => key.slice(0, -'.idle'.length));
    const slots: { col: number; row: number }[] = [];
    for (let row = 5; row < GRID_ROWS && slots.length < enemyArt.length; row += 3) {
      for (let col = 0; col < GRID_COLS && slots.length < enemyArt.length; col += 3) {
        if (!hexEquals(offsetToAxial({ col, row }), start)) slots.push({ col, row });
      }
    }
    enemyArt.forEach((art, i) => {
      const slot = slots[i];
      if (slot === undefined) return; // enemies beyond the ~54 lattice slots are skipped (by design)
      const enemy = world.createEntity();
      world.store(Enemy).add(enemy, { isEnemy: true, art });
      world.store(HexPosition).add(enemy, { hex: offsetToAxial(slot) });
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
    // Placeholder: hexes filled light grass green (ships with this feature) until real grass tiles
    // land. Was the outline-only grid (no fill; stroke 0x2a2f3a @0.8).
    const grassFill = 0x9ccc65; // light grass green
    const grassLine = 0x7cb342; // slightly darker green outline
    const hw = this.layout.width / 2;
    const q1 = this.layout.height / 4;
    const q2 = this.layout.height / 2;
    for (const hex of this.grid.cells()) {
      const { x, y } = hexToPixel(this.layout, hex);
      g.fillStyle(grassFill, 1);
      g.lineStyle(s(1), grassLine, 0.8);
      g.beginPath();
      g.moveTo(x, y - q2);
      g.lineTo(x + hw, y - q1);
      g.lineTo(x + hw, y + q1);
      g.lineTo(x, y + q2);
      g.lineTo(x - hw, y + q1);
      g.lineTo(x - hw, y - q1);
      g.closePath();
      g.fillPath();
      g.strokePath();
    }
  }
}
