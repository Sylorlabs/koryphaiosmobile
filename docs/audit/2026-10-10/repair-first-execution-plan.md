# Koryphaios mobile: repair-as-you-audit execution plan

**Date:** 2026-10-10, America/Los_Angeles  
**Source of truth:** `/Users/Shared/micah/Documents/koryphaios` (desktop), checked against `/Users/Shared/micah/Documents/koryphaios-mobile` (Expo/React Native).  
**Existing trackers:** `mega-audit-execution-ledger.md`, `route-evidence-register.md`, `../../mobile-mega-audit-plan.md`, and this date's `fresh-visual-1949/screenshot-review.md` and `native-current/screenshot-review.md`.

## Release contract

The mobile app is a dependable remote streamer/controller for real desktop Koryphaios. It must expose intended host and agent controls without misleading users about connection state, work acknowledgement, progress, or persisted outcomes. Every claimed successful action needs an observable authoritative desktop result. A green unit test or a screenshot alone does not certify a route, control, or hardware class.

**Evidence grades** — `S`: source review; `T`: automated test; `N`: native simulator interaction; `H`: observed desktop/host acknowledgement and resulting state; `P`: signed build on physical hardware. Record which grades support each claim. Release-critical streaming and control paths need `T+N+H` on both direct and linked connections, plus `P` on representative hardware before release.

## Fix loop — apply after each confirmed issue

1. **Reproduce:** exact screen, device/window size, transport, connection and authorization state, steps, expected vs actual, screenshot/video and timestamp.
2. **Trace:** follow the mobile UI event through state/store, transport, backend action, desktop acceptance, and result rendering. Consult Expo SDK 57 versioned docs and `llms.txt` before changing Expo/React Native APIs.
3. **Classify:** P0 (blocked send/control, lost/incorrect identity or state, data/security issue), P1 (broken or misleading expected behavior, unusable screen, accessibility failure), P2 (polish). Record an issue ID.
4. **Repair:** the smallest complete fix for the observed cause; preserve unrelated local changes and desktop behavior; avoid native directory edits under Continuous Native Generation.
5. **Verify:** meaningful regression test, TypeScript/lint, device interaction, desktop-authoritative evidence if the issue involves a remote effect, and a screenshot at the triggering viewport. Recheck reconnect/offline/slow states.
6. **Close:** update the issue and route/device matrices with exact observed evidence, unresolved risks, and code reference. Do not close from green checks alone.

## Workstream A — truth and end-to-end remote operation (P0; first)

**A1.** Record desktop commit/working tree and mobile source/build identity before touching code. Preserve existing user changes. Inspect the existing desktop host's actual remote protocol, navigation/control surface, permissions, and authoritative persistence.

**A2.** Use a disposable host/user/chat fixture to exercise real create → select → send → at least three incremental streamed updates → completed assistant output. Observe both mobile transcript and desktop authoritative event sequence; compare message identity/order/contents and persisted state.

**A3.** Exercise cancel/stop, new send, thread switches, app background/foreground, socket interruption, replay-gap retry, duplicate/out-of-order events, and reconnect. Demand no missing, duplicated, or falsely completed messages. Verify on **direct** and **linked** transports; record the actual host acknowledgements.

**A4.** Test QR/link pairing, host selection and unlink races, expired/revoked credentials, cross-host isolation, Keychain persistence/restart and invalid secrets. No host switch may display another host's private data or send to an old host.

**A5.** Reproduce note editing/deletion with revision conflicts using disposable notes. The linked transport revision gap (`PAR-02`) is **fixed in source with failing-before/passing-after mobile and desktop regressions** as of October 10; remain **OPEN for native direct/linked action, desktop-authoritative deletion and stale-revision conflict**. Full mobile check **131/485/25** and desktop isolated workbench **10/66** passed. Do not call it fully resolved until the actual desktop effect is observed.

**A6.** `INSPECT-01` host/chat privacy: repro and source repair completed for late `inspect()` results after A→B, chat A→B and A→B→A; **three regressions red before / green after**, focused provider child **18/66**, full mobile **131/485/25**, Doctor **21/21**. The provider also rechecks on the direct-auth renewal path. Replay delayed Notes/Git/Agents reads through actual native controls and compare to desktop source owners in direct and linked modes before closing N/H. See [ledger](mega-audit-execution-ledger.md).

**Exit gate:** every critical command proves the desktop-side effect under both transports. Zero open P0, no false Connected/Completed/Failed states. Until then, do **not** call the app ready.

## Workstream B — 15-route visual, behavior, and accessibility sweep

Use the existing `route-evidence-register.md` as the exact route list; do not invent route equivalence. For **each** route capture: first load, content load, empty, offline, error, recovery, landscape and compact-width state (as applicable); tap controls; navigate back/deep link; exercise scrolling, keyboard and modal; check Dynamic Type (at least default/large), VoiceOver labels and order, ≥44-point touch targets, contrast and clipped text.

