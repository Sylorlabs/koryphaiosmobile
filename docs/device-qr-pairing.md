# Desktop QR pairing

Desktop **Link device → Phone or tablet → Generate QR code** now creates an
app-only `koryphaios://link-device` link. Scanning it opens the installed mobile
app's native pairing screen. It carries a protocol version, relay URL, one-time
code, and pinned desktop identity; it contains no desktop API token.

1. Scan the desktop QR using your phone's camera.
2. Tap **Link desktop** in Koryphaios Mobile.
3. Compare the six-digit check on both screens and approve on the desktop.
4. Choose the linked desktop to browse project folders and open or create chats.

For manual entry, choose **Copy app pairing link** on desktop and paste it into
**Machines → Link desktop with QR code**. The native flow uses the encrypted
device relay protocol, separately from direct-address HTTP control sessions.

The phone needs an HTTPS relay reachable from its network. A localhost relay
in a QR refers to the phone itself and is rejected by native pairing.

## Implementation

- `src/app/link-device.tsx`: Expo Router deep-link route; works on cold and warm launches.
- `src/components/DevicePairingView.tsx`: validates incoming link data, removes
  pairing parameters from route state, and shows verification numbers.
- `src/control/LinkedDeviceProvider.tsx`: native identity, host-confirmed pairing,
  reconnection, and encrypted device RPC.
- `src/control/linkedDeviceStorage.ts`: identity and per-desktop records in
  SecureStore. Invitations are not persisted.
- `src/control/deviceCryptoCore.ts`: native-compatible Noble primitives with
  secure randomness from `expo-crypto`; desktop wire-format interoperability.
- `src/components/LinkedDesktopPanel.tsx`: folder selection, chats, prompts,
  stop, interactive answers, and change review controls on linked desktops.

The app uses the local shared package at `../koryphaios/shared` so both projects
use the same pairing-link and transport contract. Keep the repositories beside
each other when installing dependencies.

`app.json` already registers the `koryphaios` scheme. Native builds must include
the newly installed `expo-crypto` module; create a new development/release build
after installing dependencies. Expo Go does not register this app-only scheme.

## Checks

```sh
npx tsc --noEmit
npx expo lint
bun test tests/native-device-pairing.test.js
```

The integration test starts a disposable real relay, generates a desktop QR
link, pairs a mobile identity using native crypto, verifies matching numbers,
requires desktop approval, and exchanges encrypted RPCs. Physical camera-to-app
launch should also be checked on installed iOS and Android builds.
