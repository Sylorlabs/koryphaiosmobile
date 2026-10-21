# STATE-01 — workspace control scope isolation

Date: October 10, 2026, America/Los_Angeles. Priority: **P1**. Status: **fixed in source, automated pass (S/T); native/device and desktop-effect checks open (N/H/P)**.

## User-visible problem and cause

When a user switched Koryphaios hosts, projects or chats while inside an advanced control, React retained component-local state for fifteen controls. Old details, pending indicators and local selections could therefore remain on screen under a new destination. The four earlier-keyed modes (`session`, `workflows`, `history`, `computer`) remounted properly, but `commands`, `memory`, `notes`, `teams`, `modelSharing`, `mcp`, `media`, `billing`, `workspace`, `preferences`, `responseStyle`, `skills`, `goals`, `checklists` and `git` did not. The three `WorkspaceControlPanel` kinds (`goals`, `checklists`, `git`) also reused the same component instance when switching kind.

## Reproduction and repair

- Added `tests/control-scope-remount.test.tsx`, which renders the actual outer controller with isolated stateful stand-ins for all nineteen child modes. It checks steady-state preservation, host A→B→A, project/chat changes, explicit route-session changes, and panel-kind changes.
- **Before fix:** four modes passed, seventeen tests failed (17/21 failing). The earliest failure showed `commands` keeping the same component instance after host A→B; billing, Notes, Git and other unkeyed modes failed similarly.
- **Source fix:** `src/components/MobileWorkspaceControlView.tsx` uses one keyed child component for every mode. The key includes control kind, paired host URL and ID, selected snapshot machine, active project, active chat and explicit route chat. React disposes the old subtree and mounts a fresh control on any such transition, while retaining state during an unchanged destination.
- **After fix:** focused isolated child **21 pass / 117 assertions**. Full mobile `npm run check` **132 pass / 486 assertions across 26 files**, `tsc --noEmit` and `expo lint` clean. `npx expo-doctor` **21/21 passed**. No iOS build was signed or released by this change.

## What remains to certify

1. On identified iPhone and iPad native builds with two **disposable** desktop hosts, enter Billing, Git, Notes, Teams, Skills, Commands and Settings. With a deliberately delayed read, switch host A→B→A, project and chat; verify visible state is cleared and new reads match the selected host and session.
2. Delay **writes** separately. A React remount does not cancel remote operations already dispatched; capture request owner, desktop authorization and ultimate result. Test unknown acknowledgments, rejection and reconnect without cross-host effects or duplicate execution.
3. Run direct and linked variants, confirming source owner, exact session/project, final desktop state and the native recovery message. Check all nineteen modes and route-specific `sessionId` overrides against the acceptance register.
4. Check VoiceOver focus and user edits during deliberate scope switches; the reset must not silently discard an unsent value that should be preserved in a per-destination store. Record any issue separately before signing off the UX.

## Current image evidence

- [iPhone 17 Pro Agent behavior](../native-current/06-iphone17pro-current-20261010.png): simulator renders controls with a development warning obscuring the lower portion. It does not test scope switches or settings saves.
- [iPad mini Workspace](../native-current/07-ipadmini-current-20261010.png): visually inspected floating window, named connected backend, empty-chat guidance, **Open chats** button and disabled send with no selected chat. It does not prove an actual tap, streaming or host operation. These captures predate any fingerprinted native replay of `STATE-01` and do **not** validate the change on device.

**Release gate:** P0 direct+linked native send/stream/stop and authoritative desktop reconciliation are still unverified. `STATE-01` is closed only at S/T, while N/H/P and other open P0 issues keep the release blocked.
