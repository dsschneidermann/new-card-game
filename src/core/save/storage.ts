/**
 * The sole persistence I/O boundary (feature 06). Everything above the save
 * module talks to a StorageAdapter, never to a concrete backend, so the core
 * stays DOM-free (ADR-002): tests use the InMemoryStorageAdapter, while the app
 * wires a Web-Storage-backed adapter at the Phaser boundary (src/scenes).
 */
export interface StorageAdapter {
  /** The stored string for `key`, or null if absent. */
  get(key: string): string | null;
  /** Store `value` under `key`, replacing any prior value. */
  set(key: string, value: string): void;
  /** Remove `key` (a no-op if absent). */
  remove(key: string): void;
}

/** A Map-backed StorageAdapter for tests and headless runs. */
export class InMemoryStorageAdapter implements StorageAdapter {
  private readonly data = new Map<string, string>();

  get(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  set(key: string, value: string): void {
    this.data.set(key, value);
  }

  remove(key: string): void {
    this.data.delete(key);
  }
}
