import type { World } from '../ecs/world';
import { serializeWorld, restoreWorld, type WorldSnapshot } from '../ecs/world';
import type { StorageAdapter } from './storage';

/**
 * Save foundation (feature 06). A single active-run autosave: the persistent
 * World state wrapped in a versioned envelope, round-tripped through a
 * StorageAdapter. There is no migration — an envelope whose version does not
 * match is discarded (single runs aren't worth migrating, ADR-010), so the
 * version is purely a discard-on-mismatch marker. loadRun is total: it never
 * throws, returning a typed reason instead.
 */
export const SAVE_KEY = 'ncg.save.v1';
// Bump this whenever the persisted shape changes — a mismatched save is discarded (the run resets)
// rather than migrated (ADR-010; dev game, easy to reset). v2: the card-entity deck model changed
// DeckState's shape (instance-id piles + per-instance components). v3: EnemyData gained `art`.
// v4: the world grew to 52x42 with a new centered start + full-world enemy spread — discard pre-
// enlargement saves so a resumed run starts in the new world (no shape change; clean reset).
// v5: enemy sprite assets renamed to enemy_<name>.<state>, so the persisted EnemyData.art base is now
// enemy_<name> (e.g. enemy_slime1) — discard old saves whose art base lacks the prefix (no migration).
export const SAVE_VERSION = 5 as const;

/** The versioned save envelope. */
export interface SaveStateV1 {
  version: typeof SAVE_VERSION;
  world: WorldSnapshot;
}

export type LoadResult =
  | { ok: true; state: SaveStateV1 }
  | { ok: false; reason: 'absent' | 'corrupt' | 'incompatible' };

/**
 * Structural check that a parsed `world` is a usable WorldSnapshot. loadRun's
 * totality must reach restoreWorld: a version-matching but malformed payload
 * (e.g. a half-written entry) is reported 'corrupt' here rather than throwing
 * later when restoreWorld iterates a missing `living`/`components`.
 */
function isWorldSnapshot(w: unknown): w is WorldSnapshot {
  if (typeof w !== 'object' || w === null) return false;
  const s = w as Record<string, unknown>;
  return (
    typeof s.rng === 'number' &&
    typeof s.nextEntityId === 'number' &&
    Array.isArray(s.living) &&
    typeof s.components === 'object' &&
    s.components !== null
  );
}

/** Build the save envelope from the current World (pure; no I/O). */
export function serializeSave(world: World): SaveStateV1 {
  return { version: SAVE_VERSION, world: serializeWorld(world) };
}

/** Rebuild a World from a save envelope (pure; no I/O). */
export function applySave(state: SaveStateV1): World {
  return restoreWorld(state.world);
}

/** Write the current run to storage, overwriting the single autosave slot. */
export function saveRun(adapter: StorageAdapter, world: World): void {
  adapter.set(SAVE_KEY, JSON.stringify(serializeSave(world)));
}

/**
 * Read the saved run. Total: a missing save is 'absent', unparseable or
 * malformed JSON is 'corrupt', and a version mismatch is 'incompatible'. Never
 * throws and never migrates.
 */
export function loadRun(adapter: StorageAdapter): LoadResult {
  const raw = adapter.get(SAVE_KEY);
  if (raw === null) return { ok: false, reason: 'absent' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, reason: 'corrupt' };
  const obj = parsed as { version?: unknown; world?: unknown };
  if (obj.version !== SAVE_VERSION) return { ok: false, reason: 'incompatible' };
  if (!isWorldSnapshot(obj.world)) return { ok: false, reason: 'corrupt' };
  return { ok: true, state: obj as SaveStateV1 };
}

/** Delete the saved run (e.g. on Abandon). */
export function clearRun(adapter: StorageAdapter): void {
  adapter.remove(SAVE_KEY);
}

/** Whether a usable save exists (a corrupt/incompatible save reads as none). */
export function hasSave(adapter: StorageAdapter): boolean {
  return loadRun(adapter).ok;
}
