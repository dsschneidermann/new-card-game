/** A deterministic, seedable random number generator. */
export interface SeededRNG {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Uniformly pick an element; throws on an empty array. */
  pick<T>(xs: readonly T[]): T;
  /**
   * The live internal state (feature 06). For mulberry32 this is the single
   * 32-bit accumulator; capturing and restoring it resumes the exact stream,
   * so a save continues randomness mid-run rather than restarting from a seed.
   */
  state(): number;
  /** Restore a previously captured state (see {@link state}). */
  setState(s: number): void;
}

/**
 * mulberry32 PRNG — tiny, fast, and fully reproducible from a numeric seed.
 * All game randomness flows through this (ADR-002 determinism constraint), so
 * simulations and tests are exactly repeatable.
 */
export function makeRng(seed: number): SeededRNG {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (maxExclusive: number): number => Math.floor(next() * maxExclusive);
  const pick = <T>(xs: readonly T[]): T => {
    if (xs.length === 0) throw new Error('SeededRNG.pick: cannot pick from an empty array');
    return xs[int(xs.length)] as T;
  };
  // mulberry32's entire state is `s`, and seeding is just setting it (next()
  // advances `s` before producing output), so state()/setState() round-trips.
  const state = (): number => s >>> 0;
  const setState = (value: number): void => {
    s = value >>> 0;
  };
  return { next, int, pick, state, setState };
}
