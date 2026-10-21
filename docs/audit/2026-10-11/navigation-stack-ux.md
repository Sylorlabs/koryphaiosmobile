# Adaptive section navigation — October 11, 2026

**Ticket:** `NAV-STACK-01` · P1 UX/performance · S/T fixed · N/H/P not verified.

## Defect and source comparison

`src/components/AdaptiveShell.tsx` is the shared wide-screen shell and displays Workspace, Agents, Activity and Settings in a rail once window width reaches 820 points and height reaches the medium breakpoint. It used `router.push(href)` for every tap, including the currently selected section and navigation back from a nested detail page. Expo Router SDK 57 documentation states `push` explicitly adds a stack entry, while `navigate` can reuse/unwind to an existing route. Repeated taps could therefore create needless history and surprising Back behavior, undermining fast tablet control.

## Repair and proof

- Current exact-root taps are no-ops, including `/` as a Workspace alias.
- Changing sections uses `router.navigate`, which reuses existing stack destinations where present.
- Tapping Agents from `/agents/[id]` still returns to the Agents section root.
- Rail selection is announced to assistive technology via `accessibilityState.selected`.
- Five component tests cover these cases, plus compact iPhone width **393×852**, narrow iPad window **780×620** (Back rather than rail), and wide iPad window **960×800** (rail). Test was **0/3 red before the repair**, **5/5 green with 17 assertions after**, in `tests/adaptive-shell-navigation.test.tsx`.

The iOS JavaScript export completed with **3,701 modules / 24 assets / 7.9 MB Hermes bundle**. Independent TypeScript and Expo lint checks pass; Expo Doctor **21/21**. Latest full suite **155 passed / 2 failed / 570 assertions / 40 files**, with previously known Notes and Workspace-test harness failures.

## Remaining checks

Source assertions confirm which controls render and which router method they call, **not actual navigation transitions or device feel**. Verify repeat section taps, native swipe-back, nested detail exit, focus retention, software/hardware keyboard, VoiceOver selected state, 44-point touches, sheet state, portrait/landscape and iPad resize mid-interaction on a fingerprinted installed iPhone and iPad build. Measure tap-to-render p50/p95. Repeat on iPhone Duo once an appropriate SDK/simulator or physical device becomes available. Preserve the app's unsent draft when switching sections.

No new simulator screenshot or live native interaction was captured during this source-level repair. This ticket and the overall release remain **N/H/P open; NO-GO**.
