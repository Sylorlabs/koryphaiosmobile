# Audit execution: agent message preservation and recovery

Date: October 10, 2026 (America/Los_Angeles). Status: **source improvements / focused tests pass; full suite fails one isolated UI bootstrap; native and host unverified.**

## Goal

Prevent loss, cross-host delivery, duplicate delivery, or silent replay of agent-directed messages across device restart, connection uncertainty, storage failure, edits, and navigation. A command is *confirmed* only when the named desktop host reports the corresponding result; a resolved JavaScript promise alone does not prove desktop work.

## Applied source work

- `src/control/agentMessageDrafts.ts` supplies host, machine, project, chat and agent-scoped versioned drafts with serial persistence, bounded snapshots, pending-send preflight, explicit unknown-outcome recoveries, restart hydration and user-triggered restore/discard. Added ingress validation for destination identity and a 250-destination limit so newly written data cannot exceed the reader's supported format.
- `src/components/AgentDetailView.tsx` uses the durable draft store during message entry/send and displays recovery, persistence, and unknown-send feedback. Corrected the draft error text interpolation and an unused error binding. This UI has **not** been visually or interaction verified on an updated native build.
- `tests/agent-message-drafts.test.ts` adds an isolated eight-case/51-assertion child suite: cold restart and destination isolation, interrupted send, preflight storage failure, failed pending marker, edit/race preservation, failed recovery, malformed/oversized storage, and destination bounds. The parent wrapper also passes.

## Fresh tool evidence

| Check | Result | Claim allowed |
| --- | --- | --- |
| `KORYPHAIOS_AGENT_DRAFTS_CHILD=1 bun test tests/agent-message-drafts.test.ts` | **8 pass / 51 expectations** | State/store contract with fake persistent backend. No native storage claim. |
| `bun test tests/agent-message-drafts.test.ts` | **1 parent pass** | Isolated suite launches successfully. |
| `bun test tests/` | **139 pass / 1 fail / 538 expectations / 28 files**, exit 1 | Other parent suites pass; no overall green build. |
| `npm run typecheck` | **pass**, exit 0 | TypeScript compiles. |
| `npm run lint` | **pass**, zero warnings/errors, exit 0 | Expo lint is clean. |
| `npx expo-doctor` | **21/21**, exit 0 | Dependencies/config compatible by Doctor checks. |
| `npx expo export --platform ios --output-dir /tmp/koryphaios-ios-audit-20261010-final` | **pass**; 3,697 JS modules, 7.7 MB Hermes bundle, exit 0 | iOS JS bundling succeeds; no native binary/signing/launch claim. |

## Blocking failure and access gap

The existing `tests/agent-controls.test.tsx` isolated child fails before executing assertions: `ReferenceError: __DEV__ is not defined` at `node_modules/expo/src/async-require/setup.ts:6:3`. Agent draft store runtime import now pulls in native Expo persistence during that Bun test's initialization. Repair the native storage mock/bootstrap and `AppState` mock in that isolated test, then update its failed-send assertions to verify explicit recovery and no early remote dispatch. The isolated UI case is **not** passing.

Two source-inspection requests covering `ControlProvider.tsx`, `AgentDetailView.tsx` and the existing agent-control/provider test fixtures were blocked by automatic approval review with an **indeterminate safety status**. Those reads were not retried. No background flush was added to `ControlProvider.tsx`; recheck that app suspension persists agent drafts once the specific source inspection has approval. There is no validated native interaction or screenshot from this audit cycle.

## Next repair loop (in execution order)

1. **P0: Restore green source gate.** Review the isolated `agent-controls` test mock after the inspection block is resolved, stub Expo storage and AppState before dynamic component imports, assert no dispatch until two durable saves and no replay after unknown outcome. Run focused suite, full `npm run check` and Doctor.
2. **P0: Native durability.** Verify Keychain + encrypted file storage on a named iPhone and iPad build: enter text, switch host/chat/agent, force quit, relaunch, deny storage, revoke key and recover. Inspect full-screen error/recovery UI at large text. Include background-triggered flushing in the app's lifecycle and repeat.
3. **P0: Actual desktop contract.** Pair a disposable, fingerprinted direct host and a linked host. Execute create chat → select agent → message → at least three incremental stream chunks → stop → host-side transcript/state reconciliation. Repeat under A→B→A, network loss, stale response and repeated tap. Preserve unknown outcomes until the desktop confirms them.
4. **P0: Destructive and high-impact permissions.** Verify all delete/reset/stop/approve and model/workflow controls against desktop API ownership and authorization, using disposable fixtures. A UI acknowledgement is insufficient.
5. **P1: Screenshot and accessibility audit.** Fresh screenshots of each important journey and error state on iPhone small/base/Pro/Pro Max and iPad mini/base/Pro, plus Duo outer/inner when a suitable simulator/build exists. Review VoiceOver labels/order, large Dynamic Type, safe areas, keyboard, orientation, window resizing, contrast and interactive target size. Document screenshot, step, severity, and actual behavior for each finding.
6. **P1: Performance and stability.** Capture p50/p95 from 30+ samples for tap feedback, selection, request, stream first chunk, scroll and reconnect, plus dropped frames during 500+ messages. Complete a logged 60-minute on-device stream/control/background/foreground soak; measure memory, connection count, crash/thermal and reconnect behavior.
7. **Ship gate.** No open P0; all intended desktop command parity states observed on hosts; phone and tablet real-device smoke; zero failing full-suite tests; signed release build; completed permissions/privacy and crash instrumentation. Mark any unsupported hardware case explicitly rather than inferring support from source or simulator dimensions.

Until source, native, and actual desktop proof agree, classify this work as an improving internal prototype rather than release ready.
