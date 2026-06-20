import { describe, it, expect } from 'vitest';
import { createWorld, HexPosition, MovePath, FacingState, type HexLayout } from '@core/index';
import { Renderable, buildCharacterViews } from '@render/characterViews';

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
});
