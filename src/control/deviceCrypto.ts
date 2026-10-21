import * as Crypto from 'expo-crypto';
import { createNativeDeviceCryptography } from './deviceCryptoCore';

export const deviceCryptography = createNativeDeviceCryptography(
  (length) => Crypto.getRandomValues(new Uint8Array(length)),
  () => Crypto.randomUUID(),
);
