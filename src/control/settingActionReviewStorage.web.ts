import { settingActionStorageKey } from './settingActionReviewKey';
import type { SettingActionReviewPersistence } from './settingActionReviewRegistry';

// Only a hashed host/setting identity and action label are retained on web.
// A disabled or unavailable browser store throws and blocks remote actions.
export const settingActionReviewStorage: SettingActionReviewPersistence = {
  async load(key) {
    const raw = window.localStorage.getItem(settingActionStorageKey(key));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' ||
      typeof (parsed as { label?: unknown }).label !== 'string' ||
      !(parsed as { label: string }).label.trim()) {
      throw new Error('Saved action review has an invalid format.');
    }
    return { label: (parsed as { label: string }).label };
  },
  async save(key, value) { window.localStorage.setItem(settingActionStorageKey(key), JSON.stringify(value)); },
  async clear(key) { window.localStorage.removeItem(settingActionStorageKey(key)); },
};
