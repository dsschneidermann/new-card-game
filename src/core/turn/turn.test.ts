import { describe, it, expect } from 'vitest';
import {
  createWorld,
  advance,
  serializeWorld,
  restoreWorld,
  HexGrid,
  HexPosition,
  FacingState,
  makeMovementSystem,
  offsetToAxial,
  hexDistance,
  Player,
  Enemy,
  TurnState,
  ResourcePool,
  MovementBudget,
  DeckState,
  makeTurnSystem,
  type World,
  type GameEvent,
  type HexLayout,
  type EntityId,
  type TurnHooks,
} from '@core/index';

const LAYOUT: HexLayout = { width: 32, height: 24, rowPitch: 18, originX: 24, originY: 28 };

function setup(opts?: { hooks?: TurnHooks; seed?: number }): {
  world: World;
  grid: HexGrid;
  player: EntityId;
} {
  const grid = new HexGrid(12, 12);
  const world = createWorld(opts?.seed ?? 1);
  world.addSystem(makeTurnSystem(grid, opts?.hooks)); // before movement: RequestMove -> MoveTo same step
  world.addSystem(makeMovementSystem(grid, LAYOUT));
  const player = world.createEntity();
  world.store(Player).add(player, { isPlayer: true });
  world.store(HexPosition).add(player, { hex: offsetToAxial({ col: 5, row: 5 }) });
  world.store(FacingState).add(player, { facing: 'right' });
  world.store(TurnState).add(player, { phase: 'player', round: 1, activeActor: player });
  world.store(ResourcePool).add(player, { energy: 3, energyMax: 3, mana: 1, manaMax: 5, manaRegen: 1 });
  world.store(MovementBudget).add(player, { remaining: 4, max: 4 });
  return { world, grid, player };
}

const kinds = (evs: readonly GameEvent[]): string[] => evs.map((e) => e.kind);

describe('resource economy (ADR-005)', () => {
  it('energy refills to max each player turn and does NOT carry over', () => {
    const { world, player } = setup();
    const pool = world.store(ResourcePool).get(player) as { energy: number };
    advance(world, [{ kind: 'PlayCard', entity: player, cardId: 'c', energyCost: 2 }]);
    expect(pool.energy).toBe(1);
    advance(world, [{ kind: 'EndTurn', entity: player }]);
    expect(pool.energy).toBe(3); // refilled to max; the unspent 1 did not carry
  });

  it('mana regenerates capped at max each turn and DOES carry over', () => {
    const { world, player } = setup();
    const pool = world.store(ResourcePool).get(player) as { mana: number };
    advance(world, [{ kind: 'EndTurn', entity: player }]);
    expect(pool.mana).toBe(2); // 1 carried + 1 regen
    for (let i = 0; i < 4; i += 1) advance(world, [{ kind: 'EndTurn', entity: player }]);
    expect(pool.mana).toBe(5); // accumulated then capped at manaMax
  });
});

describe('action validation', () => {
  it('a within-budget move deducts tiles and submits a MoveTo; over-budget/unreachable is rejected', () => {
    const { world, player } = setup();
    const budget = world.store(MovementBudget).get(player) as { remaining: number };
    const from = (world.store(HexPosition).get(player) as { hex: { q: number; r: number } }).hex;

    const near = offsetToAxial({ col: 7, row: 5 });
    const d = hexDistance(from, near);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(4);
    const evs = advance(world, [{ kind: 'RequestMove', entity: player, q: near.q, r: near.r }]);
    expect(kinds(evs)).toContain('ResourceChanged');
    expect(kinds(evs)).toContain('EntityStepped'); // the submitted MoveTo executed the same step
    expect(budget.remaining).toBe(4 - d);
    for (let i = 0; i < 6; i += 1) advance(world);
    expect((world.store(HexPosition).get(player) as { hex: unknown }).hex).toEqual(near);

    const before = budget.remaining;
    const far = offsetToAxial({ col: 0, row: 0 });
    const evs2 = advance(world, [{ kind: 'RequestMove', entity: player, q: far.q, r: far.r }]);
    expect(kinds(evs2)).toContain('ActionRejected');
    expect(budget.remaining).toBe(before); // nothing deducted on rejection
  });

  it('an action costing more than available is rejected and leaves state unchanged', () => {
    const { world, player } = setup();
    const pool = world.store(ResourcePool).get(player) as { energy: number; mana: number };
    expect(kinds(advance(world, [{ kind: 'PlayCard', entity: player, cardId: 'b', energyCost: 99 }]))).toContain(
      'ActionRejected',
    );
    expect(pool.energy).toBe(3);
    expect(kinds(advance(world, [{ kind: 'PlaySpell', entity: player, spellId: 'b', manaCost: 99 }]))).toContain(
      'ActionRejected',
    );
    expect(pool.mana).toBe(1);
  });

  it('allows move, card and spell interleaved in any order within one turn', () => {
    const { world, player } = setup();
    const pool = world.store(ResourcePool).get(player) as { energy: number; mana: number };
    const budget = world.store(MovementBudget).get(player) as { remaining: number };
    const near = offsetToAxial({ col: 6, row: 5 });
    advance(world, [
      { kind: 'PlayCard', entity: player, cardId: 'a', energyCost: 1 },
      { kind: 'RequestMove', entity: player, q: near.q, r: near.r },
      { kind: 'PlaySpell', entity: player, spellId: 's', manaCost: 1 },
    ]);
    expect(pool.energy).toBe(2);
    expect(pool.mana).toBe(0);
    expect(budget.remaining).toBeLessThan(4);
  });

  it('rejects a player action attempted during the enemy phase', () => {
    const { world, player } = setup();
    (world.store(TurnState).get(player) as { phase: string }).phase = 'enemy';
    const evs = advance(world, [{ kind: 'PlayCard', entity: player, cardId: 'a', energyCost: 1 }]);
    expect(kinds(evs)).toContain('ActionRejected');
    expect((world.store(ResourcePool).get(player) as { energy: number }).energy).toBe(3);
  });
});

