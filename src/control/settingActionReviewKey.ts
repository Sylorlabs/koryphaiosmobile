import { sha256 } from '@noble/hashes/sha2.js';

// SecureStore keys have a restricted alphabet. Hash the host + machine +
// setting scope to avoid storing server addresses or user content in key names.
export function settingActionStorageKey(ownerField: string): string {
  const hash = sha256(new TextEncoder().encode(ownerField));
  const digest = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `koryphaios.setting-action-review.v1.${digest}`;
}
