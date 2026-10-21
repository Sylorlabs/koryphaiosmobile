import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { DeviceClient, makeDeviceIdentity, type DeviceBody } from '@koryphaios/shared/src/device-client';
import { DEVICE_PAIR_TTL, type DeviceIdentity } from '@koryphaios/shared/src/devices';
import { validateDevicePairingLink, type DevicePairingLink } from '@koryphaios/shared/src/device-pairing-link';
import { deviceCryptography } from './deviceCrypto';
import {
  loadDeviceIdentity, saveDeviceIdentity, loadDeviceLinks, saveDeviceLink, removeDeviceLink,
  loadActiveDeviceHost, saveActiveDeviceHost, clearActiveDeviceHostIfMatches,
  type MobileDeviceIdentity, type MobileDeviceLink,
} from './linkedDeviceStorage';

type PairCheck = { identity: DeviceIdentity; check: string; approved: boolean; expiresAt: number };
type Context = {
  links: MobileDeviceLink[]; activeHostId: string; ready: boolean; busy: boolean; error: string;
  verification: PairCheck | null;
  pair: (link: DevicePairingLink) => Promise<void>;
  cancelPairing: () => void;
  selectHost: (hostId: string) => Promise<void>;
  rpc: <T>(hostId: string, operation: string, input?: Record<string, unknown>, signal?: AbortSignal, timeoutMs?: number) => Promise<T>;
  subscribeEvents: (listener: (hostId: string, body: DeviceBody) => void) => () => void;
  unlink: (hostId: string) => Promise<void>;
};
const LinkedDeviceContext = createContext<Context | null>(null);

