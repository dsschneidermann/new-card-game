import type { StorageAdapter } from '@core/index';

/**
 * Browser Web-Storage implementation of the core StorageAdapter (feature 06).
 * This is the only persistence I/O the app performs, kept at the Phaser/DOM
 * boundary so `src/core` stays DOM-free (ADR-002). Every access is guarded:
 * if Web Storage is unavailable (private mode, blocked, SSR) or a write is
 * refused (quota), it degrades to a no-op / empty read rather than throwing.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private store(): Storage | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  }

  get(key: string): string | null {
    try {
      return this.store()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      this.store()?.setItem(key, value);
    } catch {
      // Quota exceeded or access denied — drop the write rather than crash.
      console.warn('[save] could not write to storage; the run was not saved');
    }
  }

  remove(key: string): void {
    try {
      this.store()?.removeItem(key);
    } catch {
      /* nothing to do */
    }
  }
}
