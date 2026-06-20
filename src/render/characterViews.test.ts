import { describe, it, expect } from 'vitest';
import { createWorld, HexPosition, MovePath, FacingState, type HexLayout } from '@core/index';
import { Renderable, AnimState, buildCharacterViews, type AnimStateData } from '@render/characterViews';

const LAYOUT: HexLayout = { width: 32, height: 24, rowPitch: 18, originX: 24, originY: 28 };

describe('buildCharacterViews', () => {
  it('composes the right-facing anim, mirroring from world state', () => {
    const world = createWorld(1);
    const e = world.createEntity();
    world.store(HexPosition).add(e, { hex: { q: 0, r: 0 } });
    world.store(FacingState).add(e, { facing: 'left' });
    world.store(Renderable).add(e, { texture: 'player.idle', animBase: 'player' });

    // idle when no MovePath; facing left -> mirrored
    let views = [...buildCharacterViews(world, LAYOUT)];
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ anim: 'player.idle.right', flipX: true });

    // walk when a MovePath is present; facing right -> not mirrored
    world.store(FacingState).add(e, { facing: 'right' });
    world.store(MovePath).add(e, { path: [{ q: 0, r: 0 }, { q: 1, r: 0 }], index: 1 });
    views = [...buildCharacterViews(world, LAYOUT)];
    expect(views[0]).toMatchObject({ anim: 'player.walk.right', flipX: false });
  });

  it('picks attack > ready > idle from AnimState, with walk and oneShot overriding', () => {
    const world = createWorld(1);
    const e = world.createEntity();
    world.store(HexPosition).add(e, { hex: { q: 0, r: 0 } });
    world.store(FacingState).add(e, { facing: 'right' });
    world.store(Renderable).add(e, { texture: 'player.idle', animBase: 'player' });
    const stance: AnimStateData = { base: 'idle', armed: false, oneShot: null };
    world.store(AnimState).add(e, stance); // stored by reference; mutate to drive the state

    const anim = (): string | undefined => [...buildCharacterViews(world, LAYOUT)][0]?.anim;

    expect(anim()).toBe('player.idle.right'); // base idle, not armed

    stance.armed = true;
    expect(anim()).toBe('player.ready.right'); // armed forces ready
    stance.armed = false;

    stance.base = 'ready';
    expect(anim()).toBe('player.ready.right'); // base ready (e.g. after a card play)

    stance.oneShot = 'attack1';
    expect(anim()).toBe('player.attack1.right'); // attack overlay wins over ready
    stance.oneShot = 'attack2';
    expect(anim()).toBe('player.attack2.right');

    // a MovePath (walking) wins over everything, even an active attack overlay
    world.store(MovePath).add(e, { path: [{ q: 0, r: 0 }, { q: 1, r: 0 }], index: 1 });
    expect(anim()).toBe('player.walk.right');
  });
});
