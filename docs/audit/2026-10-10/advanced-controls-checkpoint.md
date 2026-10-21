# Advanced controls verification checkpoint — 2026-10-10

The workflow and chat-rename changes recorded in the previous audit checkpoint are **source-level fixes with passing automated regressions**, pending native and authoritative desktop proof.

## Changes reported in the previous checkpoint

- Workflow task descriptions and stage evidence remain intact after a command acknowledgment until desktop inspection confirms the transition; inspection failure preserves drafts and offers refresh.
- Pending operations reject duplicate submissions; late accepted responses from abandoned views cannot act on a new view.
- A chat-title edit in progress is protected from incoming desktop title updates. Genuine conflicts offer **Keep my title** / **Use desktop title**, require resolution before Save, and ignore stale acknowledgments.

## Fresh independent verification

- `npm run check` exited 0: **106 tests passed, 375 assertions, 23 files, 0 failed**; TypeScript and Expo lint passed.
- `npx expo-doctor` exited 0: **21/21 checks passed**.
- These runs do not establish live native input behavior, persistence through a genuine app restart, or desktop-observed mutation success.

## Open validation

1. Start, advance, cancel and retry a workflow from native iOS on a disposable desktop host; inspect exact host/run/stage state after each command.
2. Interrupt the network after an accepted command but before reconciliation; verify drafts/evidence and uncertain-state UI persist without replay.
3. Concurrently rename a chat on desktop and native; verify the conflict controls with the iOS keyboard and final authoritative desktop title.
4. Repeat with rapid host switches, navigation away/back, late acknowledgments, app restart and accessibility text scaling.

Release status: **not ready** until these and the other open P0 gates are verified end to end.
