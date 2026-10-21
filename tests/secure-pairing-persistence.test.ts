import { beforeEach, expect, mock, test } from 'bun:test';

const values = new Map<string, string>();
let failingRead = '';
let failingWrite = '';
let failingDelete = '';

mock.module('expo-secure-store', () => ({
  getItemAsync: async (key: string) => {
    if (key === failingRead) throw new Error('Keychain read unavailable');
    return values.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    if (key === failingWrite) throw new Error('Keychain write unavailable');
    values.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (key === failingDelete) throw new Error('Keychain deletion unavailable');
    values.delete(key);
  },
}));

const { savePairing, loadPairing, clearPairing } = await import('../src/control/securePairing');
const {
  saveDeviceIdentity, loadDeviceIdentity, saveDeviceLink, loadDeviceLinks, removeDeviceLink,
  saveActiveDeviceHost, loadActiveDeviceHost, clearActiveDeviceHostIfMatches,
} =
  await import('../src/control/linkedDeviceStorage');

const directKey = 'koryphaios.mobile.pairing.v1';
const identityKey = 'koryphaios.mobile.device-identity.v1';
const indexKey = 'koryphaios.mobile.device-links.v1';
const linkKey = 'koryphaios.mobile.device-link.desk-a';
const activeKey = 'koryphaios.mobile.active-device-host.v1';

beforeEach(() => {
  values.clear();
  failingRead = failingWrite = failingDelete = '';
});

test('direct pairing never reports saved or cleared when Keychain operations fail', async () => {
  const pairing = { baseUrl: 'https://fixture.invalid', token: 'fixture-only', machineId: 'host-a', machineName: 'Fixture' };
  failingWrite = directKey;
  await expect(savePairing(pairing)).rejects.toThrow('Keychain write unavailable');
  expect(await loadPairing()).toBeNull();
  failingWrite = '';
  await savePairing(pairing);
  failingRead = directKey;
  await expect(loadPairing()).rejects.toThrow('Keychain read unavailable');
  failingRead = '';
  failingDelete = directKey;
  await expect(clearPairing()).rejects.toThrow('Keychain deletion unavailable');
  expect(await loadPairing()).toEqual(pairing);
});

test('linked device identity must be durably stored before clients use it', async () => {
  const identity = { identity: { id: 'phone-a' }, privateKey: { kty: 'EC' } } as any;
  failingWrite = identityKey;
  await expect(saveDeviceIdentity(identity)).rejects.toThrow('Keychain write unavailable');
  expect(await loadDeviceIdentity()).toBeNull();
  failingWrite = '';
  await saveDeviceIdentity(identity);
  failingRead = identityKey;
  await expect(loadDeviceIdentity()).rejects.toThrow('Keychain read unavailable');
});

test('failed linked-device index update does not destroy a previously saved link', async () => {
  const previous = { relayUrl: 'https://relay.invalid', peer: { id: 'desk-a', name: 'Existing' } } as any;
  const updated = { ...previous, peer: { ...previous.peer, name: 'Updated' } };
  await saveDeviceLink(previous);
  failingWrite = indexKey;
  await expect(saveDeviceLink(updated)).rejects.toThrow('Keychain write unavailable');
  failingWrite = '';
  expect(await loadDeviceLinks()).toEqual([previous]);
});

test('failed linked-device deletion keeps the link available for retry', async () => {
  const link = { relayUrl: 'https://relay.invalid', peer: { id: 'desk-a' } } as any;
  await saveDeviceLink(link);
  failingDelete = linkKey;
  await expect(removeDeviceLink('desk-a')).rejects.toThrow('Keychain deletion unavailable');
  failingDelete = '';
  expect(await loadDeviceLinks()).toEqual([link]);
});

test('simultaneous saves preserve both linked hosts in the secure index', async () => {
  const first = { relayUrl: 'https://relay.invalid', peer: { id: 'desk-a' } } as any;
  const second = { relayUrl: 'https://relay.invalid', peer: { id: 'desk-b' } } as any;
  await Promise.all([saveDeviceLink(first), saveDeviceLink(second)]);
  expect(await loadDeviceLinks()).toEqual([first, second]);
});

test('overlapping remove and save keep the new host and discard only the removed host', async () => {
  const first = { relayUrl: 'https://relay.invalid', peer: { id: 'desk-a' } } as any;
  const second = { relayUrl: 'https://relay.invalid', peer: { id: 'desk-b' } } as any;
  await saveDeviceLink(first);
  await Promise.all([removeDeviceLink('desk-a'), saveDeviceLink(second)]);
  expect(await loadDeviceLinks()).toEqual([second]);
});

test('active host reads, selections and removal report Keychain failures', async () => {
  failingWrite = activeKey;
  await expect(saveActiveDeviceHost('desk-a')).rejects.toThrow('Keychain write unavailable');
  expect(await loadActiveDeviceHost()).toBe('');
  failingWrite = '';
  await saveActiveDeviceHost('desk-a');
  failingRead = activeKey;
  await expect(loadActiveDeviceHost()).rejects.toThrow('Keychain read unavailable');
  failingRead = '';
  failingDelete = activeKey;
  await expect(saveActiveDeviceHost('')).rejects.toThrow('Keychain deletion unavailable');
  expect(await loadActiveDeviceHost()).toBe('desk-a');
});

test('unlinking one host cannot clear an active selection for another host', async () => {
  await saveActiveDeviceHost('desk-a');
  expect(await clearActiveDeviceHostIfMatches('desk-b')).toBe(false);
  expect(await loadActiveDeviceHost()).toBe('desk-a');
  await Promise.all([saveActiveDeviceHost('desk-b'), clearActiveDeviceHostIfMatches('desk-a')]);
  expect(await loadActiveDeviceHost()).toBe('desk-b');
  expect(await clearActiveDeviceHostIfMatches('desk-b')).toBe(true);
  expect(await loadActiveDeviceHost()).toBe('');
});
