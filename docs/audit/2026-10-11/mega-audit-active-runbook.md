# Koryphaios Mobile — complete audit and fix-as-you-go runbook

**Execution date:** October 11, 2026 (America/Los_Angeles).  
**Decision:** **NO-GO** for release. The target is a trustworthy iOS remote controller and live streamer for the authoritative desktop at `/Users/Shared/micah/Documents/koryphaios`.

Use [the command center](../../mobile-audit-command-center.md) as the daily issue board, [the detailed mega audit](../../mobile-mega-audit-plan.md) for the existing feature inventory, [desktop parity](../../mobile-parity.md) for source mappings, [device matrix](../../device-matrix.md) for coverage and [UX audit](../../mobile-ux-audit.md) for screenshots and screen findings. This document fixes their execution order and defines measurable closure.

## Reality at this checkpoint

| Gate | Actual evidence | Status |
| --- | --- | --- |
| Real-time manager output | Direct/linked ordered `stream.delta`, `stream.clear_content`, `stream.complete`; transient transcript merge; selected-host lifecycle preserves event client | **S/T complete; N/H/P open** |
| Streaming tests | `tests/remote-events.test.js` + `tests/live-manager-feed.test.ts`: **57 pass / 239 assertions** | **T pass** |
| Provider/reconnect tests | `tests/control-provider.test.tsx`: **19 isolated child pass / 77 assertions** after replacing obsolete recreation expectation; parent wrapper also passed | **T pass** |
| Workspace UI/harness | `tests/mobile-workspace.test.tsx`: native secure-action storage test mock repaired; **69 isolated child pass / 513 assertions**; parent wrapper passed | **T pass** |
| Connection presentation | `tests/connection-presentation.test.ts`: **5 pass / 18 assertions**; raw `Not Found` gains a recovery path | **T pass** |
| Tooling | TypeScript **pass**, Expo lint **pass**, Expo Doctor **21/21** | **T pass** |
| Fresh iPhone 17 Pro visual | Before/after native simulator images of unreachable host → recovery-first empty Workspace; inspected for clipping and primary/secondary actions | **N-static only**, see below |
| Full aggregate | Started, with an early provider parent failure; its final result poll was refused by automatic approval review. Provider child/parent subsequently passed independently; aggregate was **not** rerun or declared green. Last complete historical checkpoint was **155 pass / 2 fail**. | **T aggregate unknown/RED** |
| Real paired send/stream/stop/reconnect + desktop readback | Current observed native Workspace host was offline with `Not Found`; no live response or desktop effect observed | **P0 OPEN** |
| Signed physical/TestFlight candidate | No exact signed binary, direct+linked acceptance or release provenance collected | **P0 OPEN** |

**Fresh visual evidence:** [before](native-current/iphone17pro-live-audit-20261011.png), [recovery CTA after](native-current/iphone17pro-recovery-after-20261011.png), [final recovery/error copy](native-current/iphone17pro-recovery-copy-final-20261011.png). These are inspected screenshots of a simulator screen, not evidence of a tap journey or working streaming host.

## Non-negotiable completion contract

For every ticket, record **S**: source/desktop contract traced, **T**: meaningful automated regression, **N**: current native app interaction, **H**: independent desktop before/after verification, **P**: signed physical/TestFlight acceptance. Source success cannot substitute for N/H/P.

The issue log must have: stable ID, priority, owning app route/control, authoritative desktop handler, direct/linked scope, reproducible steps, expected/actual, device/build/OS, impact, saved evidence path, fix link and five verification marks. When the test environment cannot run the action, show **blocked** and the precise reason; never silently mark it passed.

**Fix loop for every finding:** (1) reproduce on named source/build and isolate device/host; (2) trace screen → control → adapter → transport → desktop handler → persisted effect; (3) add the smallest failing regression; (4) patch without losing drafts, host identity or security constraints; (5) pass focused test, typecheck, lint and aggregate suite; (6) replay the same native action through **both transports**; (7) compare independent desktop readback, save before/after captures and close marks. Regress a fixed ticket if the source, OS, SDK or host contract changes.

Preserve the untracked/dirty state of both repositories. No `git clean`, resets, overwriting unrelated changes or broad rewrites. Use disposable desktop projects/chats before trying potentially destructive actions. An accepted or lost reply is **not proof of effect**; never automatically replay uncertain non-idempotent mutations.

## Execution waves — repair as findings arrive

### Wave 0 — Baseline and observability (P0)

