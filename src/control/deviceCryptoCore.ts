import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { gcm } from '@noble/ciphers/aes.js';
import {
  decode64, encode64, DEVICE_WIRE_LIMIT,
  type DeviceCryptography, type DeviceEnvelope,
} from '@koryphaios/shared/src/devices';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const encodeUrl64 = (bytes: Uint8Array) => encode64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function decodeUrl64(value: string) {
  return decode64(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
}
function publicBytes(key: JsonWebKey) {
  if (key.kty !== 'EC' || key.crv !== 'P-256' || !key.x || !key.y || key.d)
    throw new Error('Invalid device public key');
  const x = decodeUrl64(key.x);
  const y = decodeUrl64(key.y);
  if (x.length !== 32 || y.length !== 32) throw new Error('Invalid device public key');
  const point = new Uint8Array([4, ...x, ...y]);
  p256.Point.fromBytes(point).assertValidity();
  return point;
}
function privateBytes(key: JsonWebKey) {
  if (key.kty !== 'EC' || key.crv !== 'P-256' || !key.d) throw new Error('Invalid device private key');
  const bytes = decodeUrl64(key.d);
  if (!p256.utils.isValidSecretKey(bytes)) throw new Error('Invalid device private key');
  return bytes;
}
function header(envelope: Omit<DeviceEnvelope, 'signature' | 'ciphertext'>) {
  return JSON.stringify([envelope.version, envelope.from, envelope.to, envelope.id, envelope.timestamp, envelope.iv]);
}
function encryptionKey(privateKey: JsonWebKey, publicKey: JsonWebKey, from: string, to: string) {
  // WebCrypto ECDH deriveBits returns the shared point's X coordinate only.
  const bits = p256.getSharedSecret(privateBytes(privateKey), publicBytes(publicKey), false).slice(1, 33);
  return hkdf(sha256, bits, encoder.encode('kory-device-v1'), encoder.encode([from, to].sort().join(':')), 32);
}

/** Wire-compatible native crypto, with randomness supplied by expo-crypto. */
export function createNativeDeviceCryptography(
  randomBytes: (length: number) => Uint8Array,
  randomUUID: () => string,
): DeviceCryptography {
  const deviceDigest = async (text: string) => hex(sha256(encoder.encode(text)));
  const pairingHash = async (value: string) => {
    const normalized = value.replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{20}$/.test(normalized)) throw new Error('Enter the 20-character device code');
    return deviceDigest(normalized);
  };
  const deviceSign = async (key: JsonWebKey, text: string) => encode64(
    p256.sign(encoder.encode(text), privateBytes(key), { prehash: true, lowS: false, format: 'compact' }),
  );
  const verify = (key: JsonWebKey, text: string, signature: string) => {
    try {
      return p256.verify(decode64(signature), encoder.encode(text), publicBytes(key), { prehash: true, lowS: false, format: 'compact' });
    } catch {
      return false;
    }
  };
  return {
    randomBytes, randomUUID, deviceDigest, pairingHash, deviceSign,
    async createDeviceKeys() {
      let secret = randomBytes(32);
      while (!p256.utils.isValidSecretKey(secret)) secret = randomBytes(32);
      const point = p256.getPublicKey(secret, false);
      const publicKey: JsonWebKey = {
        kty: 'EC', crv: 'P-256', x: encodeUrl64(point.slice(1, 33)), y: encodeUrl64(point.slice(33)),
        ext: true, key_ops: ['verify'],
      };
      return { publicKey, privateKey: { ...publicKey, d: encodeUrl64(secret), key_ops: ['sign'] } };
    },
    async deviceKeyId(key) {
      publicBytes(key);
      return deviceDigest(`${key.crv}:${key.x}:${key.y}`);
    },
    async pairingCheck(code, a, b, nonce) {
      const hash = sha256(encoder.encode([await pairingHash(code), ...[a, b].sort(), nonce].join(':')));
      const digits = (new DataView(hash.buffer, hash.byteOffset, hash.byteLength).getUint32(0) % 1_000_000).toString().padStart(6, '0');
      return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    },
    async sealDeviceMessage(privateKey, peer, from, body) {
      const envelope = { version: 1 as const, from, to: peer.id, id: randomUUID(), timestamp: Date.now(), iv: encode64(randomBytes(12)) };
      const plaintext = encoder.encode(JSON.stringify(body));
      if (plaintext.length > DEVICE_WIRE_LIMIT / 2) throw new Error('Device message is too large');
      const ciphertext = encode64(gcm(encryptionKey(privateKey, peer.publicKey, from, peer.id), decode64(envelope.iv), encoder.encode(header(envelope))).encrypt(plaintext));
      return { ...envelope, ciphertext, signature: await deviceSign(privateKey, `${header(envelope)}:${ciphertext}`) };
    },
    async openDeviceMessage(privateKey, peer, ownId, envelope, now = Date.now()) {
      if (envelope.version !== 1 || envelope.to !== ownId || envelope.from !== peer.id ||
          !Number.isFinite(envelope.timestamp) || Math.abs(now - envelope.timestamp) > 120_000 ||
          typeof envelope.id !== 'string' || envelope.id.length > 64 ||
          typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > DEVICE_WIRE_LIMIT ||
          decode64(envelope.iv).length !== 12) throw new Error('Invalid or expired device message');
      if (!verify(peer.publicKey, `${header(envelope)}:${envelope.ciphertext}`, envelope.signature))
        throw new Error('Device signature rejected');
      const plaintext = gcm(encryptionKey(privateKey, peer.publicKey, envelope.from, envelope.to), decode64(envelope.iv), encoder.encode(header(envelope))).decrypt(decode64(envelope.ciphertext));
      return JSON.parse(decoder.decode(plaintext));
    },
  };
}
