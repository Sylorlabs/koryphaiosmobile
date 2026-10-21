# Koryphaios Mobile — route-by-route native acceptance register

**Latest validation note — October 10, 2026, approximately 23:05 PDT:** The source inventory remains **15 Expo Router screens/redirects plus one `_layout.tsx` and 19 child-control kinds**. Fresh mobile `npm run check` **145 pass / 0 fail / 550 assertions / 31 files**, TypeScript and Expo lint green, `expo-doctor` **21/21**. Machines device rename-draft race reproduced and repaired with **17/127** isolated child passing. Agent Send and a11y source fixes remain included. **No route, connected native control journey, desktop effect or signed/physical iOS build gained N/H/P evidence.** See [execution ledger](mega-audit-execution-ledger.md).

Updated 2026-10-10. **Release: BLOCKED.** Desktop authority: `/Users/Shared/micah/Documents/koryphaios`; Expo mobile checkout: `/Users/Shared/micah/Documents/koryphaios-mobile`.

This is the executable screen coverage register for [the mega audit](../../mobile-mega-audit-plan.md) and [the execution ledger](mega-audit-execution-ledger.md). The source-route inventory below was checked against the current `src/app/` checkout. **A route existing in source, a rendered old simulator image and an automated test are distinct from passing a current native user journey.** Do not infer coverage from a working `Connected` label.

## Evidence levels

For each route/control record: **S** = source and behavior traced to desktop route; **T** = reproducible automated regression; **N** = fresh identified native binary screenshot + actual touch/keyboard behavior; **H** = resulting effect independently observed on the intended desktop; **P** = signed candidate/physical device. Each level requires its own dated evidence path, device/OS/build, transport and expected/actual outcome. `open` below means no fresh end-to-end certification from this pass, even where historical partial screenshots or tests exist.

## Actual Expo Router surface inventory

| Route | Rendered source / behavior | Native journey required | Gate |
| --- | --- | --- | --- |
| `/` | Redirect → `/workspace` | Cold start, deep-link/cached navigation, no back loop | Open N |
| `/workspace` | `WorkspaceView` in `AdaptiveShell` | Active host/chat/project visibility; 3+ streamed output increments; send/stop/reconnect and authoritative result | Open N/H, **P0** |
| `/chats` | `MobileChatsView` | Select/create/rename/delete; wrong-host prevention; draft/scroll retention | Open N/H, **P0** |
| `/agents` | `AgentsView` in shell | List/status/selection, empty/error and live changes | Open N/H |
| `/agent/[id]` | `AgentDetailView` or unavailable state | Valid, missing, removed agent; action owner, attention and stale-route recovery | Open N/H |
| `/activity` | `ActivityView` in shell | Process action, status pending→reconciled; partial failure and interruption | Open N/H |
| `/attention` | `MobileAttentionView` | Answer/decline question and review; stale prompt, concurrent resolution, restart | Open N/H, **P0** |
| `/context` | Redirect → `/workspace?context=1` | Context opened, back/focus behavior and non-loss of draft | Open N |
| `/controls` | `MobileControlHub` | All controls discoverable, reachable and bound to current host | Open N/H |
| `/control/[kind]` | `MobileWorkspaceControlView` | Each child mode below; scope and permissions; error/recovery states | Open N/H, **P0** for mutations |
| `/machines` | `MachinesView` in shell | Pair/revoke/switch A→B→A, stale offline, active machine indication | Open N/H, **P0** |
| `/link-device` | `DevicePairingView` in shell | Paste/QR, permission denial, duplicate scan, approve/deny, restart, revocation | Open N/H, **P0** |
| `/model` | `MobileModelView` | Provider/model/reasoning mode actually used in next desktop run | Open N/H |
| `/settings` | `SettingsView` in shell | Safe editing, destructive confirmation, denied/unknown results | Open N/H, **P0** for destructive actions |
| `/settings/[section]` | `SettingsSectionView` in shell | Every section's loaded/invalid route, controls and persisted desktop effect | Open N/H |