- Record mobile source fingerprint, exact JS bundle/native app, Expo SDK 57, host fingerprint, selected device, iOS version, direct/linked channel and app authorization state for each trial.
- Run full automated suite to a conclusively collected exit and repair real failures. Confirm old Notes expectation independently and complete combined Workspace/provider harness coverage. The previous aggregate-result retrieval was refused; its result requires authorized re-verification.
- Record every action's timestamps: touch → visible busy/feedback → outbound request → host acceptance → desktop effect → first/middle/final response frames → native paint.
- Gate: no unknown test result presented as success; per-run evidence can be reproduced by another tester.

### Wave 1 — Stream and lifecycle integrity (P0: `REL-01/02`, `STREAM-LIVE-01`)

- On an isolated desktop host, pair directly, select a disposable chat, send once, observe **at least three distinct incremental frames on iOS**, stop, relaunch and reconnect; read the desktop transcript and run status independently.
- Repeat the identical flow on the linked/relay route, including stale cursor, duplicate frame, reordered frame, missing frame/history recovery, epoch rewrite, `stream.clear_content`, completion and restart.
- Reconcile snapshots arriving before/mid/after output. Stress identical previous answers, partial persisted assistant messages, multiple generations, repeated text, long/truncated output, another chat selected and backgrounded streams. Never attach stale output to another chat/agent/host.
- Test foreground/inactive/background, phone lock, Wi-Fi loss/return, switching Wi-Fi↔cellular, host restart, revoked pairing, force quit and a completed old response followed by a new run. Preserve input, cursor and visible history correctly.
- Native UX: token updates must avoid scroll jumps when viewing older messages, preserve follow-tail at bottom, keep Stop visible and avoid one VoiceOver announcement per token.
- Exit: both complete live journeys, no duplicate send or stale cross-host event; **N+H** backed by logs/captures, **P** after signed build.

### Wave 2 — Remote action integrity and irreversible commands (P0)

- Inventory create/select/send/regenerate/stop, Goals, Checklist, Git restore/discard, chat delete-all, Notes Save/Recover/Discard, process control, MCP changes, agent mailbox decisions, approvals/reviews, Settings and grants.
- For each, test quick double tap, host A→B→A, project/chat switching, edited draft during wait, denial, server-accepted but lost reply, late response, force quit/reopen and session timeline rewind.
- Persist review locks before dispatching destructive actions. Release only when exact remote ID/status/revision is independently reconciled, or after explicit desktop review; fail closed on Keychain errors. Never allow a late response to alter the newly selected machine or erase newer text.
- Exit: zero duplicate destructive calls, zero wrong-host mutations, zero lost unsent drafts. Source-focused safety fixes already exist but **N/H/P** remains open for most commands.

### Wave 3 — Full desktop ↔ mobile capability parity (P1; missing core control escalates P0)

- Starting inventory: **141** mobile command-case references, **15** Expo Router routes, **19** Workspace control kinds. These are *inventory entries*, not 141 proven desktop operations.
- For each source reference, map exact HTTP/WS/relay operation, desktop handler/permission check, input schema, output/revision/receipt and unsupported behavior. Compare the running desktop as the authority.
- Families: chats/projects; manager/agents and model selection; tasks, workflows and review/attention; Git, filesystem, terminal/process and computer use; context and files/attachments; voice/audio/images/video; Notes/memory; MCP/skills/providers/OAuth; linked devices and grants; activity, settings, collaboration/history.
- Record disposition: **complete**, **partially implemented**, **intentionally disallowed on mobile**, **missing**, or **broken**. Explicit restrictions must remain enforced; do not broaden privileged backend routes to make parity numbers look better.
- Exit: every in-scope control has direct/linked host-response and persisted-effect evidence, or an explicit missing-feature ticket with severity and release disposition.

### Wave 4 — Complete UI/UX audit (P1)

- Capture every route in entry, empty, loading, connected, error, pending, denied, success and recovery states; before/action/after where interaction exists. On a selected iPhone and iPad, inspect actual saved screenshots and tie findings to a route, step and screenshot.
- One clear primary action per state; visible selected machine/project/chat; immediate feedback; never label REST reachability as live stream connectivity; explain uncertainty instead of false success; no raw native exceptions.
- Inspect keyboard avoidance, multiline composer, Stop reachability, attachments/voice, sheets/back gestures, tab/rail navigation, detail disclosure, long feeds, landscape, narrow windows and modal focus restoration.
- Fresh observed finding fixed: unreachable-host Workspace previously promoted Chats over connection recovery and exposed raw `Not Found`. It now prioritizes **Connection settings**, retains secondary **Open chats**, and shows concise recoverable error copy. The rest of the flow remains untested because the simulator's host is offline.
- Exit: every route has audited screenshots and actual interaction recordings/notes, not just mocked components. No unresolved high-severity navigation, focus, layout or misleading-state defect.

