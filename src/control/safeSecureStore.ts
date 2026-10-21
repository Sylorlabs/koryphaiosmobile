import * as SecureStore from 'expo-secure-store';

// Pairing credentials and device identity must be durable. A failed native
// Keychain operation must reach the caller instead of looking like success.
export async function requiredGetItem(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export async function requiredSetItem(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function requiredDeleteItem(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

export async function safeGetItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function safeSetItem(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Storage failures should not prevent the remote client from opening.
  }
}

export async function safeDeleteItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Storage failures should not prevent the remote client from opening.
  }
}
