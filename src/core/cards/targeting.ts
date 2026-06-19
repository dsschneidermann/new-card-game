import type { Hex } from '../hex/hex';
import { hexLine, hexesWithinRange } from '../hex/range';
import type { TargetSpec, Highlight } from './types';

/**
 * Resolve a TargetSpec to the hexes to highlight: primary (red) and secondary
 * (yellow). Pure — the UI just tints these sets. `origin` is the caster's hex,
 * `hovered` the cursor hex, `firstPick` the locked first selection (twoStep).
 * Targets are unrestricted for now: no range or line-of-sight BLOCKING yet, so
 * the line-of-sight ray is drawn in full (that and the grid arrive later).
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
      return { primary: [hovered], secondary: [] };
    case 'lineOfSight': {
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
