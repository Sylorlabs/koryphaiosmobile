import type { ProcessDraftPersistence } from './processInputDrafts';

// Web is an ephemeral preview without an iOS Keychain; never store commands in localStorage.
export const processDraftStorage: ProcessDraftPersistence = {
  durable: false,
  async load() { return null; },
  async save() {},
};
