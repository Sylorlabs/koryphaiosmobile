# Settings: implementation, regression and native visual checkpoint

October 10, 2026 (Pacific time). This is an **incremental audit/fix** checkpoint, not native feature certification.

## Changes checked

- `src/components/SettingsView.tsx`: short, description-free toggle/select controls share a row with their label on a phone only when the available window is at least 375 points, font scale is at most 1.15, and the label is at most 27 characters. Narrow windows, long labels, descriptions and larger text scale keep stacked controls. Structured value editors remain stacked.
- `KorySwitch` uses a `Pressable` with a minimum 48 × 44 point target; the visible switch indicator alone is smaller. The source target size has automated coverage, but actual touch acquisition and VoiceOver focus have not been tested.
- Reset/Delete and other host actions distinguish an accepted request from a completed desktop effect. Their existing confirmation, in-flight and uncertain-result locks prevent an unverified second action until explicit review. Other Settings edits preserve local drafts and guard stale host responses.
- `tests/settings-view.test.tsx`: focused regression coverage for compact/long/description/narrow/Dynamic Type layout, touch target, accepted-action feedback, reset/delete uncertainty, drafts, conflicts, host A→B→A and stale acknowledgements.

## Checks actually completed

| Check | Result | Meaning |
| --- | --- | --- |
| `KORYPHAIOS_SETTINGS_TEST_CHILD=1 bun test tests/settings-view.test.tsx` | **18 pass, 116 expectations** | Component/state mock regressions pass. |
| `npm run check` | **96 parent tests pass, 0 fail, 341 expectations, 16 parent files**; TypeScript and Expo lint pass; exit 0 | Current mobile source validation passes. The full run counts Settings, Activity and Machines child wrappers as one parent case each; do not add child totals. |
| Expo Doctor | Previous **21/21**, not rerun after this visual/layout edit | Previous dependency/config check; not a fresh release-candidate build gate. |

## Inspected native screenshots

1. [iPhone 17 Pro — Agent behavior after row-layout edit](pro-post-fix-20261010.png). The visible short dropdowns/toggles are on the same row as labels; longer editors remain below labels. Controls visible in this screenshot do not overlap or clip. The screenshot only covers the visible scrolled portion.
2. [iPad mini A17 Pro — Agent behavior in a narrow floating window after edit](mini-post-fix-20261010.png). Labels and controls align in the available width, with no visible clipping in the captured area. The duplicated page/header title is visible and remains a minor information-hierarchy review candidate; it is not a demonstrated functional failure.

The earlier [phone](pro-latest-run.png) and [mini](mini-latest-run.png) screenshots were captured before the latest label-length condition and must not be presented as post-change validation. Both inspected images come from iOS 27 **development simulator** sessions; they do not establish a named installed binary/source fingerprint, actual tapping, keyboard resize, Dynamic Type, VoiceOver, signed-build smoothness or desktop-host effects.

## Open native journeys / acceptance

- On a named build and controlled host, tap a switch and dropdown, edit multiline and number fields, scroll with keyboard up, verify Save/Cancel/conflict and reconcile the value on desktop. Recheck long labels at large Dynamic Type and in narrow iPad windows.
- On a disposable controlled host, trigger a Reset/Delete failure or unknown acknowledgement in **direct and linked** modes, verify subsequent taps stay locked until explicit review, then inspect the real host state. Never infer execution from `accepted` alone or repeat an uncertain mutation automatically.
- Verify setting state survives host switches A→B→A, disconnect/re-pair and remount. Record actual screen announcements and focus order with VoiceOver.

**Closure:** `SET-01`–`SET-04` have automated coverage and remain **native-open** (including P0 `SET-03`). `SET-05` is **source-and-visual repaired**, with **native interaction / accessibility open**. No Settings issue is considered end-to-end closed.

## Follow-up: large accessibility text and screenshot provenance

On October 10, the iPad mini A17 Pro simulator was set to `accessibility-large` and the [fresh windowed capture](mini-accessibility-large-recheck-20261010.png) was visually inspected. In the visible Agent behavior section, large labels and inline controls are readable and do not visibly overlap. The bottom of the content is obscured by the Expo **"Open debugger to view warnings"** development banner, so the screen has **not** passed a full-screen Dynamic Type or usable-controls review. The warning must be diagnosed separately; it cannot be dismissed as proof that the form is usable behind it.

The [Pro accessibility capture after relaunch](pro-accessibility-large-relaunched-20261010.png) shows a **different foreground "Detail A" fixture**, despite the reported app launch. It is **rejected as Koryphaios evidence**. The earlier Pro large-type capture has the same invalid provenance. Resolve foreground window/app identity before claiming a Pro large-type pass; the fixture text collision is not attributed to Koryphaios. Both the iPhone 17 Pro and iPad mini simulator content sizes were then restored to `large` and **verified** with `simctl ui` queries. No on-device touches or host setting changes were performed during these captures.

Follow-up read-only simulator inspection confirms **both** `com.koryphaios.mobile` and `com.kory.iosfixture` (`KoryIOSFixture`) are installed on the Pro; the Koryphaios bundle reports version `1.0.0` / build `1.0`, and `launchctl` listed its UIKit application process. This explains a possible fixture-versus-target app mix-up but **does not establish the active foreground window**, screenshot-to-source correspondence or a current JS bundle fingerprint. Do not terminate another testing app or promote the rejected Pro capture into evidence without first isolating the window/session.
