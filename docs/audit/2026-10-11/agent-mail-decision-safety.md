# Agent mailbox approval safety — October 11, 2026

**Audit item:** `AGENT-MAIL-DECISION-01` · **Priority:** P1 · **Release evidence:** S/T repaired; N/H/P open.

## Desktop contract compared

Desktop `backend/src/kory/services/agent-mail-service.ts` accepts approval and decline only while a message has `pending_approval` status. An approval moves the record toward `queued`/delivery, while decline records `declined`. The mobile UI previously trusted an accepted command response and a best-effort mailbox refresh. A failed, stale or malformed readback could leave the message apparently pending and allow another approval or an opposite decision.

## Repair

- `src/components/AgentsView.tsx` now loads machine/project/chat/message-specific saved review locks before enabling approval controls.
- Before any command, a new read confirms that the exact message is still `pending_approval`. A decision lock is persisted to the device before sending the command. Failure to persist aborts dispatch.
- After a command, the lock remains if acknowledgement, mailbox readback or status verification is uncertain. A valid non-pending status reported for the exact message is required to release it automatically. Invalid mailbox statuses cannot clear a saved review.
- The mobile screen provides immediate pending feedback, a status-review action and an explicit `I checked desktop · Allow retry` action for cases where the desktop still reports pending. The action reads the mailbox again before releasing the saved lock.
- This avoids duplicate approvals across remounts, network failures and A→B→A host switches. No desktop mutation was performed during source tests.
- `AGENT-MAIL-DECISION-02` adds a single in-process review registry shared by all Agents mailbox component mounts. An unfinished Keychain write retains its synchronous reservation when a new screen mounts; the old unmounted request cannot subsequently dispatch. This closes the remaining remount/write race reproduced in this continuation.

## Evidence

Red-before-green reproductions: accepted response with still-pending mailbox; malformed readback releasing a lock; approval of a message already resolved since the last poll.

Focused `KORYPHAIOS_AGENT_CONTROLS_CHILD=1 bun test tests/agent-controls.test.tsx`: **13 passing tests / 134 assertions** after the final code change. Added tests cover remount persistence, explicit review/retry, status readback, malformed data, readback failure, storage write failure, machine A→B→A isolation and immediate pending feedback.

After `AGENT-MAIL-DECISION-02`, the focused child passes **14/14, 143 assertions**; the 14th case was red until the in-process registry was shared. After adding the independent navigation source regression, the complete suite is **155 passed / 2 failed / 570 assertions / 40 files**. The pre-existing failures remain the Notes selection test and the Workspace component integration test; this is **not** a green suite. Typecheck and Expo lint passed after both source changes. Expo Doctor passed **21/21**. The newer iOS JavaScript export succeeded with **3,701 modules, 24 assets, 7.9 MB Hermes bundle**, exported to `/tmp/koryphaios-ios-audit-20261011-navigation`.

## Remaining acceptance gates

- **N**: On a current simulator/native build, review and approve/decline a disposable agent message. Exercise duplicate taps, network drop after desktop acceptance, force quit/relaunch, different machine with the same apparent message identifiers, accessibility and narrow iPad windows.
- **H**: Independently inspect real desktop message ID, status and delivery effects after each direct and linked command. Verify automatic unlock only after a confirmed terminal or other non-pending status, and manual retry only after explicit desktop inspection.
- **P**: Repeat the journey on a signed TestFlight installation and physical iPhone/iPad, including VoiceOver and Dynamic Type.
- This repair does not close the outstanding P0 incremental Workspace streaming defect, the two full-suite failures, device matrix, performance soak or signed release gates. The app remains **NO-GO**.
