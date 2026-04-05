/**
 * Sync Service
 *
 * Tracks the last time each data category was synced with the server,
 * and the last known server counts. Used by SyncAnalysisScreen to
 * compute the gap between what is on the server and what the user has seen.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'boom_sync_metadata';

export type SyncCategory =
  | 'profile'
  | 'subscription'
  | 'wallet'
  | 'receipts'
  | 'stickers'
  | 'card';

export interface SyncRecord {
  /** Unix timestamp (ms) of last successful fetch */
  lastSync: number;
  /** Last known server count (where applicable) */
  serverCount?: number;
  /** Last observed value (e.g. balance string) */
  lastValue?: string;
}

export type SyncMetadata = Partial<Record<SyncCategory, SyncRecord>>;

const SyncService = {
  async load(): Promise<SyncMetadata> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SyncMetadata) : {};
    } catch {
      return {};
    }
  },

  async save(metadata: SyncMetadata): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
    } catch {
      // Non-critical — silently ignore
    }
  },

  async record(
    category: SyncCategory,
    opts: { serverCount?: number; lastValue?: string } = {}
  ): Promise<void> {
    try {
      // Use mergeItem so concurrent writes from parallel fetches don't overwrite each other.
      // Each call only touches the one category key it owns.
      const entry: SyncRecord = { lastSync: Date.now() };
      if (opts.serverCount !== undefined) entry.serverCount = opts.serverCount;
      if (opts.lastValue !== undefined) entry.lastValue = opts.lastValue;
      await AsyncStorage.mergeItem(STORAGE_KEY, JSON.stringify({ [category]: entry }));
    } catch {
      // Non-critical — silently ignore
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
};

export default SyncService;
