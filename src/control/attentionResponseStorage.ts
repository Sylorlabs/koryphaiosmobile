import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

import { openAttentionResponses, sealAttentionResponses } from './attentionResponseCrypto';
import type { AttentionResponsePersistence } from './attentionResponses';

const KEY_NAME = 'koryphaios.mobile.attention-storage-key.v1';
const file = () => new File(Paths.document, 'kory-attention-responses.v1.enc');
const stagingFile = () => new File(Paths.document, 'kory-attention-responses.v1.stage');
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

async function encryptionKey(create: boolean): Promise<Uint8Array> {
  const stored = await SecureStore.getItemAsync(KEY_NAME);
  if (stored) {
    if (!/^[0-9a-f]{64}$/.test(stored)) throw new Error('Saved response key is invalid');
    return Uint8Array.from(stored.match(/../g)!, (pair) => parseInt(pair, 16));
  }
  if (!create || file().exists) {
    throw new Error('Saved responses exist but their device key is unavailable. They were not overwritten.');
  }
  const generated = Crypto.getRandomBytes(32);
  await SecureStore.setItemAsync(KEY_NAME, hex(generated));
  return generated;
}

/** Native-only adapter. SecureStore holds the encryption key, not the drafts.
 * Expo SDK 57 File APIs hold the encrypted payload atomically in document storage. */
export const attentionResponseStorage: AttentionResponsePersistence = {
  durable: true,
  async load() {
    const saved = file();
    if (!saved.exists) return null;
    return openAttentionResponses(await encryptionKey(false), await saved.bytes());
  },
  async save(contents) {
    const key = await encryptionKey(true);
    const bytes = sealAttentionResponses(key, Crypto.getRandomBytes(12), contents);
    const staged = stagingFile();
    staged.create({ overwrite: true });
    staged.write(bytes);
    await staged.move(file(), { overwrite: true });
  },
};
