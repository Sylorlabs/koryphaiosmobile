import type { ConversationDraftPersistence } from './conversationDraftStorage';

// A browser preview has no iOS Keychain. Never place remote conversations in web storage.
const ephemeral: ConversationDraftPersistence = {
  durable: false,
  async load() { return null; },
  async save() {},
};
export const composerDraftStorage = ephemeral;
export const agentMessageDraftStorage = ephemeral;
