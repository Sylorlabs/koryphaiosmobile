# Workspace Goal and Checklist deletion — durable uncertainty guard

**2026-10-11 PT · `CONTROL-DELETE-DURABLE-04` · focused source/test pass · release NO-GO**

## User impact and source finding

Goals and Checklists used two-tap Delete / Confirm delete controls but cleared confirmation before sending the desktop DELETE. A lost response, screen remount, force quit, or host A→B→A could permit another destructive attempt. A Goal deletion also stops the desktop goal driver. An accepted HTTP response cannot be treated as independent desktop-effect proof.

## Repair

- `src/components/useReviewedWorkspaceDelete.ts` adds a process-shared review lock scoped to machine, transport, and resource kind. Its saved label identifies the exact Goal/Checklist ID. It allows only one pending deletion per resource kind per host until reconciled or explicitly reviewed.
- `src/control/workspaceDeletionReviewStorage.ts` uses strict iOS secure Keychain persistence. The review is reserved immediately and saved **before** the remote command. Failed/delayed storage, host/chat changes and unmounts prevent dispatch. No ambiguous result is automatically replayed.
- `src/components/WorkspaceControls.tsx` disables repeats and surfaces the saved item and recovery copy. Acknowledgement automatically clears the lock only after a **different online snapshot** from the original machine/project/chat omits the exact item ID. Stale, offline or different-chat snapshots cannot clear it; the user may manually release after reviewing the desktop.
- Existing drafts and unrelated workspace controls are retained. No real desktop records were deleted during verification.

## Red-to-green evidence

`tests/workspace-delete-safety.test.tsx`: **0/7** initial child cases passed before repair; expanded child run now **9/9 passing, 49 assertions**. Covers repeat attempt, lost reply, remount, host A→B→A, offline/changed-chat snapshots, strict Keychain read/write/clear failures, delayed write during host switch, exact-ID reconciliation, and manual review.

Adjacent parent wrappers passed afterward: host/draft isolation **1/1** (child 6/6), creation **1/1** (child 10/10), touch accessibility **1/1** (child 4/4). Expo lint passed. One TypeScript check completed successfully before a later lint-only queue-microtask fix; the subsequent TypeScript result poll was refused by automatic review, so the final TypeScript result is **unknown**. Last fully observed aggregate remains **155 passes, 2 failures** (Notes expectation and Workspace native-storage integration harness). All evidence here is source/mocked UI; native, direct/linked host effects and signed physical-device gates remain unverified.

## Five-step UX review (source-based, no fresh screenshots)

1. **Open Goals/Checklists:** the machine/chat controls the panel. Native narrow/wide layout remains unchecked.
2. **Tap Delete:** first tap arms one item; switching context clears the confirmation. Source regression passed.
3. **Tap Confirm delete:** immediate disabled state, durable review before dispatch. Source regression passed; validate actual touch and screen-reader announcement on an installed device.
4. **Await desktop result:** acceptance displays a pending verification message. A remote timeout cannot authorize a retry. Source regression passed.
5. **Recover uncertainty:** saved item/status survives remount, with a visible manual desktop-review unlock. Source regression passed; actual Keychain cold restart and native UX remain unverified.

## Release closure

**N:** native touch, VoiceOver, Dynamic Type and cold-restart review on iPhone/iPad. **H:** disposable Goal/Checklist direct-and-linked delete, goal-driver stop, independent exact-ID readback, no duplicate request. **P:** signed TestFlight/physical devices, sustained performance and background recovery. Full workspace `stream.delta` rendering remains open **P0**; release **NO-GO**.

Automatic review refused a combined read-only provider/test inspection and a subsequent TypeScript result poll. Neither was retried. Equivalent attempts require explicit confirmation and platform approval.
