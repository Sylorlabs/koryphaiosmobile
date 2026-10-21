import type { Machine, MachineStatus, PairingTarget, RemoteEventState } from '../types/control';

/** Keep the saved host identity visible while a snapshot is unavailable. */
export function machineDisplayName(machine: Pick<Machine, 'id' | 'name'>, pairing: PairingTarget | null): string {
  if (!pairing) return 'Pair machine';
  if (machine.id === 'unpaired' || !machine.name.trim()) {
    return pairing.machineName?.trim() || 'Paired machine';
  }
  return machine.name;
}

/** REST reachability and the live command/event connection must be shown separately. */
export function machineLivePresentation(
  paired: boolean,
  machineStatus: MachineStatus,
  liveConnection: RemoteEventState['connection'],
): { status: MachineStatus; label: string } {
  if (!paired) return { status: 'offline', label: 'Not paired' };
  if (machineStatus === 'offline') return { status: 'offline', label: 'Desktop offline' };
  if (machineStatus === 'connecting') return { status: 'connecting', label: 'Checking desktop' };
  if (liveConnection === 'connected') return { status: 'online', label: 'Live connected' };
  if (liveConnection === 'connecting') return { status: 'connecting', label: 'Desktop online · live reconnecting' };
  if (liveConnection === 'error') return { status: 'offline', label: 'Desktop online · live connection lost' };
  return { status: 'offline', label: 'Desktop online · live disconnected' };
}

export function isHostConnectionError(message: string): boolean {
  return /fetch failed|failed to fetch|network request failed|could not connect to the server|connection refused|ECONNREFUSED|ECONNRESET|ENETUNREACH|ETIMEDOUT|network is unreachable/i.test(message);
}

/** Native fetch exceptions include internal Swift paths that should never appear in UI copy. */
export function readableControlError(message: string, pairing: PairingTarget | null): string {
  if (isHostConnectionError(message)) {
    return pairing
      ? `Can't reach ${pairing.machineName || 'your desktop'}. Check that Koryphaios is running and the devices can reach each other, then retry.`
      : 'Could not reach that desktop. Check its address and that Koryphaios is running, then try pairing again.';
  }
  const cleaned = message.replace(/\s*\(at ExpoModulesCore\/[^)]*\)/g, '').trim();
  if (/^(?:not found|404(?: not found)?)$/i.test(cleaned)) {
    return pairing
      ? "The desktop couldn't find this request. Check Machines and refresh."
      : 'The desktop could not find the request. Check its address and try pairing again.';
  }
  return cleaned;
}
