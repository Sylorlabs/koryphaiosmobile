# Koryphaios Mobile mega-audit execution checkpoint

Date: 2026-10-10, America/Los_Angeles. This checkpoint belongs to the [living nine-batch execution plan](../../../mobile-mega-audit-plan.md), [readiness register](../../../mobile-readiness.md), [parity ledger](../../../mobile-parity.md), [device matrix](../../../device-matrix.md), and [UX audit](../../../mobile-ux-audit.md).

## Verified changes and checks

- **Direct WebSocket bearer-format fix:** `RemoteClient.pair()` stores the token without `Bearer `, while HTTP control calls restore that prefix. `RemoteEventClient` previously constructed `/ws?auth=<stripped-token>`, inconsistent with the backend's documented Bearer validation. Changed `src/control/remoteEvents.ts` to construct `Bearer <token>` for the supported URL fallback. Existing already-prefixed stored values are normalized; native and desktop permission policies were not changed.
- **Regression:** `tests/remote-events.test.js` now verifies the `wss:`/`/ws` URL and Bearer query parameter for both stripped and already-prefixed tokens. This is an isolated client contract test, not a live authenticated handshake probe.
- **Full mobile check:** `npm run check` returned exit 0: **93 passing tests, 333 assertions in 14 files, zero failures; `tsc --noEmit` and `expo lint` passed**. Prior 92/329 figures refer to an earlier source state. Expo Doctor 21/21 and desktop 118 passing tests are from earlier checks, not rerun for this code-only change.
- **Environment:** `:8081/status` (Metro) and `:3001/api/health` (desktop) both responded HTTP 200 before the native check. iOS 27 iPhone 17 Pro simulator `4ADB02EE-1CC6-4433-909A-1B1F247FA068` and iPad mini A17 Pro simulator `8A73F4A1-3B96-4CCF-82CD-7CD850EA1F01` were booted. Existing native development clients were navigated to Workspace; no new binary was built.
- **Native connection recovery, presentation:** Visually inspected [iPhone Pro Workspace Connected](03-pro-workspace-after-auth-patch.png) and [iPad mini Workspace Connected](04-mini-workspace-after-auth-patch.png). Prior images showed `Connection lost · retrying` for the same host. The native state transition to Connected is supported by the screenshots, but real host mutation/stream acceptance was not exercised.
- **Screen-entry audit:** Captured Chats, Agents, Attention, Model and Machines on both devices and visually inspected the [contact sheet](contact-screens.png). The list of chats, manager agent, provider/model choices, empty Attention and Machines host status render in both views. Also captured Activity, Context, Controls, Settings and a later Workspace on both devices; these individual images remain unreviewed.

## Still open / stop-ship

1. **REL-02 / REL-01:** Controlled authenticated direct and linked send → incremental stream → stop → host state verification, plus repeated reconnect, app resume, backend restart, permission-denied and uncertain-acknowledgement paths. A Connected indicator alone is insufficient.
2. **DATA/ATT:** Existing automated regressions for draft ownership, duplicate send suppression and encrypted response recovery have passed. They still require actual native journeys against a controlled workspace.
3. **PAR/UX:** Every desktop capability mapped to the native UI, authorization and host result; complete interactive screen-state, touch, keyboard, Dynamic Type, VoiceOver and iPad resizable-window review. Ten screen-entry screenshots are a starting point, not full UX certification.
4. **DEV/PERF/DEP:** Other iPhone/iPad classes, iOS minimum target, Duo when simulator or physical hardware exists, release binary and hardware checks, p50/p95 responsiveness, genuine 60-minute workload and dependency advisory triage.
5. **Release:** A named binary/source fingerprint, TestFlight trial, crash data and release-specific privacy/security verification are outstanding. Current status **NOT RELEASE-READY**.

## Refused actions

Prior attempted Workspace source/test reads and an explicit authenticated WebSocket probe were refused by automatic safety review and were not retried. A later attempted Python/Pillow **second screenshot contact-sheet assembly** also failed with: “This tool call was blocked by OpenAI because we couldn't determine the safety status of the request.” No alternative execution was used to retry that operation; the saved individual captures remain intact. Explicit user confirmation is needed before retrying those refused actions, subject to platform permission.

## Immediate next runnable work

Use a **controlled, reversible test host/chat**, fresh native build fingerprint and approved test flow for first send/stream/stop on iPhone Pro and iPad mini, then repeat via linked transport. Keep separate actual-host acknowledgements and app rendering timestamps. Only after both pass should REL-02 move from partial fix to journey verified. Parallel independent tasks: source-level parity inventory, release-safe dependency triage and no-mutation device/window navigation and accessibility review.

## Later same-day Activity repair continuation

The older **93 / 333 / 14** figures above describe the bearer-format checkpoint, not the current source. After the Activity process-control and shared in-memory stdin store changes, the **latest `npm run check` passed 94 parent-suite tests / 334 expectations / 15 files**, including TypeScript and Expo lint. Activity's isolated child suite passed **16 tests / 151 expectations** (counted as one wrapper in the 94). New source is in `ActivityView.tsx`, `ControlProvider.tsx` and `processInputDrafts.ts`; test additions are in `activity-view.test.tsx`. No host mutation or deployment was run. See [Activity implementation evidence](../activity-fix/implementation-evidence.md) and updated `ACT-01`/`ACT-02`/`ACT-03` in [readiness](../../../mobile-readiness.md).

Historical Activity screenshots show an old nearly empty presentation; the two latest images labeled `activity-fix/01-pro-current.png` and `02-mini-current.png` were visually inspected as **Workspace** screens, so neither is accepted as Activity after-fix visual proof. Native Activity navigation/capture, real process control and the P0 direct/linked stream/stop fixture all remain open. Previous explicit auto-review refusals are still in force for the exact refused requests; no retry or alternate route was made in this continuation.
