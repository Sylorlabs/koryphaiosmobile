import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import { openProcessDrafts, sealProcessDrafts } from './processDraftCrypto';
import type { ProcessDraftPersistence } from './processInputDrafts';

const KEY_NAME = 'koryphaios.mobile.process-draft-key.v1';
const file = () => new File(Paths.document, 'kory-process-drafts.v1.enc');
const stage = () => new File(Paths.document, 'kory-process-drafts.v1.stage');
const hex = (value: Uint8Array) => Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');

async function key(create: boolean): Promise<Uint8Array> {
  const value = await SecureStore.getItemAsync(KEY_NAME);
  if (value) {
    if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Saved process draft key is invalid');
    return Uint8Array.from(value.match(/../g)!, (pair) => parseInt(pair, 16));
  }
  if (!create || file().exists) {
    throw new Error('Saved process drafts have no device key. Existing drafts were not overwritten.');
  }
  const generated = Crypto.getRandomBytes(32);
  await SecureStore.setItemAsync(KEY_NAME, hex(generated));
  return generated;
}

/** Native-only: Keychain key + atomic encrypted Expo document file. */
export const processDraftStorage: ProcessDraftPersistence = {
  durable: true,
  async load() {
    const saved = file();
    if (!saved.exists) return null;
    return openProcessDrafts(await key(false), await saved.bytes());
  },
  async save(contents) {
    const secret = await key(true);
    const bytes = sealProcessDrafts(secret, Crypto.getRandomBytes(12), contents);
    const staging = stage();
    staging.create({ overwrite: true });
    staging.write(bytes);
    await staging.move(file(), { overwrite: true });
  },
};
