# REL-02: Connected REST host versus lost Workspace live channel

**Observed:** October 10, 2026, America/Los_Angeles. **Priority:** P0 / stop release pending proof of connected controls. **Status:** Reproduced on two iOS 27 simulators, then a client-side bearer-format fix produced native `Connected` on both. Full send/stream/stop and recovery remain unverified. Do not interpret a successful health response or connected indicator as an executed host command.

## Reproduction and evidence

1. Desktop Bun backend is reachable at `127.0.0.1:3001`, with GET `/api/health` returning HTTP 200. Metro at `127.0.0.1:8081/status` also returns HTTP 200 on October 10. The earlier controlled local-auth probe returned HTTP 200 for `/api/auth/session` and the authenticated sessions/workspace/providers/agent settings/processes/goals REST snapshots. Token content was not logged.
2. iPhone 17 Pro (iOS 27 simulator, installed dev build) opens `koryphaios:///machines`: [native Machines image](connected-attempt/iphone17pro-machines.png) displays green Koryphaios backend, 227 ms remote-host health, enabled Disconnect.
3. The same device opens `koryphaios:///workspace`: [native Workspace image](connected-attempt/iphone17pro-workspace-later.png) displays red **“Koryphaios · backend · Connection lost · retrying,”** no selected chat and a disabled composer.
4. iPad mini (A17 Pro, iOS 27 simulator) reproduces the discrepancy: [Machines 232 ms, captured during navigation](connected-attempt/ipadmini-machines-early.png), then [settled Workspace with red lost state](connected-attempt/ipadmini-workspace-later.png). The iPad also shows a blue **“Refreshing…”** development indicator; assess stable/release UI separately.

No native send/stream/stop or host control outcome was obtained; the installed app is a development build from October 6 and the exact served JavaScript fingerprint is unknown. These screenshots do not certify the current source on a fresh native build.

## Known implementation boundary and resolved client mismatch

- Desktop `backend/src/server.ts` upgrades `/ws`, checking an Authorization header, the WebSocket subprotocol fallback or deprecated `?auth=` query. It calls `validateLocalBearerToken`, which delegates to the local-auth session validator. `backend/src/auth/local-route-auth.ts` constructs a token prefixed with `Bearer `.
- Source inspection established that `RemoteClient.pair()` strips the `Bearer ` prefix before storing the token; regular HTTP requests restore it, but the WebSocket query previously sent only the stripped value. The server's WebSocket route uses the same Bearer validator as REST. A client fix now restores the prefix for the WebSocket fallback (and avoids doubling it if a stored token already contains one). That aligns the formats and correlates with the two native Workspaces becoming `Connected`. A separately instrumented authenticated handshake trace was refused, so precise rejection codes from before the patch are still unknown.
- Machine health/snapshot polling and live event connection are separate gates. A green indicator must specify what was checked and must not imply that commands can stream when the live channel is down.

## October 10 patch and native spot check

1. Changed `src/control/remoteEvents.ts` to encode the WebSocket `auth` fallback as `Bearer <token>`; no desktop authentication checks or grants changed. Added a URL contract regression in `tests/remote-events.test.js` for both stripped and already-prefixed tokens.
2. Ran `npm run check` after the edit: **93 tests passed, 333 assertions across 14 files; TypeScript and Expo lint passed, exit 0.**
3. Metro (`:8081`) and the desktop health endpoint (`:3001`) both responded 200. Navigated the existing dev-client installs to Workspace with simulator deep links. Visually inspected the resulting [iPhone 17 Pro Connected screenshot](plan-run/03-pro-workspace-after-auth-patch.png) and [windowed iPad mini Connected screenshot](plan-run/04-mini-workspace-after-auth-patch.png). Both previously showed `Connection lost · retrying`. Captured Chats, Agents, Attention, Model, Machines, Activity, Context, Controls, Settings and Workspace route entries on both simulators; the first five routes were reviewed as a [contact sheet](plan-run/contact-screens.png).
4. The app remained connected while navigating to the subsequent screens and the machine list continued showing the host online. The app is an existing development build served by Metro; a source/binary fingerprint and actual host command outcome are still missing. A later contact-sheet generation operation was explicitly refused by automated safety review, so the second set of route screenshots was saved but not reviewed as a group.

**Partial result:** Native connection presentation changed from disconnected to connected on both simulators after the client fix. Do not mark REL-02 closed or classify the full remote control as proven until a controlled host send → incremental stream → stop succeeds and host outcomes match.

## Exact outstanding steps

1. With explicit authorization for the previously refused Workspace source/test inspection and authenticated WebSocket probe, optionally capture handshake status, open/close/error events and host/transport identity without credentials or query strings. The refused probe was not retried. The source-only patch and existing-app navigation do **not** substitute for that probe.
2. Install a freshly fingerprinted native candidate on both devices, pair/select a controlled chat, send → receive incremental output → stop and compare actual host state. Run server restart, dropped/returned network, app background/foreground, chat A→B→A and an uncertain acknowledgement. Confirm no duplicate submission, retained drafts/attention and clear recovery UI. Repeat via linked transport when fixture is available.
3. Save timed native evidence and update `REL-02`, parity, device matrix and UX ledgers. Require actual successful end-to-end native control before closing P0.

**Result:** Client Bearer formatting has an automated regression and two native Connected captures. Neither an authenticated probe nor an end-to-end native streaming result has been obtained. Product remains **not release-ready**.