describe('card play removes from hand (simulation-owned)', () => {
  // Give the player a DeckState hand on top of the standard setup (energy 3).
  function withHand(hand: string[]): { world: World; player: EntityId } {
    const { world, player } = setup();
    world.store(DeckState).add(player, { collection: [...hand], hand: [...hand] });
    return { world, player };
  }

  it('removes exactly the played slot (a duplicate elsewhere is left intact) and spends energy', () => {
    const { world, player } = withHand(['melee', 'ranged', 'melee', 'jump']);
    const pool = world.store(ResourcePool).get(player) as { energy: number };
    const evs = advance(world, [
      { kind: 'PlayCard', entity: player, cardId: 'melee', energyCost: 1, handIndex: 0 },
    ]);
    expect(world.store(DeckState).get(player)?.hand).toEqual(['ranged', 'melee', 'jump']);
    expect(pool.energy).toBe(2);
    expect(evs.find((e) => e.kind === 'CardPlayed')).toMatchObject({
      kind: 'CardPlayed',
      entity: player,
      cardId: 'melee',
      handIndex: 0,
    });
    expect(kinds(evs)).toContain('ResourceChanged');
  });

  it('round-trips the shrunk hand through a save (removal lives in the persisted DeckState)', () => {
    const { world, player } = withHand(['melee', 'ranged', 'jump']);
    advance(world, [{ kind: 'PlayCard', entity: player, cardId: 'ranged', energyCost: 1, handIndex: 1 }]);
    const restored = restoreWorld(serializeWorld(world));
    expect(restored.store(DeckState).get(player)?.hand).toEqual(['melee', 'jump']);
  });

  it('a rejected play (too expensive) removes nothing and spends no energy', () => {
    const { world, player } = withHand(['melee', 'ranged']);
    const pool = world.store(ResourcePool).get(player) as { energy: number };
    const evs = advance(world, [{ kind: 'PlayCard', entity: player, cardId: 'melee', energyCost: 99, handIndex: 0 }]);
    expect(kinds(evs)).toContain('ActionRejected');
    expect(world.store(DeckState).get(player)?.hand).toEqual(['melee', 'ranged']);
    expect(pool.energy).toBe(3);
  });

  it('a stale (slot does not hold cardId) or out-of-range handIndex removes nothing', () => {
    const { world, player } = withHand(['melee', 'ranged']);
    // slot 1 holds 'ranged', not 'melee' -> the guard skips removal (the play still resolves)
    advance(world, [{ kind: 'PlayCard', entity: player, cardId: 'melee', energyCost: 1, handIndex: 1 }]);
    expect(world.store(DeckState).get(player)?.hand).toEqual(['melee', 'ranged']);
    // out-of-range slot -> removal skipped, no throw
    advance(world, [{ kind: 'PlayCard', entity: player, cardId: 'melee', energyCost: 1, handIndex: 9 }]);
    expect(world.store(DeckState).get(player)?.hand).toEqual(['melee', 'ranged']);
  });

  it('a PlayCard without a handIndex plays (energy + CardPlayed) but leaves the hand unchanged', () => {
    const { world, player } = withHand(['melee', 'ranged']);
    const pool = world.store(ResourcePool).get(player) as { energy: number };
    const evs = advance(world, [{ kind: 'PlayCard', entity: player, cardId: 'melee', energyCost: 1 }]);
    expect(kinds(evs)).toContain('CardPlayed');
    expect(world.store(DeckState).get(player)?.hand).toEqual(['melee', 'ranged']);
    expect(pool.energy).toBe(2);
  });
});

