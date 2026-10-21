import { gcm } from '@noble/ciphers/aes.js';

export type ConversationDraftKind = 'composer' | 'agent';

const MAGIC = new Uint8Array([0x4b, 0x43, 0x44, 0x01]); // KCD v1
const aad = (kind: ConversationDraftKind) =>
  new TextEncoder().encode(`koryphaios-mobile/${kind}-drafts/v1`);

/** Each draft family has a distinct authenticated context even if keys are mixed up. */
export function sealConversationDrafts(
  kind: ConversationDraftKind, key: Uint8Array, nonce: Uint8Array, contents: string,
): Uint8Array {
  if (key.length !== 32 || nonce.length !== 12) throw new Error('Invalid conversation draft key or nonce');
  const encrypted = gcm(key, nonce, aad(kind)).encrypt(new TextEncoder().encode(contents));
  const output = new Uint8Array(MAGIC.length + nonce.length + encrypted.length);
  output.set(MAGIC);
  output.set(nonce, MAGIC.length);
  output.set(encrypted, MAGIC.length + nonce.length);
  return output;
}

export function openConversationDrafts(
  kind: ConversationDraftKind, key: Uint8Array, stored: Uint8Array,
): string {
  if (key.length !== 32 || stored.length < MAGIC.length + 12 + 16 ||
      !MAGIC.every((byte, index) => stored[index] === byte)) {
    throw new Error('Unsupported or damaged conversation draft format');
  }
  const nonce = stored.slice(MAGIC.length, MAGIC.length + 12);
  return new TextDecoder().decode(gcm(key, nonce, aad(kind)).decrypt(stored.slice(MAGIC.length + 12)));
}
