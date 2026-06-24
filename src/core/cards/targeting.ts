import { type Hex, hexDistance, hexEquals } from '../hex/hex';
import { hexLine, hexesWithinRange } from '../hex/range';
import { hasLineOfSight } from '../hex/los';
import type { TargetSpec, Highlight } from './types';

/** The max targeting range of a spec (singleHex/lineOfSight maxRange), or undefined if unranged. */
export function targetMaxRange(spec: TargetSpec): number | undefined {
  return spec.kind === 'singleHex' || spec.kind === 'lineOfSight' ? spec.maxRange : undefined;
}

/** True when a maxRange is set and the hovered hex lies beyond it (pure hex distance). */
function outOfRange(maxRange: number | undefined, origin: Hex, hovered: Hex): boolean {
  return maxRange !== undefined && hexDistance(origin, hovered) > maxRange;
}

/**
 * Resolve a TargetSpec to the hexes to highlight: primary (red) and secondary
 * (yellow). Pure — the UI just tints these sets. `origin` is the caster's hex,
 * `hovered` the cursor hex, `firstPick` the locked first selection (twoStep).
 * singleHex/lineOfSight honour an optional maxRange (an empty highlight beyond it).
 *
 * `blocksSight` (default: nothing blocks) gates line of sight: a lineOfSight target, a reach attack (a
 * singleHex WITH a maxRange, e.g. Long Strike), and a selfAoe burst can't reach a hex they have no clear
 * line to. Omitting it (the default) disables LoS gating, so existing callers are unchanged. Range is
 * purely hex distance; line of sight is the separate hasLineOfSight check.
 */
export function resolveTargeting(
  spec: TargetSpec,
  origin: Hex,
  hovered: Hex,
  firstPick?: Hex,
  blocksSight: (hex: Hex) => boolean = () => false,
): Highlight {
  const empty: Highlight = { primary: [], secondary: [] };
  switch (spec.kind) {
    case 'self':
      // Any hex is valid and the chosen hex is ignored; highlight the caster.
      return { primary: [origin], secondary: [] };
    case 'singleHex':
      if (outOfRange(spec.maxRange, origin, hovered)) return empty;
      // A reach attack (maxRange set) needs line of sight even though it draws no ray; an unranged
      // singleHex (e.g. teleport) is exempt.
      if (spec.maxRange !== undefined && !hasLineOfSight(blocksSight, origin, hovered)) return empty;
      return { primary: [hovered], secondary: [] };
    case 'lineOfSight': {
      if (outOfRange(spec.maxRange, origin, hovered)) return empty;
      if (!hasLineOfSight(blocksSight, origin, hovered)) return empty;
      const line = hexLine(origin, hovered);
      // primary = the target; secondary = the ray between (exclude both endpoints).
      return { primary: [hovered], secondary: line.slice(1, -1) };
    }
    case 'areaOfEffect':
      return { primary: hexesWithinRange(hovered, spec.radius), secondary: [] };
    case 'selfAoe':
      // A fixed, self-centered burst: every hex within radius of the caster except its own hex and
      // except hexes it has no line of sight to (a wall shields what is behind it). The hovered hex is
      // ignored — you cannot aim it.
      return {
        primary: hexesWithinRange(origin, spec.radius)
          .filter((h) => !hexEquals(h, origin))
          .filter((h) => hasLineOfSight(blocksSight, origin, h)),
        secondary: [],
      };
    case 'twoStep': {
      if (firstPick === undefined) return resolveTargeting(spec.first, origin, hovered, undefined, blocksSight);
      const second = resolveTargeting(spec.second, origin, hovered, undefined, blocksSight);
      return { primary: [firstPick], secondary: [...second.primary, ...second.secondary] };
    }
  }
}
