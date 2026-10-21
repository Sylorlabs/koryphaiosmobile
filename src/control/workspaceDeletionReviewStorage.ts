import type { SettingActionReviewPersistence } from './settingActionReviewRegistry';

// Delay native module loading so the Workspace UI can be rendered by
// platform-independent tests. Production uses the same strict Keychain
// persistence as chat deletion, with no best-effort write fallback.
export const workspaceDeletionReviewStorage: SettingActionReviewPersistence = {
  async load(key) {
    const { settingActionReviewStorage } = await import('./settingActionReviewStorage');
    return settingActionReviewStorage.load(key);
  },
  async save(key, value) {
    const { settingActionReviewStorage } = await import('./settingActionReviewStorage');
    await settingActionReviewStorage.save(key, value);
  },
  async clear(key) {
    const { settingActionReviewStorage } = await import('./settingActionReviewStorage');
    await settingActionReviewStorage.clear(key);
  },
};
