import type { AttentionResponsePersistence } from './attentionResponses';

// Web previews have no native device keychain; never leave remote responses in localStorage.
export const attentionResponseStorage: AttentionResponsePersistence = {
  durable: false,
  async load() { return null; },
  async save() {},
};
