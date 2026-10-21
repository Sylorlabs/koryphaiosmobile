# Settings action-kind safety checkpoint — 2026-10-10

## What changed

A live desktop settings snapshot can change a field from a regular setting into a remote action while retaining the same field ID. The prior readiness flag could carry over from the harmless field before saved action-review locks had been read. That could permit dispatch while durable uncertainty state was unknown.

- `src/components/SettingsView.tsx` now binds saved-lock readiness to the current host/field/kind/action-ID identity. Every new action identity waits for a successful secure-storage read.
- A failed read clears action readiness and exposes a retry. Storage failure must not be interpreted as an empty action lock.
- `SettingControl` instances are keyed by host, field, kind and action IDs. A kind change resets local pending/edit state instead of inheriting state from the previous control.
- The new regression in `tests/settings-view.test.tsx` changes a toggle to a remote Reset action with an intentional saved-lock read error, confirms the action is disabled and emits no command, then retries successfully. The test does **not** execute the remote Reset.

## Evidence and limitations

The latest completed focused Settings test passed **24 tests, 148 assertions, 0 failures** (`KORYPHAIOS_SETTINGS_TEST_CHILD=1 bun test tests/settings-view.test.tsx`). The latest completed full `npm run check` passed **100 parent tests, 369 assertions across 17 files, 0 failures**, followed by passing TypeScript and Expo lint. These results are automated/source evidence, not a device or desktop-action certification.

The [new iPad mini screenshot](../native-followup/mini-current-after-settings-lock.png) was captured and **visually inspected**. It shows the *Workspace* empty state, a visible **Connected** indicator for Koryphaios backend, an Open chats button, and the disabled composer without a selected chat. The screenshot does **not** show Settings, exercise the new action-kind code, prove its native bundle/source fingerprint, demonstrate a tap or test actual streaming. It cannot close the native Settings gate.

## Closure for SET-06 and SET-03

Use a named installed native build and a disposable authorized direct host and linked host. With a controlled settings fixture, change the same setting ID from a normal control to an action while the saved-lock read is pending or fails. Verify it stays disabled, Retry rechecks storage, old callbacks cannot issue the action, and previously uncertain destructive actions remain locked across navigation, A→B→A and app restart. Then explicitly authorize and execute only reversible test actions, inspect the desktop's actual state and check failure/unknown acknowledgments never trigger an automatic repeat.

**Status:** SET-06 automated pass; **native action-kind/recovery remains open**. SET-03 remote-action integrity remains a P0 release gate.
