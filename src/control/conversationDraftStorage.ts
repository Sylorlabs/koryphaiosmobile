import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import { openConversationDrafts, sealConversationDrafts, type ConversationDraftKind } from './conversationDraftCrypto';

export interface ConversationDraftPersistence {
  durable: boolean;
  load(): Promise<string | null>;
  save(contents: string): Promise<void>;
}

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const hex = (value: Uint8Array) => Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');

function nativeStorage(kind: ConversationDraftKind): ConversationDraftPersistence {
  const name = `kory-${kind}-drafts.v1`;
  const keyName = `koryphaios.mobile.${kind}-draft-key.v1`;
  const file = () => new File(Paths.document, `${name}.enc`);
  const staging = () => new File(Paths.document, `${name}.stage`);
  let keyFlight: Promise<Uint8Array> | null = null;

  function key(create: boolean): Promise<Uint8Array> {
    if (keyFlight) return keyFlight;
    const flight = (async () => {
      const stored = await SecureStore.getItemAsync(keyName);
      if (stored) {
        if (!/^[a-f0-9]{64}$/.test(stored)) throw new Error(`Saved ${kind} draft key is invalid`);
        return Uint8Array.from(stored.match(/../g)!, (part) => parseInt(part, 16));
      }
      if (!create || file().exists) throw new Error(`Saved ${kind} drafts have no device key; existing work was preserved.`);
      const generated = Crypto.getRandomBytes(32);
      await SecureStore.setItemAsync(keyName, hex(generated));
      return generated;
    })();
    keyFlight = flight;
    void flight.catch(() => { if (keyFlight === flight) keyFlight = null; });
    return flight;
  }

  return {
    durable: true,
    async load() {
      const saved = file();
      if (!saved.exists) return null;
      if (saved.size > MAX_FILE_BYTES) throw new Error(`Saved ${kind} drafts exceed the device limit`);
      return openConversationDrafts(kind, await key(false), await saved.bytes());
    },
    async save(contents) {
      const secret = await key(true);
      const bytes = sealConversationDrafts(kind, secret, Crypto.getRandomBytes(12), contents);
      if (bytes.length > MAX_FILE_BYTES) throw new Error(`${kind} drafts exceed the device storage limit`);
      const next = staging();
      next.create({ overwrite: true });
      next.write(bytes);
      await next.move(file(), { overwrite: true });
    },
  };
}

export const composerDraftStorage = nativeStorage('composer');
export const agentMessageDraftStorage = nativeStorage('agent');