### Wave 5 — Device, rotation, window and OS matrix (P1)

- **Phones:** compact/older supported width, iPhone 17e, 17, 17 Pro, 17 Pro Max and iPhone Air; test portrait/landscape, small and large text, keyboard, safe areas, phone lock and interrupted commands.
- **Tablets:** iPad (A16), mini (A17 Pro), Air 11/13-inch, Pro 11/13-inch; full-screen portrait/landscape, Split View, Stage Manager/windowed resize and hardware keyboard while a stream and remote action are active.
- **Duo:** no iPhone Duo profile in the available Xcode 27.0 / iOS 27.0 runtime. Hold certification until the supported iOS 27.1 simulator/SDK or physical device is available; include outer/inner screens and live folding/resizing without host/input mismatch.
- Expo SDK 57 lists iOS **16.4+** as the minimum. Validate representative supported older iOS/physical devices in addition to the available iOS 27 simulators.
- Exit: every required layout and user journey has a recorded pass/fail, screenshots with OS/device/build provenance, and no unreviewed critical screen class.

### Wave 6 — Measured speed, smoothness and long-run stability (P1)

- Measure **≥30 samples** per critical action for p50/p95 tap-to-feedback, local navigation, command acceptance, delta arrival→paint and full end-to-end completion. Targets: **≤100 ms p95** local action feedback, **≤350 ms p95** local screen/sheet navigation, **≤100 ms p95** received delta→visible text. These are acceptance goals, not currently measured values.
- Profile JS/React rerenders, list/windowing, large messages, image/audio decode, keyboard transitions and backpressure on long streaming responses. Verify when the user is scrolled upward that later chunks don't drag the viewport.
- Run **60-minute** foreground/background/host-reconnect soak on a current build. Track crashes, memory/heap high-water mark, JS frame stalls, battery/thermal symptoms, socket count and duplicate commands. Fix measured hotspots and replay same scenario.
- Exit: real device logs meet targets and no unbounded memory growth or connection leak appears.

### Wave 7 — Accessibility, privacy and production permissions (P1/P0)

- Native VoiceOver walkthrough, logical heading order and focus, Dynamic Type including accessibility sizes, color contrast, Reduce Motion, reachable 44×44 pt targets and meaningful disabled/busy states. Test both compact phone and iPad window.
- Verify Keychain pairing secrets and sensitive draft storage, file/camera/microphone permissions, safe logging, relay authorization, token revocation, device unlink and deletion warnings.
- Exit: no P0/P1 accessibility, identity, privacy or authorization issue; any intentional limitation documented in UI.

### Wave 8 — Candidate and release gate (P0)

- Fresh aggregate tests **green**, TypeScript, lint and Doctor green; iOS production bundle and native EAS build signed from a recorded source fingerprint with correct runtime/SDK. An Expo JS export alone does not establish native validity.
- Repeat direct **and** linked end-to-end journeys on that exact binary. Physical iPhone and iPad/TestFlight acceptance, push/background where supported, crash telemetry, App Store privacy/assets, permission strings and rollback/recovery verified.
- Release only when **all P0 and P1** are closed or explicitly accepted with documented risk, every supported class has N/H evidence, and the signed candidate has P evidence. Until then **NO-GO**.

## Immediate fix queue (do in this order)

1. **P0:** Reconcile stream vs persisted feed across repeated answers/new runs/snapshot races; lock exact session+agent+epoch boundaries, and ensure native stream paints incrementally. Re-run the real direct/linked workflow with disposable host.
2. **P0:** Obtain a complete full-suite result through an approved route. Isolated provider and Workspace harness failures were repaired; Notes legacy expectation and any aggregate interference still require current proof.
3. **P0:** Repeat the actual connected send→3+ deltas→Stop→force quit→reconnect journey, with independent desktop transcript/run confirmation and zero wrong-host effects.
4. **P0/P1:** Expand durable creation/deletion/Notes and grant action testing to real disposable desktop operations, verifying lost-ack and A→B→A scenarios.
5. **P1:** Complete the 141-case desktop parity trace, screenshot each route, then fill the phone/tablet matrix and measure performance.
6. **P0 ship:** Build and test the signed physical candidate; close release register after evidence is complete.

**Status discipline:** Finished source code is **S**, green mocks are **T**, a screenshot is **visual evidence only**, a native tap is **N**, a fresh authoritative desktop readback is **H**, and an exact signed installed candidate is **P**. This checkpoint intentionally remains **NO-GO**.