`/control/[kind]` currently branches to **19** kinds in `MobileWorkspaceControlView.tsx`: `session`, `workflows`, `history`, `computer`, `commands`, `memory`, `notes`, `teams`, `modelSharing`, `mcp`, `media`, `billing`, `workspace`, `preferences`, `responseStyle`, `skills`, `goals`, `checklists`, `git`. Inspect each independently in direct and linked mode; do not treat one successful kind as covering the others.

## Required state and interaction passes

For every actual rendered surface and child mode, record separate **unpaired / loading / empty / populated / in-flight / error or permission denied / offline / recovering** captures where applicable. Perform the action and inspect its effect; screenshots alone do not prove command ownership or responsiveness. Include large Dynamic Type, VoiceOver focus/labels, keyboard opened and dismissed, dark/light mode, safe-area boundaries, orientation, long text, errors and tap targets.

Every mutable control must pass: **correct active machine and chat → one request per intentional action → immediate pending feedback → desktop acknowledgment → authoritative state reconciliation**. Inject late replies, background/resume, network loss, and A→B→A navigation; maintain uncertain status where completion cannot be proved. Do not use a real user project for delete, revocation or rewind tests.

## Device coverage strategy

The primary **critical journey** (pair, host/chat selection, send with ≥3 deltas, stop, reconnect, observed desktop state) must pass in both **direct and linked** transport on an identified native build. Repeat on compact/base/Pro/Pro Max iPhones and mini/standard/Air/11-inch/13-inch iPads where hardware or simulators are available. For each iPad, include full-screen and resized/split window with keyboard. Deep child-control cases may use representative phone/tablet configurations, with targeted boundary sweeps on remaining devices; all distinct layout breakpoints require native inspection. Include a supported minimum-iOS runtime and real hardware before release. Duo outer/inner transitions remain **not verifiable** without suitable device/simulator, and must never be inferred from viewport resizing.

**Performance acceptance:** collect ≥30 timestamped samples for touch feedback, first stream output, stop and reconnect on an identified build/host (report p50/p95); profile large transcript scrolling, re-render bursts, keyboard transitions and retained memory. Complete a real **60-minute** native mixed workload, including background/resume, disconnected transport and idle cleanup, with raw trace and build/device information. A quick test or still-running soak is not a pass.

## PAR-02 repaired in source: linked note deletion

**PAR-02 — P1, fixed in source and automated tests; native/desktop still open.** Mobile `src/control/remoteClient.ts` sends `x-kory-note-revision` for deletion; `src/control/linkedRemoteTransport.ts` now forwards a narrow numeric `noteRevision` only on exact `DELETE /api/notes/:id` with no query. Desktop `backend/src/devices/workbench.ts` validates scope, route and positive safe integer, then reconstructs the revision header using receiver-owned authorization. Regressions in mobile `tests/remote-client.test.ts` and desktop `backend/src/devices/workbench.test.ts` include direct/linked parity, malformed revisions and rejected header injection. Regression was red before patch and green afterward. Mobile full check: **131/485/25**; desktop isolated workbench: **10/66**; Expo doctor: **21/21**; backend typecheck clean. **Next:** native direct/linked delete and stale revision conflict on disposable desktop notes; independently inspect stored notes on the desktop. Do not mark end-to-end fixed until then.

An earlier review refusal for a source read is historical; subsequent separately authorized source inspection, patch and automated verification succeeded. Native action refusals remain separate and must be handled according to the current tool result.

## Current evidence and next gates

- `INSPECT-01`: isolated provider tests reproduced stale host/chat private inspections (3 red before fix); owner, selection version, session/project checks now guard replies and auth renewal. Focused child **18/66**, latest full check **131/485/25** pass. Notes/Git/agent native interaction and desktop readback remain open N/H.
- Earlier `npm run check` **PASS: 131/485/25**, TypeScript and Expo lint. Current 145/550/31 is at the top; native and desktop acceptance open.
- First P0 remains a **fingerprinted current native build** connected to a disposable authorized desktop. Capture direct and linked send→stream→stop→reconnect with the desktop state independently checked. Previous native tool actions were refused; do not replay them without the required authorization.
- Next complete the 19 child-control kinds and 15 route entries, then device/window, VoiceOver, profiling/soak, signed release and physical-device gates. Track each pass/fail with an evidence link and retest after patches. No device class is fully certified yet.
