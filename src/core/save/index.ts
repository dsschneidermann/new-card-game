/** Persistence / save foundation (feature 06). */
export type { StorageAdapter } from './storage';
export { InMemoryStorageAdapter } from './storage';
export type { SaveStateV1, LoadResult } from './save';
export {
  SAVE_KEY,
  SAVE_VERSION,
  serializeSave,
  applySave,
  saveRun,
  loadRun,
  clearRun,
  hasSave,
} from './save';
