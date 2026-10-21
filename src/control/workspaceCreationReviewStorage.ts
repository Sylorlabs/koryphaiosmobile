import { settingActionStorageKey } from './settingActionReviewKey';
import type { SettingActionReviewPersistence } from './settingActionReviewRegistry';

// iOS Keychain has historically refused entries above about 2048 bytes. Keep
// each encoded value comfortably under that limit, including non-ASCII text.
const maxEntryLength = 1200;
type ChunkManifest = { workspaceCreationChunks: number };

function chunkCount(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  const count = (value as Partial<ChunkManifest>).workspaceCreationChunks;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > 256) return 0;
  return count;
}

function validatedReview(value: unknown): { label: string } {
  if (!value || typeof value !== 'object' ||
    typeof (value as { label?: unknown }).label !== 'string' ||
    !(value as { label: string }).label.trim()) {
    throw new Error('Saved workspace creation review is invalid.');
  }
  return { label: (value as { label: string }).label };
}

// Load the native module only when a real creation review is accessed. The
// Workspace panel is also imported in native-independent UI tests.
export const workspaceCreationReviewStorage: SettingActionReviewPersistence = {
  async load(key) {
    const SecureStore = await import('expo-secure-store');
    const storageKey = settingActionStorageKey(key);
    const raw = await SecureStore.getItemAsync(storageKey);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    const count = chunkCount(parsed);
    if (count) {
      const parts: string[] = [];
      for (let index = 0; index < count; index++) {
        const chunk = await SecureStore.getItemAsync(`${storageKey}.${index}`);
        if (chunk === null) throw new Error('Saved workspace creation draft is incomplete.');
        parts.push(chunk);
      }
      return validatedReview(JSON.parse(decodeURIComponent(parts.join(''))));
    }
    return validatedReview(parsed);
  },
  async save(key, review) {
    const SecureStore = await import('expo-secure-store');
    const storageKey = settingActionStorageKey(key);
    const json = JSON.stringify(review);
    const encoded = encodeURIComponent(json);
    if (encoded.length <= maxEntryLength) {
      await SecureStore.setItemAsync(storageKey, json);
      return;
    }
    const count = Math.ceil(encoded.length / maxEntryLength);
    if (count > 256) throw new Error('Creation draft exceeds secure storage capacity.');
    // Commit the manifest only after every chunk exists. A failed save cannot
    // authorize sending the remote mutation, and a partial read fails closed.
    for (let index = 0; index < count; index++) {
      await SecureStore.setItemAsync(
        `${storageKey}.${index}`,
        encoded.slice(index * maxEntryLength, (index + 1) * maxEntryLength),
      );
    }
    await SecureStore.setItemAsync(storageKey, JSON.stringify({ workspaceCreationChunks: count } satisfies ChunkManifest));
  },
  async clear(key) {
    const SecureStore = await import('expo-secure-store');
    const storageKey = settingActionStorageKey(key);
    const raw = await SecureStore.getItemAsync(storageKey);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      const count = chunkCount(parsed);
      if (count) {
        // If chunk cleanup fails, retain the manifest and therefore the lock.
        for (let index = 0; index < count; index++) {
          await SecureStore.deleteItemAsync(`${storageKey}.${index}`);
        }
      } else {
        validatedReview(parsed);
      }
    }
    await SecureStore.deleteItemAsync(storageKey);
  },
};
