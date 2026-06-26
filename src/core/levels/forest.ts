import { offsetToAxial } from '../hex/layout';
import type { LevelDef } from './levels';

// The forest world is 52x42 — 4x the original 26x21 area (the Larger World feature): the camera
// follows the player and renders only the visible 26x21 view of this larger map.
const COLS = 52;
const ROWS = 42;

/**
 * The Forest level: the original WorldScene world expressed as data. Same 52x42 size, the same
 * grid-centre start hex, and the same fixed terrain seed as before, so the forest renders
 * identically. No enemy spawns yet — the temporary "one of every enemy" showcase was removed;
 * curated rosters arrive with the enemy-roster features. Its terrain skin (tileset frames + leaf
 * shapes) lives in the renderer's FOREST_THEME, keyed by this id.
 */
export const FOREST_LEVEL: LevelDef = {
  id: 'forest',
  cols: COLS,
  rows: ROWS,
  startHex: offsetToAxial({ col: Math.floor(COLS / 2), row: Math.floor(ROWS / 2) }),
  enemySpawns: [],
  // A small hand-authored set near the centred start (col 26, row 21): a tall obstacle a couple hexes east
  // (blocks movement + line of sight) and a low obstacle to the west (blocks movement, ranged fires over it).
  // Just enough to exercise obstacles + LoS; procedural placement is a later feature.
  obstacles: [
    { kind: 'tall', hex: offsetToAxial({ col: 28, row: 20 }) },
    { kind: 'tall', hex: offsetToAxial({ col: 28, row: 21 }) },
    { kind: 'tall', hex: offsetToAxial({ col: 28, row: 22 }) },
    { kind: 'low', hex: offsetToAxial({ col: 24, row: 21 }) },
  ],
  // Two reward chests on walkable tiles near the centred start (col 26, row 21), clear of the obstacles,
  // to exercise the chest pickup flow. Procedural placement is a later feature.
  chests: [
    { hex: offsetToAxial({ col: 24, row: 19 }) },
    { hex: offsetToAxial({ col: 28, row: 18 }) },
  ],
  terrainSeed: 0x7e44a1, // fixed -> a consistent designed ground (could key off the world seed later)
};
