<p align="center">
  <img src="assets/kory-logo.png" width="120" alt="Koryphaios logo" />
</p>

<h1 align="center">Koryphaios Mobile</h1>

<p align="center">
  Phone and tablet control for a running Koryphaios desktop agent.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="Apache 2.0 license" /></a>
  <a href="https://docs.expo.dev/versions/v57.0.0/"><img src="https://img.shields.io/badge/Expo-57-000.svg" alt="Expo SDK 57" /></a>
  <img src="https://img.shields.io/badge/React%20Native-0.86-000.svg" alt="React Native 0.86" />
  <img src="https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20web-000.svg" alt="iOS, Android and web" />
</p>

---

The desktop runs the agent. The phone is the remote control. Your chats, workspaces, agents, notes and settings all live on the desktop, and the app talks to it. The phone holds a few keys and your unsent drafts, and not much else. The desktop always wins when the two disagree.

## Why

Koryphaios is a desktop coding agent. It is great at the desk and awkward from the sofa. This app exists so you can read a stream, approve a file change, answer a question or kill a runaway process without walking back to the machine.

Two design rules drive most of the code.

**The host is authoritative.** Every action is send, wait for acknowledgement, then read the host back. An acknowledgement is never treated as proof that the thing happened. If the app cannot confirm the result it says so and keeps the action locked so you cannot fire it twice.

**Everything is scoped.** Host, project, chat and prompt ids are baked into storage keys, component remount keys and effect guards. A slow reply from machine A can never land on machine B, even if you switch back and forth in between.

## What you can do

Fifteen routes, grouped by where they live in the app.

| Area | What it does |
| --- | --- |
| Workspace | Chat transcript, streaming output, composer, attachments, voice notes, model picker |
| Chats | Browse projects and chats, create, rename, archive, delete |
| Agents | Agent list with status, manager inbox, per agent thread, per agent model, send a message, stop it |
| Attention | Answer a question the agent asked, or accept or reject a change it wants to make |
| Activity | Background processes on the desktop, stdout and stderr, write to stdin, start and clean up |
| Controls | Chat controls, workflows, time travel, computer use, native commands, goals, checklists, git |
| Notes | Notes, drafts, revisions, trash, relations, bases, attachments, vault export |
| Memory | Memory documents, search, import and export |
| Teams | Shared workspaces and collaborators |
| Model sharing | Pooled model access and per agent limits |
| MCP | MCP server status, search, env keys, OAuth connect and disconnect |
| Media | Image and video generation, history, cancel |
| Billing | Plan, usage, export |
| Machine | Pair a desktop, rename it, inspect the device network, invite and unlink peers |
| Settings | Providers, agent, devices, MCP, notes, memory, skills, appearance, voice, billing, images, video, teams, archived, experimental, shortcuts, welcome |

The control surface is large because the desktop exposes a lot. The `RemoteClient` adapter dispatches 141 commands and 61 inspections.

## Pairing

There are two ways in.

**QR link, encrypted.** The desktop shows a QR code under Link device, Phone or tablet, Generate QR code. Scanning it opens the app on the pairing screen. The link carries a protocol version, a relay URL, a one time code and a pinned desktop identity. It carries no desktop API token.

The phone shows a six digit check number. You compare it with the number on the desktop and approve there. Pairing links expire after ten minutes.

Under the hood the phone registers an identity with the relay, opens a WebSocket with a subprotocol, and then every call is an encrypted device RPC rather than plain HTTP. Keys are P-256 ECDSA for signing, ECDH into HKDF-SHA256 for key agreement, then AES-256-GCM for the message envelope. The private key and the peer links live in the device keychain through expo-secure-store. The relay URL must be HTTPS.

**Direct address, plain HTTP.** Type the desktop address into Machines, Pair a machine. The app posts to the auth endpoint, gets a bearer token, and stores it in the Keychain. Polling runs every 3.5 seconds while the app is in the foreground. Live events arrive over a WebSocket at the same origin with the token in the query string, because browsers cannot set an Authorization header on a socket.

Direct mode is simpler to set up. Linked mode is the one you want on a network you do not control.

## Requirements

