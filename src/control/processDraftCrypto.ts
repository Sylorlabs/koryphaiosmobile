import { gcm } from '@noble/ciphers/aes.js';

const MAGIC = new Uint8Array([0x4b, 0x50, 0x44, 0x01]); // KPD v1
const AAD = new TextEncoder().encode('koryphaios-mobile/process-drafts/v1');

/** Versioned authenticated encryption, with a key distinct from other saved data. */
export function sealProcessDrafts(key: Uint8Array, nonce: Uint8Array, contents: string): Uint8Array {
  if (key.length !== 32 || nonce.length !== 12) throw new Error('Invalid process draft key or nonce');
  const encrypted = gcm(key, nonce, AAD).encrypt(new TextEncoder().encode(contents));
  const result = new Uint8Array(MAGIC.length + nonce.length + encrypted.length);
  result.set(MAGIC);
  result.set(nonce, MAGIC.length);
  result.set(encrypted, MAGIC.length + nonce.length);
  return result;
}

export function openProcessDrafts(key: Uint8Array, stored: Uint8Array): string {
  if (key.length !== 32 || stored.length < MAGIC.length + 12 + 16
    || !MAGIC.every((byte, i) => byte === stored[i])) {
    throw new Error('Unsupported or damaged process draft format');
  }
  const nonce = stored.slice(MAGIC.length, MAGIC.length + 12);
  return new TextDecoder().decode(gcm(key, nonce, AAD).decrypt(stored.slice(MAGIC.length + 12)));
}
