import { gcm } from '@noble/ciphers/aes.js';

const MAGIC = new Uint8Array([0x4b, 0x41, 0x52, 0x01]); // KAR v1
const AAD = new TextEncoder().encode('koryphaios-mobile/attention-responses/v1');

/** Authenticated, versioned binary envelope; plaintext is never stored on disk. */
export function sealAttentionResponses(key: Uint8Array, nonce: Uint8Array, contents: string): Uint8Array {
  if (key.length !== 32 || nonce.length !== 12) throw new Error('Invalid response-storage key or nonce');
  const encrypted = gcm(key, nonce, AAD).encrypt(new TextEncoder().encode(contents));
  const result = new Uint8Array(MAGIC.length + nonce.length + encrypted.length);
  result.set(MAGIC);
  result.set(nonce, MAGIC.length);
  result.set(encrypted, MAGIC.length + nonce.length);
  return result;
}

export function openAttentionResponses(key: Uint8Array, stored: Uint8Array): string {
  if (key.length !== 32 || stored.length < MAGIC.length + 12 + 16
    || !MAGIC.every((byte, index) => stored[index] === byte)) {
    throw new Error('Unsupported or damaged saved-response format');
  }
  const nonce = stored.slice(MAGIC.length, MAGIC.length + 12);
  const encrypted = stored.slice(MAGIC.length + 12);
  return new TextDecoder().decode(gcm(key, nonce, AAD).decrypt(encrypted));
}