export function LinkedDeviceProvider({ children }: { children: React.ReactNode }) {
  const [links, setLinks] = useState<MobileDeviceLink[]>([]);
  const [activeHostId, setActiveHostId] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verification, setVerification] = useState<PairCheck | null>(null);
  const identity = useRef<MobileDeviceIdentity | null>(null);
  const savedLinks = useRef<MobileDeviceLink[]>([]);
  const clients = useRef(new Map<string, DeviceClient>());
  const pending = useRef<{ relayUrl: string; hostId: string; client: DeviceClient; approved: boolean } | null>(null);
  const busyRef = useRef(false);
  const clientQueue = useRef(Promise.resolve());
  const pairingGeneration = useRef(0);
  const eventListeners = useRef(new Set<(hostId: string, body: DeviceBody) => void>());

  useEffect(() => {
    let mounted = true;
    void Promise.all([loadDeviceIdentity(), loadDeviceLinks(), loadActiveDeviceHost()]).then(([saved, peers, active]) => {
      if (!mounted) return;
      identity.current = saved;
      savedLinks.current = peers;
      setLinks(peers);
      setActiveHostId(peers.some((link) => link.peer.id === active) ? active : '');
      setReady(true);
    }).catch(() => {
      if (mounted) { setError('Could not load saved device links'); setReady(true); }
    });
    const activeClients = clients.current;
    return () => { mounted = false; for (const client of activeClients.values()) client.stop(); };
  }, []);

  const forget = useCallback(async (hostId: string) => {
    await removeDeviceLink(hostId);
    savedLinks.current = savedLinks.current.filter((link) => link.peer.id !== hostId);
    setLinks([...savedLinks.current]);
    setActiveHostId((current) => current === hostId ? '' : current);
    try {
      await clearActiveDeviceHostIfMatches(hostId);
    } catch {
      // The peer has been removed durably, but active-host storage still needs
      // an explicit retry. A restart filters this stale selection by the peers.
      throw new Error('Desktop unlinked, but its saved selection could not be cleared. Restart the app to reconcile it.');
    }
  }, []);

  const selectHost = useCallback(async (hostId: string) => {
    if (hostId && !savedLinks.current.some((link) => link.peer.id === hostId))
      throw new Error('Link this desktop first');
    await saveActiveDeviceHost(hostId);
    setActiveHostId(hostId);
  }, []);

  const getClient = useCallback((relayUrl: string) => {
    const task = clientQueue.current.then(async () => {
      const existing = clients.current.get(relayUrl);
      if (existing) return existing;
      if (!identity.current) {
        const os = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Mobile';
        const created = await makeDeviceIdentity('Koryphaios Mobile', os, 'mobile', deviceCryptography);
        await saveDeviceIdentity(created);
        identity.current = created;
      }
      const client = new DeviceClient({
        relayUrl, ...identity.current, cryptography: deviceCryptography,
        peers: () => savedLinks.current.filter((link) => link.relayUrl === relayUrl).map((link) => link.peer),
        onConnection: (connected) => {
          for (const link of savedLinks.current) {
            if (link.relayUrl !== relayUrl) continue;
            for (const listener of eventListeners.current) {
              listener(link.peer.id, { type: 'transport.connection', connected });
            }
          }
        },
        onPairRequest: () => {},
        onPaired: async (peer) => {
          if (pending.current?.hostId !== peer.id || pending.current.client !== client) return;
          const attempt = pending.current;
          const previous = savedLinks.current.find((item) => item.peer.id === peer.id);
          const link: MobileDeviceLink = {
            relayUrl,
            peer: { ...peer, linkedAt: Date.now(), online: true, allowAgents: false },
          };
          try {
            await saveDeviceLink(link);
          } catch (caught) {
            setError('The desktop approved pairing, but this phone could not save the link. Try pairing again.');
            throw caught;
          }
          if (pending.current !== attempt) {
            if (previous) await saveDeviceLink(previous);
            else await removeDeviceLink(peer.id);
            return;
          }
          savedLinks.current = [...savedLinks.current.filter((item) => item.peer.id !== peer.id), link];
          setLinks([...savedLinks.current]);
          try {
            await saveActiveDeviceHost(peer.id);
          } catch (caught) {
            setError('Desktop linked, but this phone could not save the active selection. Tap Open to retry.');
            throw caught;
          }
          setActiveHostId(peer.id);
          setVerification((check) => check?.identity.id === peer.id ? { ...check, approved: true } : check);
          attempt.approved = true;
        },
        onRequest: async () => { throw new Error('Mobile devices do not host workspaces'); },
        onEvent: (peer, body: DeviceBody) => {
          for (const listener of eventListeners.current) listener(peer.id, body);
          if (body.type === 'unlinked') void forget(peer.id).catch(() => setError('Could not remove revoked link'));
          if (body.type === 'pair-rejected' && pending.current?.hostId === peer.id) {
            pending.current = null;
            setVerification(null);
            setError('The desktop declined the link. Generate a new QR code to try again.');
          }
        },
      });
      clients.current.set(relayUrl, client);
      return client;
    });
    clientQueue.current = task.then(() => {}, () => {});
    return task;
  }, [forget]);

  const cancelPairing = useCallback(() => {
    pairingGeneration.current++;
    const attempt = pending.current;
    pending.current = null;
    if (attempt && !attempt.approved) {
      attempt.client.stop();
      clients.current.delete(attempt.relayUrl);
    }
    setVerification(null);
  }, []);

  useEffect(() => {
    if (!verification || verification.approved) return;
    const timer = setTimeout(() => {
      cancelPairing();
      setError('Pairing expired. Generate a new QR code on your desktop.');
    }, Math.max(0, verification.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [verification, cancelPairing]);

  const pair = useCallback(async (input: DevicePairingLink) => {
    if (!ready || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    cancelPairing();
    const generation = pairingGeneration.current;
    try {
      const link = validateDevicePairingLink(input);
      if (new URL(link.relayUrl).protocol !== 'https:')
        throw new Error('Generate a QR using an HTTPS relay reachable from this phone.');
      const client = await getClient(link.relayUrl);
      if (generation !== pairingGeneration.current) return;
      const attempt = { relayUrl: link.relayUrl, hostId: link.hostId, client, approved: false };
      pending.current = attempt;
      const result = await client.pair(link.code, link.hostId);
      if (generation === pairingGeneration.current)
        setVerification({ ...result, approved: attempt.approved, expiresAt: Date.now() + DEVICE_PAIR_TTL });
    } catch (caught) {
      if (generation === pairingGeneration.current) {
        cancelPairing();
        setError(caught instanceof Error ? caught.message : 'Could not link desktop');
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [ready, cancelPairing, getClient]);

  const rpc = useCallback(async <T,>(
    hostId: string,
    operation: string,
    input: Record<string, unknown> = {},
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<T> => {
    const link = savedLinks.current.find((item) => item.peer.id === hostId);
    if (!link) throw new Error('Link this desktop first');
    const client = await getClient(link.relayUrl);
    await client.connect();
    return client.rpc(hostId, operation, input, 'user', signal, timeoutMs);
  }, [getClient]);

  const subscribeEvents = useCallback((listener: (hostId: string, body: DeviceBody) => void) => { eventListeners.current.add(listener); return () => { eventListeners.current.delete(listener); }; }, []);

  const unlink = useCallback(async (hostId: string) => {
    const link = savedLinks.current.find((item) => item.peer.id === hostId);
    if (link) {
      const client = await getClient(link.relayUrl);
      await client.connect().then(() => client.send(link.peer, { type: 'unlinked' })).catch(() => undefined);
    }
    await forget(hostId);
  }, [forget, getClient]);

  return <LinkedDeviceContext.Provider value={{ links, activeHostId, ready, busy, error, verification, pair, cancelPairing, selectHost, rpc, subscribeEvents, unlink }}>{children}</LinkedDeviceContext.Provider>;
}

export function useLinkedDevices() {
  const context = useContext(LinkedDeviceContext);
  if (!context) throw new Error('LinkedDeviceProvider is missing');
  return context;
}