- Node 22.13 or newer, which is the minimum for Expo SDK 57
- Bun, for the test suite
- The desktop app from [sylorlabs/koryphaios](https://github.com/sylorlabs/koryphaios)
- macOS with Xcode 26.4 or newer for iOS, Android Studio for Android
- A physical device for the QR pairing flow, the iOS Simulator has no camera to scan with

## Setup

The two repos need to sit next to each other. The mobile app imports a local shared package that holds the pairing link format and the transport contract, and both sides have to agree on it byte for byte.

```bash
git clone https://github.com/sylorlabs/koryphaios.git
git clone https://github.com/Sylorlabs/koryphaiosmobile.git
cd koryphaiosmobile
npm install
```

That `file:../koryphaios/shared` dependency in `package.json` is why the layout matters. If you clone this repo on its own the install will fail. Publishing the shared package to a registry or vendoring it into the tree would fix it.

## Running it

```bash
npx expo start          # start the dev server
npx expo run:ios        # build and launch on iOS
npx expo run:android    # build and launch on Android
npx expo start --web    # web preview
```

Use a development build, not Expo Go. The app needs expo-secure-store, expo-camera, expo-crypto, expo-audio, expo-video, expo-file-system and expo-sharing, none of which Expo Go will give you. Expo Go also does not register the `koryphaios://` deep link scheme that the pairing QR depends on.

The web build is a preview only. Every screen renders and it can drive a desktop over direct HTTP, but it cannot link a device, it keeps no keys, and it persists no drafts.

## Shipping it

Native builds go through EAS so nobody needs Xcode on their machine.

```bash
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest build -p android --profile production
npx eas-cli@latest submit -p ios
```

The `ios` and `android` folders are not in the repo. Continuous Native Generation writes them, so native behavior is configured in `app.json` and in `plugins/with-ios-scene-lifecycle.js`, which opts the app into the UIScene lifecycle so iPad Split View and window resizing work.

## Checks

```bash
bun test tests/         # 171 tests across 46 files
npx tsc --noEmit        # typecheck
npx expo lint           # lint
npm run check           # all three
```

One test currently fails. It is `notes-control-ui-safety.test.tsx`, the case where an accepted note create comes back without an identity and the app has to explain the uncertain result without creating a second note. The suite is at 170 pass and 1 fail. The test expects the create button to re-enable after the user acknowledges the uncertain outcome, and the button stays disabled. The ledger in `docs/mobile-readiness.md` tracks it as a known open failure.

`expo-doctor` is also part of the normal loop. It currently runs 21 checks and 20 pass. The one failure is a patch version mismatch. Seven Expo packages sit a patch behind what SDK 57 wants, including `expo` itself, `expo-router` and `expo-crypto`. `npx expo install --fix` closes it.

## Layout

```
src/app/            expo-router routes, one file per screen
src/components/     UI, split by feature
src/control/        transport, state, crypto, storage
src/theme/          tokens and presets
src/types/          shared type definitions
src/native/         file, audio and speech helpers
tests/              46 test files
plugins/            local expo config plugins
scripts/            audit tooling
docs/               audit ledger and evidence
```

Routes live in `src/app` and everything else lives outside it. `_layout.tsx` files define the navigators.

## How it is put together

`LinkedDeviceProvider` sits at the top, then `ControlProvider`, then the themed root. The provider holds the snapshot, the live event state, the pairing target, the command statuses and the local stores for drafts and pending actions.

`RemoteClient` is the adapter. It takes a target and an optional transport. Without a transport it uses plain `fetch`. With one it turns each call into an encrypted workbench RPC. Both paths return the same shape, so nothing above the transport layer knows the difference.

The live channel has the same split. Direct mode opens a WebSocket at `/ws` and reads ordered events off an epoch and sequence cursor. Linked mode replays events over RPC in pages of 100. `mergeLiveManagerFeed` stitches live chunks into the stored transcript without duplicating a message that was already persisted.

Mutating commands go through a lifecycle. Running, then accepted, then reconcile, then success or warning. A failed reconcile downgrades to a warning rather than a failure, because the action may well have worked. A negative acknowledgement is never treated as a success.

Storage is split by how sensitive it is. Tokens, device identity, private keys, peer links and attention encryption keys go in the Keychain. Drafts go to the document directory, encrypted at rest with AES-256-GCM, and written to a staging file before an atomic move. Web builds stub all of it out, because a browser has no Keychain and a browser preview should not leave remote responses lying around in localStorage.

The `*.web.ts` files next to their native twins are how the platform split works. Metro picks the right one at bundle time.

## Theming

Nine presets ship in `src/theme/presets.ts`. Kintsugi is the default, and it is the one in the logo. Nord, Dracula, Catppuccin, Gruvbox, Tokyo and Solarized are dark. Light is the only light one. System follows the OS.

Eight accents are available. Gold is the default. The foreground colour on top of an accent is computed from relative luminance, so text stays readable on every accent.

Themes can also come from the desktop. The app reads the appearance settings from the host and follows them, including live, because the palette is resolved through a proxy and the style sheet getter re-reads it.

The layout is adaptive. Phones get a header, iPad and larger windows get a side rail with Workspace, Agents, Activity and Settings. Labels appear once there is room for them.

## Status

The automated suite is green apart from the one known Notes failure. The release decision in the ledger is still NO-GO, and that is on purpose. Source and test evidence is not the same as device evidence.

Still open: native device runs, real paired host operations, an independent desktop readback, VoiceOver and accessibility certification, a device matrix, performance and soak testing, and a signed physical build. The evidence vocabulary in `docs/mobile-readiness.md` is deliberate about which of those a given test actually proves.

## Docs

- [Readiness ledger](docs/mobile-readiness.md), the release decision and what each gate still needs
- [Device matrix](docs/device-matrix.md)
- [QR pairing](docs/device-qr-pairing.md), the protocol and the wire format
- [Desktop and mobile parity](docs/mobile-parity.md)
- [UX audit](docs/mobile-ux-audit.md)
- [Audit plan](docs/mobile-mega-audit-plan.md)
- [Agent notes](AGENTS.md), conventions for anyone editing this repo

## Contributing

Run `npm run check` before you open a pull request. If you touch anything under `src/control/`, add a test. The suite is where the safety properties live, not in review comments.

Keep the host authoritative and keep every scope explicit. If a new feature talks to the desktop, it needs a command in the adapter, an inspection if it needs to read state, and a test that covers the ambiguous result.

## License

Apache 2.0. See [LICENSE](LICENSE).