Capture stable, overlay-free screenshots. Development warning toasts and operating-system launch prompts are **test blockers** until isolated, not automatic production defects. Check safe areas against the status bar, home indicator, keyboard and iPad dock; test sheet dismissal, navigation history, focus restoration and no nested-scroll dead zones. Compare displayed options, permission boundaries, defaults and control semantics with the desktop app.

Prioritize workspace empty/refresh/offline state; chat list and composer; streamed transcript/command output; settings/Agent behavior; pairing/scanner; host picker; workbench; notes/files/preview/export; critical confirmations. For the known **19 advanced control kinds**, require open → change → save → authoritative readback → failure/retry and parity evidence; a rendered toggle is insufficient.

**Exit gate:** each route has `S+T+N` and each remote-changing control has `H`; zero broken or misleading P1 user journeys. Unsupported features must be explicitly indicated in UI and register.

## Workstream C — iOS device and iPad window matrix

| Device class | Required coverage |
| --- | --- |
| iPhone base / e | cold launch, onboarding, navigation, chats/streaming, keyboard and home-indicator safety |
| iPhone Pro | all 15 routes, agent/settings controls, performance reference |
| iPhone Pro Max | all critical flows, modal/deep-link dismissal, reachability and large-layout regressions |
| iPhone Air / thin class | compact-width and rotation/keyboard checks using available simulator or hardware |
| iPhone Duo / fold or dual-display class | Product has an announced outer/inner display; **actual native test remains unverified because no Duo device/simulator has been confirmed available**. Native test tooling advertising a Duo profile is not an installed runnable profile. Never infer from a Pro Max simulator. |
| iPad mini | all critical flows, split-screen compact layout, portrait/landscape, keyboard |
| iPad 11-inch and iPad Pro 13-inch | native multi-column/workspace layout, Stage Manager window resize, external keyboard and dock safe area |

For every class record simulator/runtime or hardware model, iOS version, app build, orientation/window size, screenshots, interaction and known gaps. Available iOS 27 simulators are not substitutes for signed TestFlight/physical-device checks. Explicitly mark unavailable profiles **unverified**.

**Exit gate:** no viewport overflow or unusable control at tested sizes; critical controls function on each available simulator class and representative real iPhone and iPad signed builds.

## Workstream D — responsiveness, stability, security, and release

- **Smoothness:** 30+ native samples for common navigation, composer keystrokes, chat selection, first streamed token, stop acknowledgment and reconnect. Report p50/p95 separately, warm vs cold, direct vs linked, Wi-Fi vs degraded network. Define thresholds from observed baseline and UX expectations before asserting success; include frame-drop/jank and memory evidence.
- **Soak:** a 60-minute streaming/control session with background/resume, screen lock/unlock, network switches, host sleep/reconnect and long conversations. Verify ordering and resource use after resumption.
- **Resilience:** deliberately inject lost/delayed acknowledgements, gaps, duplicate events, error payloads, timeouts, invalid URLs, authorization expiry, quota and disk/storage errors. Fail clearly and recover without unintended duplicate actions.
- **Security/privacy:** confirm token storage, permission/error boundaries, host identity across switches, signed media URLs, redaction of secrets from logs and screen captures; test destructive actions only in disposable fixtures.
- **Distribution:** Expo doctor and dependency compatibility, TypeScript/lint/tests, EAS development or signed release build, physical device acceptance, startup/permissions, deep links, release notes and rollback procedure. No App Store-ready claim without a signed build and actual hardware validation.

## Current evidence and decision

- **Latest run after `INSPECT-01`:** **131 tests / 485 assertions / 25 files, TypeScript and Expo lint clean**, plus **Expo Doctor 21/21**; provider child **18/66**, including four new tests. These describe source/automated/config evidence only; the five-device `native-current` review is visual, not native interaction certification.
- Fresh captures from iPhone 17 Pro, iPad mini and iPhone 17 Pro Max were visually inspected on 2026-10-10; route-level findings recorded in `fresh-visual-1949/screenshot-review.md`. Pro Max was blocked by a system deep-link confirmation; Pro had a development warning overlay; mini displayed Connected/Refreshing and an empty-chat state. No completed host-authoritative journey is evidenced.
- **Release decision: BLOCKED** by unverified direct/linked real host journeys, device interaction, physical/signed acceptance, and accessibility/performance gates.
- **Previous execution limitations:** historical automatic approval refusals are recorded in the ledger, with the affected actions left unexecuted at the time. Later independent file reads and PAR-02 source edits were executed successfully. Simulator and real-host operations still require explicit current evidence and cannot be assumed from earlier screenshots.

## Issue report template

`ID | severity | route/control | device/iOS/build | direct/linked | reproduction | expected/actual | root cause | patch | tests | native screenshot | desktop outcome | remaining risks | status`

Move on only after the current P0 has a targeted regression and a verified end-to-end result, or record a specific blocker and continue with independent P1 work. Review release gates after each completed sweep; no percentage-based 'ready' claim without per-control evidence.
