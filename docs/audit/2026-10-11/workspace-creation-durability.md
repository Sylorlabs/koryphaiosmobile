# CREATION-DURABLE-01 — Goals and Checklists

**October 11, 2026 · Source + focused tests repaired · Native/host/physical open · release NO-GO**

## Actual bug and desktop authority

The production Goals and Checklists panels cleared the user's objective/title immediately upon tapping **Create** and allowed new requests without awaiting the original result. A lost response or stale refresh could therefore destroy a draft and allow duplicate goals/checklists. A host switch while a secure save was pending could also redirect a later attempt without explicit context validation.

Authoritative desktop routes `backend/src/routes/v1/goals.ts` and `backend/src/routes/v1/checklists.ts` return `{ok:true,data:{id,...}}` from their creation endpoints. The mobile adapter had thrown away those exact IDs, leaving the UI unable to distinguish a newly created item from an older same-title entry.

## Repair

1. `src/control/remoteClient.ts` now returns the desktop's actual created ID in `result.data.id` for both `goal.create` and `checklist.create`, on direct and linked transports. A missing/blank ID is never fabricated.
2. `src/components/useReviewedWorkspaceCreate.ts` reserves an in-memory review synchronously before persisting a strict host-and-action-scoped review lock in iOS secure storage. The host command is not dispatched until the save succeeds. This prevents repeat taps, across remounts, and retains the original input while pending or uncertain.
3. The draft clears and Create unlocks automatically **only** after a current host snapshot contains the exact created ID with matching kind, title/objective, scope and project/chat identity. Edits made after sending remain intact, even if the original draft text is edited again. Lost/rejected/incomplete responses stay locked; users see what to check on the desktop and may explicitly acknowledge their review to allow another attempt.
4. A delayed secure write checks that the machine, project, chat and scope selection have not changed before issuing the command. Host A/B locks and in-process creation drafts are independent. A cold restart restores the earlier submitted text from the saved review label, while retaining a review lock until independent confirmation or deliberate user review.
5. `src/control/workspaceCreationReviewStorage.ts` stores long Unicode review labels in small percent-encoded Keychain chunks, publishing the manifest last. It respects Expo SDK 57's warning that some iOS versions historically refused Keychain values above roughly 2 KiB. Partial writes, missing chunks, failed reads and failed deletes must block another mutation.

## Reproducible evidence

| Check | Result |
| --- | --- |
| New isolated rendered create-flow regressions | **6/6 RED** before source repair; expanded **10/10 PASS, 52 assertions** after |
| Secure storage short/long/corrupt/failed-write/delete | **4/4 PASS, 30 assertions**; long Unicode payloads tested with a 2048-byte fake Keychain limit |
| Real RemoteClient direct + linked transport contracts | Initially 4 new receipt cases failed; after matching server envelope **151/151 PASS, 511 assertions** |
| Existing Goals/Checklists/Git touch-accessibility regression | **4/4 PASS, 49 assertions** |
| TypeScript / Expo lint | **PASS / PASS**, no warnings |
| Expo Doctor | **21/21 PASS** |
| Hermes iOS JS export | **PASS** — 3,703 modules, 24 assets, 7.9 MB; **not** a signed native build |
| Full `npm run test` | **Not rerun.** Previous full-suite result retrieval was blocked by automatic review. Last observed completed baseline remains **155 passing, 2 failing**. |
| Real iPhone/iPad, VoiceOver, direct/linked desktop write/readback, signed TestFlight | **NOT VERIFIED** |

## Native release verification outstanding

On an installed, fingerprinted candidate app and a disposable desktop context, confirm the following on both direct and linked transports:

1. Create Goal and Checklist at Workspace, Project and Chat scopes; independently read the created ID and fields on the desktop; verify draft clearing requires the exact same ID in a refreshed mobile snapshot.
2. Tap twice quickly, delay the host response, interrupt the network after the host accepts, background/kill/reopen, and navigate machine A→B→A. Confirm no duplicate host mutation, preserved draft, saved Keychain review and comprehensible recovery UI.
3. Test offline/error, lost response, missing/mismatched ID, failed secure-storage read/write, explicit manual review and storage clearing; confirm no hidden mutation is resent by the app.
4. Type a long Unicode objective, use Dynamic Type and VoiceOver, test small iPhone and iPad mini split/floating windows with the keyboard up; measure tap response and screen layout.
5. Collect actual host receipts, screenshots, latency and signed TestFlight proof, plus long-run/reconnect test results before closing this issue. The live incremental Workspace stream P0 remains unresolved.

No real user host goal or checklist was created, modified or deleted during these tests. This is S/T evidence, not native/host/physical proof.