describe('turn cycle & enemy phase', () => {
  it('EndTurn cycles player->enemy->player, bumps the round, and fires end then start hooks', () => {
    const calls: string[] = [];
    const { world, player } = setup({
      hooks: {
        onPlayerTurnEnd: () => calls.push('end'),
        onPlayerTurnStart: () => calls.push('start'),
      },
    });
    const ts = world.store(TurnState).get(player) as { phase: string; round: number };
    const evs = advance(world, [{ kind: 'EndTurn', entity: player }]);
    expect(ts.phase).toBe('player');
    expect(ts.round).toBe(2);
    expect(calls).toEqual(['end', 'start']);
    expect(kinds(evs)).toEqual([
      'TurnEnded',
      'TurnStarted',
      'TurnEnded',
      'ResourceChanged',
      'RoundStarted',
      'TurnStarted',
    ]);
  });

  it('applies refill / regen / budget-reset BEFORE the start-of-turn hook (so a turn-start checkpoint sees fresh resources)', () => {
    let atHook: { energy: number; mana: number; budget: number } | null = null;
    const { world, player } = setup({
      hooks: {
        onPlayerTurnStart: (w) => {
          const p = w.store(ResourcePool).get(player) as { energy: number; mana: number };
          const b = w.store(MovementBudget).get(player) as { remaining: number };
          atHook = { energy: p.energy, mana: p.mana, budget: b.remaining };
        },
      },
    });
    // Deplete this turn's resources, then end the turn.
    const pool = world.store(ResourcePool).get(player) as { energy: number; mana: number };
    const budget = world.store(MovementBudget).get(player) as { remaining: number };
    pool.energy = 0;
    pool.mana = 0;
    budget.remaining = 0;

    advance(world, [{ kind: 'EndTurn', entity: player }]);

    // The hook is where WorldScene autosaves; it must observe the refilled turn-start
    // state (energy->max, mana regen, budget->max), not the depleted leftovers.
    expect(atHook).toEqual({ energy: 3, mana: 1, budget: 4 });
  });

  it('resolves enemies sequentially in ascending-id order, skipping any removed mid-turn', () => {
    const acted: EntityId[] = [];
    const { world, player } = setup({
      hooks: {
        enemyIntent: (w, enemy) => {
          acted.push(enemy);
          if (acted.length === 1) {
            const enemies = w.entitiesWith(Enemy);
            const last = enemies[enemies.length - 1];
            if (last !== undefined && last !== enemy) w.destroyEntity(last);
          }
        },
      },
    });
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    const e3 = world.createEntity();
    for (const e of [e1, e2, e3]) world.store(Enemy).add(e, { isEnemy: true });
    advance(world, [{ kind: 'EndTurn', entity: player }]);
    expect(acted).toEqual([e1, e2]); // e1 acts (removes e3), e2 acts, e3 skipped (no simultaneous strike)
  });
});

describe('restart turn & persistence', () => {
  it('restart-turn restores the turn-start world but the RNG stream CONTINUES', () => {
    const { world, player } = setup({ seed: 42 });
    const pool = world.store(ResourcePool).get(player) as { energy: number };
    const snapshot = serializeWorld(world); // taken at the start of the player turn
    advance(world, [{ kind: 'PlayCard', entity: player, cardId: 'a', energyCost: 2 }]);
    world.rng.next();
    world.rng.next();
    expect(pool.energy).toBe(1);

    const liveRng = world.rng.state();
    const restored = restoreWorld(snapshot);
    restored.rng.setState(liveRng); // keep the live RNG -> stream continues, world rewinds

    expect((restored.store(ResourcePool).get(player) as { energy: number }).energy).toBe(3);
    const restoredNext = restored.rng.next();
    expect(restoredNext).toBe(world.rng.next()); // continues the original stream...
    expect(restoredNext).not.toBe(createWorld(42).rng.next()); // ...not rewound to the turn-start seed
  });

  it('persists TurnState, ResourcePool and MovementBudget across a save round-trip', () => {
    const { world, player } = setup();
    (world.store(TurnState).get(player) as { round: number }).round = 4;
    const pool = world.store(ResourcePool).get(player) as { energy: number; mana: number };
    pool.energy = 1;
    pool.mana = 3;
    (world.store(MovementBudget).get(player) as { remaining: number }).remaining = 2;

    const restored = restoreWorld(serializeWorld(world));
    expect(restored.store(TurnState).get(player)).toEqual({ phase: 'player', round: 4, activeActor: player });
    expect(restored.store(ResourcePool).get(player)).toEqual({
      energy: 1,
      energyMax: 3,
      mana: 3,
      manaMax: 5,
      manaRegen: 1,
    });
    expect(restored.store(MovementBudget).get(player)).toEqual({ remaining: 2, max: 4 });
  });
});
