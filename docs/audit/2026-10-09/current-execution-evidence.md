# Audit continuation evidence — October 9, 2026 (Pacific)

The full mobile audit remains incomplete. This pass made no production-code or dependency-version changes. It refreshed dependency and simulator evidence while three read-only requests were refused. Earlier passing tests remain the baseline; they were not rerun or represented as new results.

## Completed checks

| Check | Actual result | Evidence |
| --- | --- | --- |
| Objective, mobile guidance, manifest and ledgers | Read successfully; Expo ~57.0.27, npm lockfile; mobile worktree remains almost entirely untracked. | Native results `b4be3d`, `b949c2`. |
| Desktop root guidance | Read successfully. This does not establish that desktop implementation files were inspected. | `d55959`. |
| Product Design audit guidance and preflight | Audit, user-context, critical-overrides and framework read. Preflight exited 0 and reported no saved user-context file. | `8b647d`, `fd74a3`, `483c4e`. |
| Expo Doctor | `npx --yes expo-doctor`: 21/21 checks passed, exit 0. | Started `dd51e2`, session 46788; terminal result `d15d97`. |
| Dependency audit | `npm audit --json`: 29 findings, 18 high and 11 moderate, zero critical. npm exited 1 because findings remain. The wrapper exited 0 after saving/reporting the result. | Started `6142be`, session 44017; terminal result `afd4a0`; [saved JSON](npm-audit-20261010T012132Z.json). |
| Installed dependency paths | `npm ls braces node-forge decode-uri-component uuid --all --json`: exit 0. | `774199`. |
| Simulator inventory | Using a command-scoped Xcode path returned 11 available created devices, all shut down, on iOS 27.0. | `cc0c7a`; inventory summary below. |

The audit JSON's UTC timestamp is October 10 at 01:21:32 UTC, which is October 9 at 18:21:32 Pacific.

## Dependency triage

The 29 package findings cascade from four vulnerable dependencies; they are not evidence of 29 independent exploitable app bugs. Actual reachability still needs inspection and validation.

| Dependency | Installed path / version | Current advisory and next action |
| --- | --- | --- |
| `braces` | Expo → Metro → metro-file-map → micromatch → 3.0.3 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched version. Build-tool pattern processing needs reachability analysis; do not claim it is an iOS runtime exposure. |
| `node-forge` | Expo CLI / code-signing-certificates → 1.4.0 | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) lists no patched version. Inspect signing/verification usage before deciding mitigation. |
| `decode-uri-component` | Expo Router 57.0.25 → query-string 7.1.3 → 0.2.2 | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) identifies 0.5.0 as patched. Investigate URL-decoding reachability and module/API compatibility before an override; native deep-link behavior is unverified. |
| `uuid` | expo-sharing → @expo/config-plugins → xcode 3.0.1 → 7.0.3 | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) identifies fixes including 11.1.1. It concerns v3/v5/v6 with caller-supplied buffers; inspect actual xcode usage before asserting exposure or forcing a major transitive upgrade. |

Advisory pages were fetched during this pass. The npm audit remediation suggestions include Expo 44.0.6, React Native 0.72.17 and Expo Router 58.0.17; these are not a validated SDK 57 remediation. No `npm audit fix --force`, overrides, downgrade or SDK upgrade was applied. A registry-metadata request was refused; installed versions above are established by the successful dependency-tree command, not by that refused request.

## Simulator tooling and available devices

Plain `xcrun simctl list devices available --json` failed with exit 72 (`2b94de`):

```text
xcrun: error: unable to find utility "simctl", not a developer tool or in PATH
```

Inspection (`e22fa1`) showed that the global developer selection is `/Library/Developer/CommandLineTools`. `/Applications/Xcode-beta.app/Contents/Developer/usr/bin/simctl` exists. This command then succeeded without changing the global selection:

```sh
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcrun simctl list devices available --json
```

All rows below were returned as available and shut down under `com.apple.CoreSimulator.SimRuntime.iOS-27-0`:

| Device | UDID |
| --- | --- |
| iPhone 17 Pro | 4ADB02EE-1CC6-4433-909A-1B1F247FA068 |
| iPhone 17 Pro Max | DC6ADB0C-6F28-42A4-AC9B-3E42676272FB |
| iPhone 17e | 356991B9-07A8-45D2-9050-BF2DB0A7E57B |
| iPhone Air | D96D4DA9-4A0F-4FD9-AFA3-D8C642807BB4 |
| iPhone 17 | 06CD5A7B-E8ED-4DC6-8000-A41220BFAB16 |
| iPad Pro 13-inch (M5) | 331D33CB-8128-48E8-AC93-76D36ED2123B |
| iPad Pro 11-inch (M5) | E3392CB7-1A6F-4883-AB6A-59CA6E15ECE4 |
| iPad mini (A17 Pro) | 8A73F4A1-3B96-4CCF-82CD-7CD850EA1F01 |
| iPad Air 13-inch (M4) | F9A9B164-FA21-4D81-A652-ED05A765C73B |
| iPad Air 11-inch (M4) | 0BAB1B37-ACDD-4F7A-A0DF-495723F519BB |
| iPad (A16) | F085809D-92F8-49B8-B7C0-6C5AAB02570A |

No SE or Duo was present among these created available devices. This is not a device-type inventory and does not prove that another device cannot be created or supported by the installed runtime.

Computer Use inventory succeeded and showed no running Simulator. `cua.getApp("Simulator")` returned `Invalid app: Simulator`. The conventional Xcode `Contents/Developer/Applications/Simulator.app` path did not exist in the inspected installation, and Spotlight lookup by `com.apple.iphonesimulator` returned no result (`7e035d`). These observations establish a failed launch/discovery attempt, not that every possible installation path was searched. No device was booted, no app build was launched, and no fresh native screenshot or journey was captured.

Apple's [iPhone Duo page](https://www.apple.com/iphone-duo/) was freshly verified in this pass. It describes inner/outer displays and availability beginning October 23, 2026. Product existence is confirmed; app compatibility remains unverified. The [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) and [Expo documentation index](https://docs.expo.dev/llms.txt) were also fetched successfully.

## Current requests refused before execution

Each of the following requests returned this exact platform message, with no native command ID, session or exit status:

> This tool call was blocked by OpenAI because we couldn't determine the safety status of the request.

1. Read selected ranges of mobile `src/control/remoteClient.ts`; enumerate/search mobile tests and transport parsing/acknowledgement paths.
2. Read desktop status/nested guidance and selected question/review store/protocol ranges; search question callers in desktop components and answer handling in the device store/backend device service.
3. Read npm registry metadata for `decode-uri-component@0.5.0`, `uuid@11.1.1`, and the current `braces`/`node-forge` versions.

These refused actions were not retried through another tool. Confirmation is required before retrying them. The successful objective/guidance reads, preflight, Expo Doctor, dependency audit/tree and simulator inventory above are not blocked actions. Historical error text in earlier documentation is not evidence of a fresh failure.

## Remaining work

The mobile malformed-success and desktop question-confirmation findings remain inherited findings pending current implementation inspection and fixes. Durable attention recovery, complete capability mapping, every-screen UI/UX review, connected direct/linked journeys, device/window coverage, accessibility, measured latency/render behavior, an actual one-hour native workload and distribution gates remain open. The current UI-audit attempt did not capture a flow and is not a completed visual audit. No release or readiness certification was performed.
