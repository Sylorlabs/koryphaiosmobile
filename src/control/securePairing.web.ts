import type { PairingTarget } from '../types/control';

let pairing: PairingTarget | null = null;

export async function loadPairing(): Promise<PairingTarget | null> {
  return pairing;
}

export async function savePairing(target: PairingTarget): Promise<void> {
  pairing = target;
}

export async function clearPairing(): Promise<void> {
  pairing = null;
}
