import { type Hex, hexDistance } from '../hex/hex';
import { hexLine, hexesWithinRange } from '../hex/range';
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
 * singleHex/lineOfSight honour an optional maxRange (returning an empty highlight
 * beyond it); there is no line-of-sight BLOCKING yet, so the ray is still drawn in
 * full to the (in-range) target. Range is purely hex distance — walls/blocking arrive later.
 */
export function resolveTargeting(
  spec: TargetSpec,
  origin: Hex,
  hovered: Hex,
  firstPick?: Hex,
): Highlight {
  switch (spec.kind) {
    case 'self':
      // Any hex is valid and the chosen hex is ignored; highlight the caster.
      return { primary: [origin], secondary: [] };
    case 'singleHex':
      if (outOfRange(spec.maxRange, origin, hovered)) return { primary: [], secondary: [] };
      return { primary: [hovered], secondary: [] };
    case 'lineOfSight': {
      if (outOfRange(spec.maxRange, origin, hovered)) return { primary: [], secondary: [] };
      const line = hexLine(origin, hovered);
      // primary = the target; secondary = the ray between (exclude both endpoints).
      return { primary: [hovered], secondary: line.slice(1, -1) };
    }
    case 'areaOfEffect':
      return { primary: hexesWithinRange(hovered, spec.radius), secondary: [] };
    case 'twoStep': {
      if (firstPick === undefined) return resolveTargeting(spec.first, origin, hovered);
      const second = resolveTargeting(spec.second, origin, hovered);
      return { primary: [firstPick], secondary: [...second.primary, ...second.secondary] };
    }
  }
}
