# Command acknowledgement feedback: October 10 checkpoint

## Finding `CMD-01` (P1)

The shared command lifecycle marked a host's `accepted: true` response as `success` before the follow-up host snapshot completed. `CommandFeedback` consequently displayed a green check. Even a successful snapshot read only confirms that current state was loaded; it cannot establish that every requested side effect completed. When a later selection superseded the original reconciliation, the old lifecycle could also attach `reconciledAt` despite having skipped the read.

## Implemented

- The lifecycle now emits `accepted` as a distinct, neutral informational state. It says that the host received the request, then updates the message when a snapshot was actually loaded. `success` remains reserved for future callers with genuine outcome verification.
- The provider returns `false` when a stale host or selection prevents reconciliation, so that outcome does **not** receive a false `reconciledAt` timestamp or a "state loaded" message.
- `CommandFeedback` uses a neutral circle for `accepted`, rather than a green completion check. It auto-dismisses a refreshed accepted notice after six seconds; errors and uncertainty stay visible. The existing warning for accepted requests whose state refresh fails still cautions against blindly repeating a mutation.
- A focused regression now asserts that stale-selection reconciliation produces neither `success` nor `reconciledAt`, and the existing timing/concurrency tests expect acknowledgement rather than completion.

## Validation

| Layer | Evidence | Result |
| --- | --- | --- |
| Focused lifecycle | `bun test tests/command-lifecycle.test.ts` | **9 passed, 36 assertions, 0 failures**. |
| Full source gate | `npm run check` | **97 parent tests, 348 assertions, 16 files; TypeScript and Expo lint passed**, exit 0. |
| Dependency/config | `npx expo-doctor` in this October 10 continuation | **21/21**; audit separately reported 29 advisories, still under triage. |
| Native UI/host outcome | No accepted current screen/host-effects replay for this feedback change. | **Open**. Dev-client UI, live host reconciliation, VoiceOver, direct and linked paths still required. |

SDK 57, its current documentation index and React Native 0.86 accessibility guidance were reviewed before this UI change. No new native dependency was added. No actual desktop mutation, native stream, signed distribution or device support was certified by this fix.
