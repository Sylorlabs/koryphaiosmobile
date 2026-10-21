# Activity control: October 10 implementation and verification

**Status: automated pass; native empty-state screenshot pass; interactive UX and real host behavior open.** This is an implementation and limited native visual checkpoint, not an end-to-end release approval.

## Verified code corrections

1. Process console stdin drafts are keyed by the exact `[machineId, processId]` tuple. Switching processes, closing the console, switching machines A→B→A and unmounting/remounting Activity preserve unsent text independently within the running app. `ProcessInputDraftStore` lives in `ControlProvider`; successful input clears only the exact submitted revision. It is session memory, not disk persistence. Explicit disconnect clears it.
2. Delayed success or refusal updates feedback for the original process and host, including while another console is selected. A pending input can be edited; the old acknowledgment cannot erase the newer revision. The interface distinguishes host **accepted** from console **processed**, with instructions to inspect output before resending.
3. Stop and Restart now reject duplicate in-flight actions and stale machine targeting, await the host result, and show a process-scoped acceptance or uncertain/error message. Restart confirms possible repeated side effects first. No uncertain process mutation is automatically retried.
4. Earlier repairs remain: an actionable empty/offline process state, command launcher draft ownership, cleanup confirmation and failure feedback, stale inspection race isolation, input guards and console read error handling.
5. A disconnect increments a session generation, so an old response cannot erase a re-paired input draft, unlock a new Stop operation, or show stale feedback. Old Restart/cleanup dialogs are invalidated; launcher and cleanup reject negative host acknowledgments. **Launcher ownership, draft revision, Start/Cleanup in-flight locks and feedback now live in the provider store across Activity remounts** (`ACT-04` automated pass, native pending).
6. Activity's online/no-selected-chat empty state explains the prerequisite, keeps Run command disabled, and presents an **Open chats** action. The launcher also offers **Choose chat** without erasing its unsent draft.

## Executed tests

- **Latest** `KORYPHAIOS_ACTIVITY_TEST_CHILD=1 bun test tests/activity-view.test.tsx`: **24 pass, 0 fail, 246 expectations** (standalone child process). The older **16 / 151** checkpoint is superseded. Coverage includes host/process isolation, Activity route remount, provider-owned launcher/start/cleanup, late acknowledgment after remount, edited drafts, failure, Stop/Restart, disconnect/re-pair and disabled command until a chat is chosen.
- `npm run check`: **94 pass, 0 fail, 334 expectations across 15 parent-suite files**; TypeScript `tsc --noEmit` and `expo lint` passed. The parent suite counts one Activity wrapper test, which spawns the 16 child cases; do not add 16 to the reported 94.
- Tests use a mocked React Native Activity screen and command adapter. They do **not** verify real native touch behavior, the installed app build, authenticated process state changes or actual stream execution.
- No new native dependency, Expo config, desktop backend, production deployment or host process was changed by this pass.

## Screenshot evidence and gaps

Previously inspected `../plan-run/pro-activity-after-auth-patch.png` and `../plan-run/mini-activity-after-auth-patch.png` show the **old** nearly empty Activity view before the empty-state repairs. Captures `01-pro-current.png` and `02-mini-current.png` in this folder show **Workspace**, not Activity; they cannot validate the Activity change.

**Fresh after-fix Activity screens, captured and visually inspected October 10:**

1. [iPhone 17 Pro Activity](../current-activity/pro-activity-after-cta.png): route title, selected `Koryphaios · backend` host with green `Host online · live connected`, enabled Clean up, disabled Run command, empty process list with explanatory text and large pink Open chats CTA. In this captured state no control was visibly cropped.
2. [iPad mini A17 Pro Activity, windowed](../current-activity/mini-activity-after-cta.png): the same essential hierarchy and CTA fit in the window without cropped controls or a blue developer refresh strip **in this exact Activity capture**. A visible CTA is not proof that a touch navigated to Chats.

Both screenshots are **native rendering evidence only**. No CTA touch, active process/stdin input, actual host state change, keyboard interaction, orientation resize, VoiceOver check, latency measurement or recovery journey was produced by these captures.

## Native closure checklist

1. Install and fingerprint the updated JavaScript/native build; **tap Open chats, choose a chat and return** on iPhone 17 Pro and iPad mini. Empty-state rendering is captured; next inspect offline, multiple-running and long-output states with keyboard open and window resize; capture before/after screenshots and VoiceOver focus/order.
2. On a **disposable controlled host process**, type unsent stdin, switch process and host, leave Activity and return; prove the correct draft survives. Recreate a delayed success/failure while editing and check actual desktop output/state. Do not use a real user process as a fixture.
3. Confirm Stop/Restart and an intentional denied/timeout action. Compare app status with the host; record accepted versus executed/reconciled outcome and ensure no duplicate execution.
4. Repeat via linked transport after direct mode; preserve both negative and recovery traces. Measure touch/console responsiveness on a release-like build. These gates remain open under `ACT-01`, `ACT-02`, `REL-01` and `REL-02`.
