import {
  defineComponent,
  HexPosition,
  FacingState,
  hexToPixel,
  manifest,
  frameConfig,
  AssetKeys,
  type ComponentType,
  type HexLayout,
  type EntityId,
  type Hex,
  type World,
} from '@core/index';

/** A renderable view of an entity, derived from component state. */
export interface RenderableView {
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly texture: string;
  /** Optional frame index for a static multi-frame texture. */
  readonly frame?: number;
  /** Optional animation key to play (looping); takes precedence over frame. */
  readonly anim?: string;
  /** Mirror horizontally — e.g. a right-facing sheet shown facing left. */
  readonly flipX?: boolean;
}

/** Presentation data: texture + how to animate it. animBase (e.g. 'player') drives state+facing anims. */
export interface RenderableData {
  texture: string;
  frame?: number;
  animBase?: string;
}
// Transient (not persisted — feature 06): presentation only, rebuilt on load
// by re-attaching Renderable to restored entities.
export const Renderable: ComponentType<RenderableData> = defineComponent<RenderableData>(
  'Renderable',
  { persistent: false },
);

/**
 * Player animation stance (card-play feel feature). The scene is the sole writer;
 * buildCharacterViews is the sole reader. Each field has a distinct writer:
 *  - base: the resting stance from the last committed action ('ready' after playing
 *    any card or spell; 'idle' at turn start and after a move).
 *  - armed: whether a card/spell is currently armed (forces 'ready' while held).
 *  - oneShot: a transient attack overlay played once over the resting stance.
 */
export interface AnimStateData {
  base: 'idle' | 'ready';
  armed: boolean;
  oneShot: 'attack1' | 'attack2' | null;
}
// Transient like Renderable: never persisted, re-created as a neutral idle on load.
export const AnimState: ComponentType<AnimStateData> = defineComponent<AnimStateData>('AnimState', {
  persistent: false,
});

/**
 * ms for one play of an attack one-shot overlay, derived from its registered frame count + fps —
 * the asset registry is the single source, shared with PreloadScene's anim frameRate so the
 * overlay-clear timer and the animation can't drift. attack1 is a short sheet run slower so it
 * reads; attack2 is longer. WorldScene uses this to time when the overlay clears to the resting stance.
 */
const ATTACK_SHEET = { attack1: AssetKeys.playerAttack1, attack2: AssetKeys.playerAttack2 } as const;
export function attackDurationMs(variant: 'attack1' | 'attack2'): number {
  const descriptor = manifest.resolve(ATTACK_SHEET[variant])?.descriptor;
  const fps = descriptor?.sprite?.fps ?? 12;
  const frames = descriptor ? frameConfig(descriptor).frameCount : 1;
  return (frames / fps) * 1000;
}

/**
 * Pick the animation state for an animated entity from its movement and AnimState.
 * Priority: walking (the MoveAnimator is replaying a move for it) wins; then a one-shot attack
 * overlay; then the 'ready' stance (resting base, or while a card/spell is armed); else idle.
 * Entities without an AnimState fall back to the original walk/idle behaviour.
 */
function animState(moving: boolean, anim: AnimStateData | undefined): string {
  if (moving) return 'walk';
  if (anim?.oneShot != null) return anim.oneShot;
  if (anim !== undefined && (anim.base === 'ready' || anim.armed)) return 'ready';
  return 'idle';
}

/**
 * Build the per-entity render views from world state (feature 14) — the home of
 * the character animation logic, out of the scene. For an animated entity
 * (animBase set) it composes `${animBase}.${state}.right` (walk/attack/ready/idle,
 * see animState) and mirrors via flipX from its Facing, since the single
 * right-facing sheet serves both directions. Pure and Phaser-free (unit-testable);
 * SceneSync consumes the result and reconciles it to sprites.
 */
export function* buildCharacterViews(
  world: World,
  layout: HexLayout,
  movingHex: ReadonlyMap<EntityId, Hex> = new Map(),
): Generator<RenderableView> {
  const positions = world.store(HexPosition);
  const facings = world.store(FacingState);
  const anims = world.store(AnimState);
  for (const [id, r] of world.store(Renderable).entries()) {
    const pos = positions.get(id);
    if (pos === undefined) continue;
    // While the MoveAnimator is replaying a move, the sprite follows the animator's visual hex (which
    // lags the already-committed HexPosition); otherwise it rests on HexPosition.
    const moving = movingHex.get(id);
    const { x, y } = hexToPixel(layout, moving ?? pos.hex);
    if (r.animBase !== undefined) {
      const facing = facings.get(id)?.facing ?? 'right';
      const state = animState(moving !== undefined, anims.get(id));
      yield {
        id,
        x,
        y,
        texture: r.texture,
        anim: `${r.animBase}.${state}.right`,
        flipX: facing === 'left',
      };
    } else {
      yield { id, x, y, texture: r.texture, ...(r.frame !== undefined ? { frame: r.frame } : {}) };
    }
  }
}
