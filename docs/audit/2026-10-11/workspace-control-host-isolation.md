# CONTROL-CONTEXT-03 — Destructive confirmations and unsent Workspace drafts

**October 11, 2026 · source/focused test PASS · native/host/physical OPEN · release NO-GO**

## Reproduced defect

Goals `Confirm delete` was armed using only `goal.id`; Checklists `Confirm delete` used component-local boolean state; Git `Confirm` restore and `Confirm discard` used only file paths or task IDs. The same panel remained mounted when the user switched machines, projects or chats. If two machines exposed the same goal/checklist ID, relative file path or worktree task ID, the second press on a different machine could dispatch a destructive command without a fresh confirmation. Git's editable remote URL also followed the user between machines, risking accidental edits on the wrong host.

An isolated rendered regression exercised identical identifiers across host A→B→A. The four cases were **4/4 failing before repair**; only simulated handlers were called, with no host deletion, Git restore or discard.

## Repair

- The actual `WorkspaceControlPanel` now keys Goals, Checklists and Git child panels by the exact selected machine ID + project ID + chat ID. A context switch resets destructive two-step arm state and local Git inspection/revision state before the new host's controls can be used.
- Unsubmitted Git commit/branch/remote URL inputs are cached by context, avoiding silently moving A's draft onto B while preserving A's input when returning. Goal checklist draft text is also scoped by context **and goal ID**, rather than shared across every expanded goal. Checklist title and item drafts are cached by exact context/checklist ID.
- A creation attempt still in the durable Keychain-save stage aborts dispatch if its originating UI unmounted during a selection change. Its persisted review lock remains for explicit review; this prevents an old screen from sending a create request into the new host.

## Checks

| Check | Result |
| --- | --- |
| New host/chat confirmation + draft isolation regressions | **4/4 RED** before repair, expanded **6/6 PASS, 36 assertions** after |
| Existing durable Goal/Checklist creation regressions | **10/10 PASS, 52 assertions** |
| Existing 44-point touch/accessibility regressions | **4/4 PASS, 49 assertions** |
| TypeScript / Expo lint | **PASS / PASS**, clean |
| Fresh iOS Hermes JS export after context fix | **PASS**, 3,703 modules, 24 assets, 7.9 MB; JavaScript packaging only |
| Full suite | **Unverified** after the earlier refused aggregate result poll; last observed completed baseline was **155 pass / 2 fail** |
| Native host switching, actual destructive effects, VoiceOver, physical/TestFlight | **NOT VERIFIED** |

## Follow-up device/desktop acceptance

On a named, fingerprinted mobile build, create disposable equal-named goals, checklists and Git paths on two isolated hosts. Arm Delete/Restore/Discard on host A, navigate A→B→A and across chats while keeping controls visible, then attempt an action. Confirm **zero** cross-host destructive commands or duplicate confirmations using independent desktop logs/readback. Repeat with rejected requests, network loss, late responses, remount and background/force quit. Verify unsent draft restoration and no copied fields on narrow iPhone, iPad mini split window and large iPad with VoiceOver. This source test does not establish native touch feel or live desktop authorization correctness.

The earlier unresolved incremental streaming, two full-suite failures, timing/soak, and device matrix remain release-blocking.
