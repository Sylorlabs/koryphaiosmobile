import * as SecureStore from 'expo-secure-store';

import { settingActionStorageKey } from './settingActionReviewKey';
import type { SettingActionReviewPersistence } from './settingActionReviewRegistry';

// Unlike the convenience safeSecureStore wrapper, failures MUST surface.
// Otherwise an uncertain destructive action could be replayed after restart.
export const settingActionReviewStorage: SettingActionReviewPersistence = {
  async load(key) {
    const raw = await SecureStore.getItemAsync(settingActionStorageKey(key));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' ||
      typeof (parsed as { label?: unknown }).label !== 'string' ||
      !(parsed as { label: string }).label.trim()) {
      throw new Error('Saved action review has an invalid format.');
    }
    return { label: (parsed as { label: string }).label };
  },
  async save(key, value) {
    await SecureStore.setItemAsync(settingActionStorageKey(key), JSON.stringify(value));
  },
  async clear(key) {
    await SecureStore.deleteItemAsync(settingActionStorageKey(key));
  },
};
