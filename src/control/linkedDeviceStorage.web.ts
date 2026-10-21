import type { MobileDeviceIdentity, MobileDeviceLink } from './linkedDeviceStorage';

// Native device pairing belongs to the installed app. Web previews retain no keys.
let identity: MobileDeviceIdentity | null = null;
let links: MobileDeviceLink[] = [];
let activeHost = '';
export async function loadDeviceIdentity() { return identity; }
export async function saveDeviceIdentity(value: MobileDeviceIdentity) { identity = value; }
export async function loadDeviceLinks() { return links; }
export async function saveDeviceLink(value: MobileDeviceLink) {
  links = [...links.filter((link) => link.peer.id !== value.peer.id), value];
}
export async function removeDeviceLink(id: string) { links = links.filter((link) => link.peer.id !== id); }
export async function loadActiveDeviceHost(): Promise<string> { return activeHost; }
export async function saveActiveDeviceHost(id: string): Promise<void> { activeHost = id; }
export async function clearActiveDeviceHostIfMatches(id: string): Promise<boolean> {
  if (!id || activeHost !== id) return false;
  activeHost = '';
  return true;
}
