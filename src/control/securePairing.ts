import { requiredDeleteItem, requiredGetItem, requiredSetItem } from './safeSecureStore';

import type { PairingTarget } from '../types/control';

const pairingKey = 'koryphaios.mobile.pairing.v1';

export async function loadPairing(): Promise<PairingTarget | null> {
  const raw = await requiredGetItem(pairingKey);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as PairingTarget;
    if (!value.baseUrl || !value.token || !value.machineId) return null;
    return value;
  } catch {
    return null;
  }
}

export async function savePairing(target: PairingTarget): Promise<void> {
  await requiredSetItem(pairingKey, JSON.stringify(target));
}

export async function clearPairing(): Promise<void> {
  await requiredDeleteItem(pairingKey);
}
