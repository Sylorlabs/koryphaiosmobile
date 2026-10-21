import { afterEach, expect, test } from 'bun:test';
import { createNativeDeviceCryptography } from '../src/control/deviceCryptoCore';
import { DeviceClient, makeDeviceIdentity } from '@koryphaios/shared/src/device-client';
import { webDeviceCryptography as desktopCrypto, deviceVerify } from '@koryphaios/shared/src/devices';
import { parseDevicePairingLink } from '@koryphaios/shared/src/device-pairing-link';
import { DeviceRelay } from '../../koryphaios/relay/devices';

const nativeCrypto = createNativeDeviceCryptography(
  (length) => crypto.getRandomValues(new Uint8Array(length)),
  () => crypto.randomUUID(),
);
const stops = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); });
async function wait(predicate) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await Bun.sleep(10); }
  throw new Error('Device event timed out');
}

test('native mobile crypto interoperates with desktop keys, signatures, envelopes and verification numbers', async () => {
  const mobile = await makeDeviceIdentity('Koryphaios Mobile', 'iOS', 'mobile', nativeCrypto);
  const desktop = await makeDeviceIdentity('Desktop', 'macOS', 'desktop');
  expect(await desktopCrypto.deviceKeyId(mobile.identity.publicKey)).toBe(mobile.identity.id);
  const signature = await nativeCrypto.deviceSign(mobile.privateKey, 'registration');
  expect(await deviceVerify(mobile.identity.publicKey, 'registration', signature)).toBe(true);
  const body = { type: 'request', operation: 'prompt', content: 'Hello from mobile 📱' };
  const mobileEnvelope = await nativeCrypto.sealDeviceMessage(mobile.privateKey, desktop.identity, mobile.identity.id, body);
  expect(await desktopCrypto.openDeviceMessage(desktop.privateKey, mobile.identity, desktop.identity.id, mobileEnvelope)).toEqual(body);
  const desktopEnvelope = await desktopCrypto.sealDeviceMessage(desktop.privateKey, mobile.identity, desktop.identity.id, body);
  expect(await nativeCrypto.openDeviceMessage(mobile.privateKey, desktop.identity, mobile.identity.id, desktopEnvelope)).toEqual(body);
  await expect(nativeCrypto.openDeviceMessage(mobile.privateKey, desktop.identity, mobile.identity.id, { ...desktopEnvelope, signature: 'bad' })).rejects.toThrow();
  await expect(nativeCrypto.openDeviceMessage(mobile.privateKey, desktop.identity, mobile.identity.id, desktopEnvelope, desktopEnvelope.timestamp + 121_000)).rejects.toThrow('expired');
  await expect(nativeCrypto.openDeviceMessage(mobile.privateKey, desktop.identity, desktop.identity.id, desktopEnvelope)).rejects.toThrow();
  const args = ['ABCDE-FGHJK-LMNPQ-RSTUV', mobile.identity.id, desktop.identity.id, 'guest-nonce:host-nonce'];
  expect(await nativeCrypto.pairingCheck(...args)).toBe(await desktopCrypto.pairingCheck(...args));
});

test('desktop app QR pairs native mobile through the real relay, pins the host and waits for host consent', async () => {
  const relay = new DeviceRelay();
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0,
    fetch: async (req, srv) => (await relay.fetch(req, srv)) ?? new Response('Not found', { status: 404 }),
    websocket: { open: (ws) => relay.open(ws), message: (ws, message) => relay.message(ws, message), close: (ws) => relay.close(ws) },
  });
  stops.push(() => server.stop(true));
  const relayUrl = `http://127.0.0.1:${server.port}`;
  const desktop = await makeDeviceIdentity('Desktop', 'macOS', 'desktop');
  const mobile = await makeDeviceIdentity('Koryphaios Mobile', 'iOS', 'mobile', nativeCrypto);
  const desktopPeers = []; const mobilePeers = []; const requests = [];
  const peer = (identity) => ({ ...identity, online: true, allowAgents: false, linkedAt: Date.now() });
  const host = new DeviceClient({ ...desktop, relayUrl, peers: () => desktopPeers,
    onPairRequest: (request) => requests.push(request),
    onPaired: async (identity) => { desktopPeers.push(peer(identity)); },
    onRequest: async (_peer, operation) => ({ operation, workspaceId: 'desktop-owned-id' }),
  });
  const guest = new DeviceClient({ ...mobile, relayUrl, cryptography: nativeCrypto, peers: () => mobilePeers,
    onPairRequest: () => {}, onPaired: async (identity) => { mobilePeers.push(peer(identity)); },
    onRequest: async () => { throw new Error('Mobile does not host workspaces'); },
  });
  stops.push(() => host.stop(), () => guest.stop());
  const invitation = await host.invite();
  expect(invitation.qrUrl.startsWith('koryphaios://link-device?')).toBe(true);
  const link = parseDevicePairingLink(invitation.qrUrl);
  expect(link.relayUrl).toBe(relayUrl);
  expect(link.hostId).toBe(desktop.identity.id);
  await expect(guest.pair(link.code, 'a'.repeat(64))).rejects.toThrow('identity');
  const check = await guest.pair(link.code, link.hostId);
  await wait(() => requests.length === 1);
  expect(check.check).toBe(requests[0].check);
  expect(requests[0].identity.kind).toBe('mobile');
  expect(mobilePeers).toHaveLength(0);
  expect(desktopPeers).toHaveLength(0);
  await host.decidePair(mobile.identity.id, true);
  await wait(() => mobilePeers.length === 1);
  expect(await guest.rpc(desktop.identity.id, 'workspaces')).toEqual({ operation: 'workspaces', workspaceId: 'desktop-owned-id' });
});
