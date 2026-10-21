# Attention control and linked snapshot checkpoint

Date: October 9, 2026 (America/Los_Angeles). **Not release-ready.** This record is a source/edit checkpoint, not a passing test report.

## Authoritative observations

- Re-read the complete goal objective, mobile AGENTS.md and package.json. Expo is ~57.0.27; React Native is 0.86.3; React is 19.2.3. No dependency or native API change was made in this continuation.
- Git status still lists essentially the whole mobile project as untracked. Existing work was preserved; no reset, clean, commit, publication or desktop edit occurred.
- Read the current provider, response store, reducer, direct/linked transports, new attention-dispatch integration tests and remote-event tests. The earlier dispatch patch exists but has no subsequent passing execution in the available evidence.
- Re-read retained logs: attention-regressions-before.log ends with 23 pass, 6 fail, 77 expectations, 29 tests across two files and BUN_EXIT_CODE=1. attention-regressions-after.log ends with 30 pass, 0 fail, 105 expectations, 30 reported tests across three files and BUN_EXIT_CODE=0. One reported test is an isolated provider wrapper; do not invent its inner count. These are earlier runs, not current validation.

## Current execution attempt

The requested command was:

```sh
set -o pipefail
bun test tests/attention-responses.test.ts tests/remote-events.test.js tests/attention-dispatch.test.tsx tests/control-provider.test.tsx 2>&1 | tee docs/audit/2026-10-09/attention-dispatch-current.log
```

The tool returned: “This tool call was blocked by OpenAI because we couldn't determine the safety status of the request.” The command did not execute. No native command call ID, exit status or process session was returned; the intended output path is not evidence of a run. This is a current refusal of the test command. The desktop-read refusal in the inherited checkpoint is historical, not a new failure of a successful mobile read.

The user was asked to confirm running local mobile tests, typecheck and lint, and reading desktop review handlers and related tests. No confirmation was available at the time of this checkpoint. Do not retry the refused actions through another tool. Independent mobile source/test/ledger edits succeeded.

## Prepared repair: linked snapshot suppression

The inspected linked transport used one eventRevision for every session event. An unrelated run/output update or another chat's attention event arriving during open_chat prevented both question and review snapshot fields from loading. It could also suppress authoritative absence during recovery.

Changed src/control/linkedRemoteEvents.ts to use separate question/review guards, advanced only for valid attention prompts or recognized resolution statuses in the active session. Run/output events, other chats and malformed/unknown-status events cannot advance these guards. Existing open generations, monotonic run revisions, explicit-null absence and protections against stale resurrection remain in source.

Added ten regression cases in tests/remote-events.test.js covering unrelated run/output/chat traffic, malformed and unknown-status events, newer question/review versus old or absent snapshots, known resolutions with the other attention kind still loading, authoritative absence preserving unconfirmed text, and A-B-A late opens. Corrected the earlier stale-question fixture to carry a real answered status and matching questionId instead of relying on a malformed resolution event.

**Validation: not executed.** The patch application succeeded and the changed production source was read back. That is not runtime proof. Do not report the new cases as passed or reuse the older 30-pass result for this source.

## Next required evidence

1. After confirmation, run the store, real transport, isolated dispatch and provider suites to terminal exit. Inspect actual failures; retain wrapper-versus-inner counts. Then run full npm run check, including typecheck and lint.
2. After confirmation, read desktop instructions and review handlers/tests; coordinate host-side identity enforcement. Sending a reviewId is insufficient without host validation.
3. Implement and verify discoverable, bounded, origin-scoped saved-response recovery across termination/restart. Current memory-only retention and unguarded key decoding remain open.
4. Fetch and record matching SDK documentation before native API edits. Revalidate current host/app builds and execute the full direct/linked native journeys, device/window/accessibility/permissions matrix, screenshot automation, profiling and actual 60-minute native workload from the objective.

The readiness, execution-plan, parity, device and UX ledgers were updated to distinguish historical observations, prepared patches and missing runtime evidence. Unsupported claims of prior Expo documentation retrieval and official “iPhone Duo” verification were removed. No fresh UI/device/performance evidence or release action occurred. The full objective remains active and incomplete; this checkpoint does not establish a whole-goal impasse.
