import {
  requiredDeleteItem, requiredGetItem, requiredSetItem,
} from './safeSecureStore';
import type { DeviceIdentity, LinkedDevice } from '@koryphaios/shared/src/devices';

export interface MobileDeviceIdentity { identity: DeviceIdentity; privateKey: JsonWebKey }
export interface MobileDeviceLink { relayUrl: string; peer: LinkedDevice }
const identityKey = 'koryphaios.mobile.device-identity.v1';
const indexKey = 'koryphaios.mobile.device-links.v1';
const linkKey = (id: string) => `koryphaios.mobile.device-link.${id}`;

// The peer index is a read/modify/write Keychain value. Serialize updates so
// simultaneous approvals, removals and host selections cannot lose a peer or
// clear a newly selected host. A failed operation must not stall later retries.
let mutationTail: Promise<void> = Promise.resolve();
function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationTail.then(operation);
  mutationTail = result.then(() => undefined, () => undefined);
  return result;
}

export async function loadDeviceIdentity(): Promise<MobileDeviceIdentity | null> {
  const raw = await requiredGetItem(identityKey);
  return raw ? JSON.parse(raw) : null;
}
export async function saveDeviceIdentity(identity: MobileDeviceIdentity) {
  await requiredSetItem(identityKey, JSON.stringify(identity));
}
export async function loadDeviceLinks(): Promise<MobileDeviceLink[]> {
  const ids: string[] = JSON.parse(await requiredGetItem(indexKey) ?? '[]');
  const links = await Promise.all(ids.map(async (id) => {
    const raw = await requiredGetItem(linkKey(id));
    return raw ? JSON.parse(raw) as MobileDeviceLink : null;
  }));
  return links.filter((link): link is MobileDeviceLink => link !== null);
}
export function saveDeviceLink(link: MobileDeviceLink): Promise<void> {
  return serializeMutation(async () => {
  const ids: string[] = JSON.parse(await requiredGetItem(indexKey) ?? '[]');
  const key = linkKey(link.peer.id);
  const previous = await requiredGetItem(key);
  try {
    await requiredSetItem(key, JSON.stringify(link));
    await requiredSetItem(indexKey, JSON.stringify([...new Set([...ids, link.peer.id])]));
  } catch (caught) {
    // Two Keychain entries cannot be written atomically. Restore a prior link
    // if updating the index failed; the caller still receives the failure.
    try {
      if (previous === null) await requiredDeleteItem(key);
      else await requiredSetItem(key, previous);
    } catch { /* Caller must recheck persistence after a failed rollback. */ }
    throw caught;
  }
  });
}
export function removeDeviceLink(id: string): Promise<void> {
  return serializeMutation(async () => {
  const storedIndex = await requiredGetItem(indexKey);
  const ids: string[] = JSON.parse(storedIndex ?? '[]');
  const key = linkKey(id);
  const previous = await requiredGetItem(key);
  try {
    await requiredSetItem(indexKey, JSON.stringify(ids.filter((item) => item !== id)));
    await requiredDeleteItem(key);
  } catch (caught) {
    try {
      if (previous !== null) await requiredSetItem(key, previous);
      if (storedIndex === null) await requiredDeleteItem(indexKey);
      else await requiredSetItem(indexKey, storedIndex);
    } catch { /* Caller must recheck persistence after a failed rollback. */ }
    throw caught;
  }
  });
}

const activeHostKey = 'koryphaios.mobile.active-device-host.v1';
export async function loadActiveDeviceHost(): Promise<string> {
  return (await requiredGetItem(activeHostKey)) ?? '';
}
export async function saveActiveDeviceHost(id: string): Promise<void> {
  return serializeMutation(async () => {
    if (id) await requiredSetItem(activeHostKey, id);
    else await requiredDeleteItem(activeHostKey);
  });
}

export function clearActiveDeviceHostIfMatches(hostId: string): Promise<boolean> {
  return serializeMutation(async () => {
    if (!hostId || await requiredGetItem(activeHostKey) !== hostId) return false;
    await requiredDeleteItem(activeHostKey);
    return true;
  });
}
